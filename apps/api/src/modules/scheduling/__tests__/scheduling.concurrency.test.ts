import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Db } from '@shifo/db';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { createLogger } from '../../../core/logger.js';
import { createSocketRealtime } from '../../../core/realtime.js';
import {
  createTestDb,
  hasDatabase,
  PASSWORD,
  seedClinic,
  testEnv,
  type SeededClinic,
} from '../../../test/harness.js';

describe.skipIf(!hasDatabase)('catalog, scheduling, queue and realtime', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let server: Server;
  let port: number;
  let a: SeededClinic;
  let b: SeededClinic;
  const tokens: Record<string, string> = {};
  let patientId = '';
  let patient2Id = '';
  let screenToken = '';

  const url = () => `http://127.0.0.1:${port}`;
  const auth = (k: string) => ({ Authorization: `Bearer ${tokens[k]}` });
  const login = async (login: string): Promise<string> => {
    const res = await request(url()).post('/api/v1/auth/login').send({ login, password: PASSWORD });
    return (res.body as { accessToken: string }).accessToken;
  };

  // A weekday-independent template: every day 09:00-18:00 (Asia/Tashkent), 20 minute slots.
  const day = '2030-03-12';
  const slotStart = '2030-03-12T05:00:00.000Z'; // 10:00 Tashkent
  const slotEnd = '2030-03-12T05:20:00.000Z';

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    const env = testEnv();
    server = createServer();
    const { realtime } = createSocketRealtime(server, env, db);
    server.on('request', createApp(env, createLogger('silent'), db, realtime));
    await new Promise<void>((r) => server.listen(0, r));
    port = (server.address() as AddressInfo).port;

    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    for (const role of ['OWNER', 'REGISTRAR', 'DOCTOR', 'CASHIER'] as const) {
      tokens[role] = await login(a.users[role]?.login ?? '');
    }
    tokens.REGISTRAR_B = await login(b.users.REGISTRAR?.login ?? '');
    tokens.OWNER_B = await login(b.users.OWNER?.login ?? '');

    const doctorId = a.users.DOCTOR?.id ?? '';
    for (let weekday = 1; weekday <= 7; weekday++) {
      await request(url())
        .post(`/api/v1/doctors/${doctorId}/schedules`)
        .set(auth('OWNER'))
        .send({
          branchId: a.branchId,
          weekday,
          startTime: '09:00',
          endTime: '18:00',
          validFrom: '2026-01-01',
        })
        .expect(201);
    }
    const mk = async (lastName: string, phone: string) =>
      (
        await request(url())
          .post('/api/v1/patients')
          .set(auth('REGISTRAR'))
          .send({ lastName, firstName: 'Test', birthDate: '1990-01-01', sex: 'MALE', phone })
          .expect(201)
      ).body as { id: string };
    patientId = (await mk('Ali', '+998900000001')).id;
    patient2Id = (await mk('Vali', '+998900000002')).id;
    const branch = await db.system().branch.findUniqueOrThrow({ where: { id: a.branchId } });
    screenToken = branch.screenToken;
  }, 180_000);

  afterAll(async () => {
    server.close();
    await cleanup();
  });

  const book = (who: string, body: object) =>
    request(url()).post('/api/v1/appointments').set(auth(who)).send(body);

  it('catalog: price changes never rewrite history and respect RBAC', async () => {
    const svc = (
      await request(url())
        .post('/api/v1/services')
        .set(auth('OWNER'))
        .send({ code: 'CONS', nameUz: 'Konsultatsiya', nameRu: 'Консультация' })
        .expect(201)
    ).body as { id: string };
    await request(url()).post('/api/v1/services').set(auth('REGISTRAR')).send({}).expect(403);

    const p1 = await request(url())
      .post(`/api/v1/services/${svc.id}/prices`)
      .set(auth('OWNER'))
      .send({ branchId: a.branchId, price: '100000', validFrom: '2030-01-01T00:00:00.000Z' })
      .expect(201);
    expect((p1.body as { price: string }).price).toBe('100000');
    await request(url())
      .post(`/api/v1/services/${svc.id}/prices`)
      .set(auth('OWNER'))
      .send({ branchId: a.branchId, price: '150000', validFrom: '2030-06-01T00:00:00.000Z' })
      .expect(201);
    // a price starting before the open one is rejected
    await request(url())
      .post(`/api/v1/services/${svc.id}/prices`)
      .set(auth('OWNER'))
      .send({ branchId: a.branchId, price: '1', validFrom: '2030-02-01T00:00:00.000Z' })
      .expect(422);

    const { CatalogProbe } = await import('./catalog.probe.js');
    const probe = new CatalogProbe(db, a.clinicId);
    expect(await probe.priceAt(svc.id, a.branchId, '2030-03-01T00:00:00Z')).toBe('100000');
    expect(await probe.priceAt(svc.id, a.branchId, '2030-07-01T00:00:00Z')).toBe('150000');
    expect(await probe.priceAt(svc.id, a.branchId, '2029-01-01T00:00:00Z')).toBeNull();

    const list = await request(url())
      .get('/api/v1/services')
      .query({ branchId: a.branchId })
      .set(auth('CASHIER'))
      .expect(200);
    expect((list.body as { items: unknown[] }).items.length).toBe(1);
    // money is a string in JSON
    const prices = await request(url())
      .get(`/api/v1/services/${svc.id}/prices`)
      .set(auth('CASHIER'));
    expect(typeof (prices.body as { items: { price: unknown }[] }).items[0]?.price).toBe('string');
  });

  it('computes free slots from the weekly template', async () => {
    const res = await request(url())
      .get(`/api/v1/doctors/${a.users.DOCTOR?.id}/slots`)
      .query({ date: day, branchId: a.branchId })
      .set(auth('REGISTRAR'))
      .expect(200);
    const items = (res.body as { items: { startsAt: string; free: boolean }[] }).items;
    expect(items).toHaveLength(27); // 09:00-18:00 / 20 min
    expect(items[3]?.startsAt).toBe(slotStart);
  });

  it('rejects bookings outside the doctor working hours', async () => {
    const res = await book('REGISTRAR', {
      branchId: a.branchId,
      patientId,
      doctorId: a.users.DOCTOR?.id,
      startsAt: '2030-03-12T01:00:00.000Z', // 06:00 Tashkent
      endsAt: '2030-03-12T01:20:00.000Z',
    });
    expect(res.status).toBe(422);
  });

  it('exclusion constraint: concurrent bookings of one slot -> exactly one wins, others SLOT_TAKEN', async () => {
    const body = {
      branchId: a.branchId,
      patientId,
      doctorId: a.users.DOCTOR?.id,
      startsAt: slotStart,
      endsAt: slotEnd,
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => book('REGISTRAR', body)));
    const statuses = results.map((r) => r.status).sort();
    expect(
      statuses.filter((s) => s === 201),
      JSON.stringify(results.map((r) => ({ s: r.status, b: r.body as unknown }))),
    ).toHaveLength(1);
    expect(
      statuses.filter((s) => s === 409),
      JSON.stringify(results.map((r) => ({ s: r.status, b: r.body as unknown }))),
    ).toHaveLength(7);
    const loser = results.find((r) => r.status === 409);
    expect((loser?.body as { code: string }).code).toBe('SLOT_TAKEN');

    const rows = await db
      .forTenant(a.clinicId)
      .appointment.count({ where: { startsAt: new Date(slotStart) } });
    expect(rows).toBe(1);

    // the slot is now reported busy
    const slots = await request(url())
      .get(`/api/v1/doctors/${a.users.DOCTOR?.id}/slots`)
      .query({ date: day, branchId: a.branchId })
      .set(auth('REGISTRAR'));
    expect((slots.body as { items: { free: boolean }[] }).items[3]?.free).toBe(false);
  });

  it('the constraint also guards reschedules, and cancelled bookings free the slot', async () => {
    const second = await book('REGISTRAR', {
      branchId: a.branchId,
      patientId: patient2Id,
      doctorId: a.users.DOCTOR?.id,
      startsAt: '2030-03-12T05:20:00.000Z',
      endsAt: '2030-03-12T05:40:00.000Z',
    }).expect(201);
    const { id, version } = second.body as { id: string; version: number };
    const clash = await request(url())
      .patch(`/api/v1/appointments/${id}`)
      .set(auth('REGISTRAR'))
      .send({ version, startsAt: slotStart, endsAt: slotEnd });
    expect(clash.status).toBe(409);
    expect((clash.body as { code: string }).code).toBe('SLOT_TAKEN');

    const cancelled = await request(url())
      .post(`/api/v1/appointments/${id}/status`)
      .set(auth('REGISTRAR'))
      .send({ version, status: 'CANCELLED' })
      .expect(200);
    expect((cancelled.body as { status: string }).status).toBe('CANCELLED');
    await book('REGISTRAR', {
      branchId: a.branchId,
      patientId,
      doctorId: a.users.DOCTOR?.id,
      startsAt: '2030-03-12T05:20:00.000Z',
      endsAt: '2030-03-12T05:40:00.000Z',
    }).expect(201);
  });

  it('forbids illegal status transitions', async () => {
    const list = await request(url())
      .get('/api/v1/appointments')
      .query({ from: '2030-03-12T00:00:00.000Z', to: '2030-03-13T00:00:00.000Z' })
      .set(auth('REGISTRAR'));
    const cancelled = (
      list.body as { items: { id: string; status: string; version: number }[] }
    ).items.find((x) => x.status === 'CANCELLED');
    const res = await request(url())
      .post(`/api/v1/appointments/${cancelled?.id}/status`)
      .set(auth('REGISTRAR'))
      .send({ version: cancelled?.version, status: 'BOOKED' });
    expect(res.status).toBe(409);
  });

  it('arrival creates a queue ticket; numbers are sequential and unique under concurrency', async () => {
    const list = await request(url())
      .get('/api/v1/appointments')
      .query({ from: '2030-03-12T00:00:00.000Z', to: '2030-03-13T00:00:00.000Z' })
      .set(auth('REGISTRAR'));
    const booked = (
      list.body as { items: { id: string; status: string; version: number }[] }
    ).items.find((x) => x.status === 'BOOKED');
    const arrived = await request(url())
      .post(`/api/v1/appointments/${booked?.id}/status`)
      .set(auth('REGISTRAR'))
      .send({ version: booked?.version, status: 'ARRIVED' })
      .expect(200);
    expect((arrived.body as { ticketNumber: number }).ticketNumber).toBe(1);

    const issued = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(url())
          .post('/api/v1/queue/tickets')
          .set(auth('REGISTRAR'))
          .send({ branchId: a.branchId, patientId: patient2Id }),
      ),
    );
    expect(
      issued.every((r) => r.status === 201),
      JSON.stringify(issued.map((r) => ({ s: r.status, b: r.body as unknown }))),
    ).toBe(true);
    const numbers = issued.map((r) => (r.body as { number: number }).number).sort((x, y) => x - y);
    expect(numbers).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('call-next flips a ticket to CALLED and the public screen reflects it live (< 1 s)', async () => {
    const socket = connect(`${url()}/screen`, {
      auth: { token: screenToken },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    const called = new Promise<{ number: number; cabinet: string | null; text: string }>(
      (resolve) => {
        socket.on('queue.called', resolve);
      },
    );

    const res = await request(url())
      .post('/api/v1/queue/call-next')
      .set(auth('DOCTOR'))
      .send({ branchId: a.branchId, cabinet: '12' })
      .expect(200);
    const sent = Date.now();
    const event = await called;
    expect(Date.now() - sent).toBeLessThan(1000);
    expect(event).toMatchObject({ number: 1, cabinet: '12' });
    expect(event.text).toContain('12-xona');
    expect((res.body as { status: string }).status).toBe('CALLED');
    socket.close();

    const view = await request(url()).get(`/api/v1/screen/${screenToken}`).expect(200);
    const body = view.body as { tickets: { number: number; cabinet: string }[] };
    expect(body.tickets[0]).toMatchObject({ number: 1, cabinet: '12' });
    expect(JSON.stringify(body)).not.toContain(patientId); // no patient data on the public screen
  });

  it('screen sockets reject bad tokens; revoking the token kills the screen', async () => {
    const bad = connect(`${url()}/screen`, { auth: { token: 'nope' }, transports: ['websocket'] });
    await new Promise<void>((resolve) => {
      bad.on('connect_error', () => {
        resolve();
      });
    });
    bad.close();
    const rotated = await request(url())
      .post(`/api/v1/branches/${a.branchId}/screen-token`)
      .set(auth('OWNER'))
      .expect(200);
    expect((rotated.body as { screenToken: string }).screenToken).not.toBe(screenToken);
    await request(url()).get(`/api/v1/screen/${screenToken}`).expect(404);
  });

  it('staff sockets need a valid access token', async () => {
    const anon = connect(url(), { transports: ['websocket'] });
    await new Promise<void>((resolve) => {
      anon.on('connect_error', () => {
        resolve();
      });
    });
    anon.close();
    const ok = connect(url(), { auth: { token: tokens.REGISTRAR }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      ok.on('connect', resolve);
      ok.on('connect_error', reject);
    });
    ok.close();
  });

  it('tenant isolation for scheduling data', async () => {
    const res = await request(url())
      .get('/api/v1/appointments')
      .query({ from: '2030-03-12T00:00:00.000Z', to: '2030-03-13T00:00:00.000Z' })
      .set(auth('REGISTRAR_B'));
    expect((res.body as { items: unknown[] }).items).toEqual([]);
    await request(url())
      .get(`/api/v1/doctors/${a.users.DOCTOR?.id}/slots`)
      .query({ date: day, branchId: a.branchId })
      .set(auth('REGISTRAR_B'))
      .expect(404); // branch of another clinic
    const q = await request(url())
      .get('/api/v1/queue')
      .query({ branchId: a.branchId })
      .set(auth('REGISTRAR_B'));
    expect(q.status).toBe(404);
  });

  it('a doctor only sees their own appointments', async () => {
    const res = await request(url())
      .get('/api/v1/appointments')
      .query({ from: '2030-03-12T00:00:00.000Z', to: '2030-03-13T00:00:00.000Z' })
      .set(auth('DOCTOR'));
    const items = (res.body as { items: { doctorId: string }[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.doctorId === a.users.DOCTOR?.id)).toBe(true);
  });
});
