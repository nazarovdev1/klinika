import { createDb } from '@shifo/db';
import { parseEnv } from './config/env.js';
import { createLogger } from './core/logger.js';
import { dispatchOutbox } from './core/outbox.js';
import { createPii } from './core/pii.js';
import { buildDhpClient } from './modules/integrations/dhp.factory.js';
import { encounterSignedHandler } from './modules/integrations/dhp.sync.js';

/**
 * Background worker: polls the transactional outbox and runs handlers.
 * TODO(phase-8): BullMQ-backed queues (delayed reminders, SMS) join here; polling the DB table keeps the
 * outbox guarantee simple and testable without Redis (see ADR 001, Phase 5).
 */
const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = createDb(env.DATABASE_URL);
const handlers = [encounterSignedHandler(db, createPii(env), buildDhpClient(env))];

let stopping = false;
async function loop(): Promise<void> {
  logger.info({ handlers: handlers.map((h) => h.type) }, 'worker started');
  while (!stopping) {
    try {
      const n = await dispatchOutbox(db, handlers, logger, { maxAttempts: env.DHP_MAX_ATTEMPTS });
      if (n === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.error({ err }, 'dispatch loop error');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.disconnect();
}
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}
void loop();
