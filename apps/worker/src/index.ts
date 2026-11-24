import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { parseWorkerEnv } from './config.js';

const env = parseWorkerEnv();
const logger = pino({ level: env.LOG_LEVEL });

// BullMQ requires maxRetriesPerRequest: null on worker connections.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const QUEUES = ['outbox', 'dhp-sync', 'notifications', 'pdf', 'realtime'] as const;

// Phase 0: only the outbox dispatcher skeleton. Real polling arrives with the outbox table (Phase 1).
const outboxQueue = new Queue('outbox', { connection });
const outboxWorker = new Worker(
  'outbox',
  (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'outbox job received (no-op in phase 0)');
    return Promise.resolve();
  },
  { connection },
);

outboxWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'outbox job failed');
});

logger.info({ queues: QUEUES }, 'worker started');

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'worker shutting down');
  await outboxWorker.close();
  await outboxQueue.close();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
