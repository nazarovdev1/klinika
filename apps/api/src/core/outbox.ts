import type { Db } from '@shifo/db';
import type { Logger } from 'pino';

export interface OutboxEventRow {
  id: string;
  clinicId: string;
  type: string;
  payload: unknown;
  attempts: number;
}

export interface OutboxHandler {
  type: string;
  handle(event: OutboxEventRow): Promise<void>;
  /** Called once when retries are exhausted. */
  onDead?(event: OutboxEventRow, error: string): Promise<void>;
}

export interface DispatchOptions {
  maxAttempts: number;
  batchSize?: number;
  leaseMs?: number;
  now?: () => Date;
}

/** Exponential backoff: 30s, 60s, 2m, 4m ... capped at 1h. */
export const backoffMs = (attempt: number): number =>
  Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);

/**
 * Transactional-outbox dispatcher. Events are claimed with a lease (availableAt pushed forward) via a
 * conditional update, so several workers can run safely; a crashed worker's events reappear after the lease.
 * Returns the number of events handled successfully.
 */
export async function dispatchOutbox(
  db: Db,
  handlers: OutboxHandler[],
  logger: Logger,
  opts: DispatchOptions,
): Promise<number> {
  const prisma = db.system();
  const now = opts.now?.() ?? new Date();
  const byType = new Map(handlers.map((h) => [h.type, h]));
  const pending = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      availableAt: { lte: now },
      type: { in: [...byType.keys()] },
    },
    orderBy: { createdAt: 'asc' },
    take: opts.batchSize ?? 20,
  });

  let ok = 0;
  for (const ev of pending) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: ev.id, status: ev.status, attempts: ev.attempts },
      data: {
        attempts: { increment: 1 },
        availableAt: new Date(now.getTime() + (opts.leaseMs ?? 120_000)),
      },
    });
    if (claimed.count === 0) continue; // another worker got it
    const row: OutboxEventRow = {
      id: ev.id,
      clinicId: ev.clinicId,
      type: ev.type,
      payload: ev.payload,
      attempts: ev.attempts + 1,
    };
    const handler = byType.get(ev.type);
    if (!handler) continue;
    try {
      await handler.handle(row);
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: 'DISPATCHED', lastError: null },
      });
      ok++;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const dead = row.attempts >= opts.maxAttempts;
      logger.warn(
        { eventId: ev.id, type: ev.type, attempts: row.attempts, dead },
        'outbox handler failed',
      );
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: dead
          ? { status: 'DEAD', lastError: message }
          : {
              status: 'FAILED',
              lastError: message,
              availableAt: new Date(now.getTime() + backoffMs(row.attempts)),
            },
      });
      if (dead) await handler.onDead?.(row, message);
    }
  }
  return ok;
}
