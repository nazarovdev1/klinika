import type { Db } from '@shifo/db';
import type { Logger } from 'pino';
import { isTemplateKey, renderMessage, type Lang, type TemplateKey } from './messages.js';
import type { Messaging } from './messaging.js';
import { backoffMs } from './outbox.js';
import { dayOf, zonedToUtc } from './time.js';

const HOUR = 3_600_000;
export const QUIET_START = 21; // local hours: no reminders from 21:00 ...
export const QUIET_END = 8; // ... until 08:00

const localHour = (at: Date, tz: string): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(
      at,
    ),
  );

/** If `at` falls in quiet hours (local), returns the next 08:00 local; otherwise `at`. */
export function afterQuietHours(at: Date, tz: string): Date {
  const h = localHour(at, tz);
  if (h >= QUIET_END && h < QUIET_START) return at;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
  const today8 = zonedToUtc(day, '08:00', tz);
  if (at < today8) return today8;
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return zonedToUtc(dayOf(next), '08:00', tz);
}

interface Channelish {
  channel: 'SMS' | 'TELEGRAM';
}

/** Telegram when the patient linked the bot, otherwise SMS when SMS consent was granted, else nothing. */
export async function pickChannel(
  db: Db,
  clinicId: string,
  patientId: string,
): Promise<Channelish | null> {
  const t = db.forTenant(clinicId);
  const tg = await t.patientChannel.findFirst({
    where: { patientId, channel: 'TELEGRAM', externalId: { not: null } },
  });
  if (tg) return { channel: 'TELEGRAM' };
  const consent = await t.patientConsent.findFirst({
    where: { patientId, type: 'SMS' },
    orderBy: { grantedAt: 'desc' },
  });
  return consent?.granted && !consent.revokedAt ? { channel: 'SMS' } : null;
}

/**
 * Creates reminder notifications (24 h and 2 h before) for upcoming appointments. Idempotent through the
 * (clinic, dedupeKey) unique key; a rescheduled appointment gets new reminders because the key carries
 * its start time. Appointments booked inside a reminder's window do not get that reminder.
 */
export async function scheduleReminders(db: Db, now = new Date()): Promise<number> {
  const prisma = db.system();
  const appts = await prisma.appointment.findMany({
    where: {
      status: { in: ['BOOKED', 'CONFIRMED'] },
      startsAt: { gt: now, lte: new Date(now.getTime() + 25 * HOUR) },
    },
    take: 500,
  });
  let created = 0;
  for (const a of appts) {
    for (const [kind, lead] of [
      ['24h', 24],
      ['2h', 2],
    ] as const) {
      const due = new Date(a.startsAt.getTime() - lead * HOUR);
      if (due > now) continue; // not yet in the window
      if (a.createdAt > due) continue; // booked too late for this reminder
      const ch = await pickChannel(db, a.clinicId, a.patientId);
      if (!ch) continue;
      const branch = await prisma.branch.findUniqueOrThrow({ where: { id: a.branchId } });
      const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: a.clinicId } });
      const dedupeKey = `appt:${a.id}:${kind}:${String(a.startsAt.getTime())}`;
      const fmtDate = new Intl.DateTimeFormat('ru-RU', {
        timeZone: branch.timezone,
        dateStyle: 'short',
      });
      const fmtTime = new Intl.DateTimeFormat('ru-RU', {
        timeZone: branch.timezone,
        timeStyle: 'short',
      });
      try {
        await db.forTenant(a.clinicId).notification.create({
          data: {
            clinicId: a.clinicId,
            patientId: a.patientId,
            channel: ch.channel,
            template: `appointment.reminder_${kind}`,
            params: {
              appointmentId: a.id,
              startsAtMs: String(a.startsAt.getTime()),
              clinic: clinic.name,
              date: fmtDate.format(a.startsAt),
              time: fmtTime.format(a.startsAt),
              tz: branch.timezone,
            },
            dedupeKey,
            scheduledFor: afterQuietHours(now, branch.timezone),
          },
        });
        created++;
      } catch (e) {
        if ((e as { code?: unknown }).code !== 'P2002') throw e; // already scheduled
      }
    }
  }
  return created;
}

export interface NotifyOptions {
  maxAttempts: number;
  batchSize?: number;
  now?: Date;
}

/** Sends due notifications through the providers. Returns the number sent. */
export async function dispatchNotifications(
  db: Db,
  messaging: Messaging,
  logger: Logger,
  opts: NotifyOptions,
): Promise<number> {
  const prisma = db.system();
  const now = opts.now ?? new Date();
  const due = await prisma.notification.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: opts.batchSize ?? 25,
  });
  let sent = 0;
  for (const n of due) {
    const claimed = await prisma.notification.updateMany({
      where: { id: n.id, status: n.status, attempts: n.attempts },
      data: { attempts: { increment: 1 }, scheduledFor: new Date(now.getTime() + 2 * 60_000) },
    });
    if (claimed.count === 0) continue;
    const attempts = n.attempts + 1;
    const set = (data: object) => prisma.notification.update({ where: { id: n.id }, data });
    try {
      if (!isTemplateKey(n.template)) {
        await set({ status: 'SKIPPED', lastError: 'unknown template' });
        continue;
      }
      const params = n.params as Record<string, string>;
      // Reminders are void when the appointment moved or was cancelled.
      if (params.appointmentId) {
        const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId } });
        const valid =
          appt &&
          ['BOOKED', 'CONFIRMED'].includes(appt.status) &&
          String(appt.startsAt.getTime()) === params.startsAtMs &&
          appt.startsAt > now;
        if (!valid) {
          await set({ status: 'SKIPPED', lastError: 'appointment changed' });
          continue;
        }
        const tz = params.tz ?? 'Asia/Tashkent';
        const ok = afterQuietHours(now, tz);
        if (ok > now) {
          await set({ scheduledFor: ok, attempts: n.attempts }); // defer, not an attempt
          continue;
        }
      }
      const patient = await prisma.patient.findUnique({ where: { id: n.patientId } });
      if (!patient) {
        await set({ status: 'SKIPPED', lastError: 'patient missing' });
        continue;
      }
      const text = renderMessage(n.template as TemplateKey, n.lang as Lang, params);
      let providerRef: string;
      if (n.channel === 'TELEGRAM') {
        const ch = await prisma.patientChannel.findFirst({
          where: { patientId: n.patientId, channel: 'TELEGRAM', externalId: { not: null } },
        });
        if (!ch?.externalId) {
          await set({ status: 'SKIPPED', lastError: 'telegram not linked' });
          continue;
        }
        ({ providerRef } = await messaging.telegram.send(ch.externalId, text));
      } else {
        ({ providerRef } = await messaging.sms.send(patient.phone, text));
      }
      await set({ status: 'SENT', sentAt: new Date(), providerRef, lastError: null });
      sent++;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      const dead = attempts >= opts.maxAttempts;
      logger.warn({ notificationId: n.id, attempts, dead }, 'notification send failed');
      await prisma.notification.update({
        where: { id: n.id },
        data: dead
          ? { status: 'DEAD', lastError: message }
          : {
              status: 'FAILED',
              lastError: message,
              scheduledFor: new Date(now.getTime() + backoffMs(attempts)),
            },
      });
    }
  }
  return sent;
}

/** Binds a Telegram chat to a patient using the one-time code from /start <code>. */
export async function linkTelegram(db: Db, code: string, chatId: string): Promise<boolean> {
  const prisma = db.system();
  const res = await prisma.patientChannel.updateMany({
    where: { linkCode: code, channel: 'TELEGRAM', linkedAt: null },
    data: { externalId: chatId, linkedAt: new Date(), linkCode: null },
  });
  return res.count === 1;
}
