import { createDb } from '@shifo/db';
import { Bot } from 'grammy';
import { parseEnv } from './config/env.js';
import { createLogger } from './core/logger.js';
import { buildMessaging } from './core/messaging.js';
import { dispatchNotifications, linkTelegram, scheduleReminders } from './core/notifications.js';
import { dispatchOutbox } from './core/outbox.js';
import { createPii } from './core/pii.js';
import { buildDhpClient } from './modules/integrations/dhp.factory.js';
import { encounterSignedHandler } from './modules/integrations/dhp.sync.js';
import { labReadyHandler } from './modules/notifications/notifications.handlers.js';

/**
 * Background worker: polls the transactional outbox, schedules appointment reminders, sends
 * notifications, and (when a token is configured) long-polls the Telegram bot for `/start <code>`.
 * TODO(phase-10): BullMQ/Redis for horizontal scaling; polling the DB keeps the outbox guarantee simple
 * and testable without Redis (see ADR 001, Phase 5).
 */
const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = createDb(env.DATABASE_URL);
const messaging = buildMessaging(env);
const handlers = [
  encounterSignedHandler(db, createPii(env), buildDhpClient(env)),
  labReadyHandler(db),
];

let stopping = false;
let lastScan = 0;

async function tick(): Promise<number> {
  let work = await dispatchOutbox(db, handlers, logger, { maxAttempts: env.DHP_MAX_ATTEMPTS });
  if (Date.now() - lastScan > 60_000) {
    lastScan = Date.now();
    work += await scheduleReminders(db);
  }
  work += await dispatchNotifications(db, messaging, logger, { maxAttempts: 5 });
  return work;
}

async function loop(): Promise<void> {
  logger.info({ handlers: handlers.map((h) => h.type) }, 'worker started');
  while (!stopping) {
    try {
      if ((await tick()) === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.error({ err }, 'worker loop error');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.disconnect();
}

let bot: Bot | undefined;
if (env.TELEGRAM_BOT_TOKEN) {
  bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  bot.command('start', async (ctx) => {
    const code = ctx.match.trim();
    const ok = code ? await linkTelegram(db, code, String(ctx.chat.id)) : false;
    await ctx.reply(
      ok ? 'Telegram ulandi / Telegram подключён ✅' : 'Havola eskirgan / Ссылка недействительна',
    );
  });
  void bot.start({ onStart: () => logger.info('telegram bot polling') });
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    stopping = true;
    void bot?.stop();
  });
}
void loop();
