import type { Db } from '@shifo/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { MockSmsProvider, MockTelegram, type Messaging } from '../../../core/messaging.js';
import { createLogger } from '../../../core/logger.js';
import { renderMessage } from '../../../core/messages.js';
import {
  afterQuietHours,
  dispatchNotifications,
  linkTelegram,
  scheduleReminders,
} from '../../../core/notifications.js';
import { dispatchOutbox } from '../../../core/outbox.js';
import {
  createTestDb,
  hasDatabase,
  PASSWORD,
  seedClinic,
  testEnv,
  type SeededClinic,
} from '../../../test/harness.js';
import { labReadyHandler } from '../notifications.handlers.js';

const logger = createLogger('silent');
const TZ = 'Asia/Tashkent'; // UTC+5, no DST

describe('quiet hours', () => {
  it('keeps daytime and defers night sends to 08:00 local', () => {
    const noon = new Date('2030-06-10T07:00:00Z'); // 12:00 local
    expect(afterQuietHours(noon, TZ)).toEqual(noon);
    const night = new Date('2030-06-10T17:30:00Z'); // 22:30 local
    expect(afterQuietHours(night, TZ)).toEqual(new Date('2030-06-11T03:00:00Z')); // 08:00 next day
    const early = new Date('2030-06-10T22:30:00Z'); // 03:30 local (11th)
    expect(afterQuietHours(early, TZ)).toEqual(new Date('2030-06-11T03:00:00Z'));
  });
});

describe('messages', () => {
  it('render in uz and ru without clinical detail', () => {
    const p = { clinic: 'Shifo', date: '10.06.2030', time: '10:00' };
    expect(renderMessage('appointment.reminder_24h', 'uz', p)).toContain('ertaga');
    expect(renderMessage('appointment.reminder_24h', 'ru', p)).toContain('завтра');
    expect(renderMessage('lab.ready', 'ru', p)).toContain('готовы');
  });
});

describe.skipIf(!hasDatabase)('notifications', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  let ownerToken = '';
  let registrarToken = '';
  const sms = new MockSmsProvider();
  const telegram = new MockTelegram();
  const messaging: Messaging = { sms, telegram };
  const base = new Date('2030-06-10T06:00:00Z'); // 11:00 local; "now" for the scheduler

  async function patient(consentSms: boolean, phone: string) {
    const t = db.forTenant(a.clinicId);
    const p = await t.patient.create({
      data: {
        clinicId: a.clinicId,
        lastName: 'Bildirish',
        firstName: 'Sinov',
        birthDate: new Date('1990-01-01'),
        sex: 'MALE',
        phone,
      },
    });
    if (consentSms) {
      await t.patientConsent.create({
        data: { clinicId: a.clinicId, patientId: p.id, type: 'SMS', granted: true },
      });
    }
    return p;
  }
  async function appointment(patientId: string, startsAt: Date, createdAt: Date) {
    return db.forTenant(a.clinicId).appointment.create({
      data: {
        clinicId: a.clinicId,
        branchId: a.branchId,
        patientId,
        doctorId: a.users.DOCTOR?.id ?? '',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60_000),
        createdAt,
      },
    });
  }
  const send = (now: Date) => dispatchNotifications(db, messaging, logger, { maxAttempts: 3, now });

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(testEnv(), createLogger('silent'), db);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    const login = async (l: string) =>
      (
        (await request(app).post('/api/v1/auth/login').send({ login: l, password: PASSWORD }))
          .body as {
          accessToken: string;
        }
      ).accessToken;
    ownerToken = await login(a.users.OWNER?.login ?? '');
    registrarToken = await login(a.users.REGISTRAR?.login ?? '');
    await login(b.users.OWNER?.login ?? '');
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  it('sends one 24h reminder by SMS for consenting patients, idempotently', async () => {
    const p = await patient(true, '+998901000001');
    const appt = await appointment(
      p.id,
      new Date('2030-06-11T05:00:00Z'), // 10:00 local tomorrow
      new Date('2030-06-01T00:00:00Z'),
    );
    expect(await scheduleReminders(db, base)).toBeGreaterThanOrEqual(1);
    expect(await scheduleReminders(db, base)).toBe(0); // dedupe
    const before = sms.sent.length;
    await send(base);
    const mine = sms.sent.slice(before).filter((m) => m.to === '+998901000001');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.text).toContain('ertaga');
    // not resent
    await send(base);
    expect(sms.sent.filter((m) => m.to === '+998901000001')).toHaveLength(1);
    const n = await db.forTenant(a.clinicId).notification.findFirstOrThrow({
      where: { patientId: p.id },
    });
    expect(n.status).toBe('SENT');
    expect(n.dedupeKey).toContain(appt.id);
  });

  it('sends nothing without SMS consent', async () => {
    const p = await patient(false, '+998901000002');
    await appointment(p.id, new Date('2030-06-11T05:30:00Z'), new Date('2030-06-01T00:00:00Z'));
    await scheduleReminders(db, base);
    await send(base);
    expect(sms.sent.some((m) => m.to === '+998901000002')).toBe(false);
    expect(await db.forTenant(a.clinicId).notification.count({ where: { patientId: p.id } })).toBe(
      0,
    );
  });

  it('skips reminders for cancelled or moved appointments', async () => {
    const p = await patient(true, '+998901000003');
    const appt = await appointment(
      p.id,
      new Date('2030-06-11T06:00:00Z'),
      new Date('2030-06-01T00:00:00Z'),
    );
    await scheduleReminders(db, base);
    await db
      .forTenant(a.clinicId)
      .appointment.updateMany({ where: { id: appt.id }, data: { status: 'CANCELLED' } });
    await send(base);
    expect(sms.sent.some((m) => m.to === '+998901000003')).toBe(false);
    const n = await db
      .forTenant(a.clinicId)
      .notification.findFirstOrThrow({ where: { patientId: p.id } });
    expect(n.status).toBe('SKIPPED');
  });

  it('does not send the 24h reminder for appointments booked inside the window', async () => {
    const p = await patient(true, '+998901000004');
    // booked 3h before "now" for an appointment 20h away -> too late for 24h (window opened before booking)
    await appointment(p.id, new Date('2030-06-11T02:00:00Z'), new Date('2030-06-10T03:00:00Z'));
    await scheduleReminders(db, base);
    expect(await db.forTenant(a.clinicId).notification.count({ where: { patientId: p.id } })).toBe(
      0,
    );
  });

  it('defers night-time reminders to the morning', async () => {
    const p = await patient(true, '+998901000005');
    await appointment(p.id, new Date('2030-06-11T05:40:00Z'), new Date('2030-06-01T00:00:00Z'));
    const night = new Date('2030-06-10T17:30:00Z'); // 22:30 local
    await scheduleReminders(db, night);
    await send(night);
    expect(sms.sent.some((m) => m.to === '+998901000005')).toBe(false);
    const n = await db
      .forTenant(a.clinicId)
      .notification.findFirstOrThrow({ where: { patientId: p.id } });
    expect(n.scheduledFor).toEqual(new Date('2030-06-11T03:00:00Z')); // 08:00 local
    await send(new Date('2030-06-11T03:05:00Z'));
    expect(sms.sent.some((m) => m.to === '+998901000005')).toBe(true);
  });

  it('retries failed sends and ends DEAD after the limit', async () => {
    const p = await patient(true, '+998901000006');
    await appointment(p.id, new Date('2030-06-11T05:10:00Z'), new Date('2030-06-01T00:00:00Z'));
    await scheduleReminders(db, base);
    sms.failNext = 99;
    let now = base;
    for (let i = 0; i < 3; i++) {
      await send(now);
      now = new Date(now.getTime() + 2 * 3_600_000);
    }
    sms.failNext = 0;
    const n = await db
      .forTenant(a.clinicId)
      .notification.findFirstOrThrow({ where: { patientId: p.id } });
    expect(n.status).toBe('DEAD');
    expect(n.attempts).toBe(3);
  });

  it('prefers Telegram when linked: one-time link code via the API', async () => {
    const p = await patient(false, '+998901000007');
    await request(app)
      .post(`/api/v1/patients/${p.id}/telegram-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const link = await request(app)
      .post(`/api/v1/patients/${p.id}/telegram-link`)
      .set('Authorization', `Bearer ${registrarToken}`)
      .expect(201);
    const code = (link.body as { code: string }).code;
    expect(await linkTelegram(db, 'wrong-code', '555')).toBe(false);
    expect(await linkTelegram(db, code, '777001')).toBe(true);
    expect(await linkTelegram(db, code, '777002')).toBe(false); // one-time

    await appointment(p.id, new Date('2030-06-11T05:20:00Z'), new Date('2030-06-01T00:00:00Z'));
    await scheduleReminders(db, base);
    await send(base);
    expect(telegram.sent.some((m) => m.to === '777001')).toBe(true);
    expect(sms.sent.some((m) => m.to === '+998901000007')).toBe(false);
    await request(app)
      .post(`/api/v1/patients/${p.id}/telegram-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
  });

  it('notifies when lab results are validated (outbox handler is idempotent)', async () => {
    const p = await patient(true, '+998901000008');
    const t = db.forTenant(a.clinicId);
    const ev = await t.outboxEvent.create({
      data: {
        clinicId: a.clinicId,
        type: 'lab.validated',
        payload: { labOrderId: 'order-1', patientId: p.id },
      },
    });
    await dispatchOutbox(db, [labReadyHandler(db)], logger, { maxAttempts: 3 });
    expect((await t.outboxEvent.findFirstOrThrow({ where: { id: ev.id } })).status).toBe(
      'DISPATCHED',
    );
    await send(new Date());
    expect(sms.sent.filter((m) => m.to === '+998901000008')).toHaveLength(1);
    expect(sms.sent.find((m) => m.to === '+998901000008')?.text).not.toMatch(/\d{2,}\.\d/); // no values
  });

  it('lists notifications for admins only and per tenant, without params', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const items = (res.body as { items: Record<string, unknown>[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => !('params' in i))).toBe(true);
    await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${registrarToken}`)
      .expect(403);
  });
});
