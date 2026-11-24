import { Api } from 'grammy';
import type { Env } from '../config/env.js';

export interface SmsProvider {
  send(phone: string, text: string): Promise<{ providerRef: string }>;
}
export interface TelegramSender {
  send(chatId: string, text: string): Promise<{ providerRef: string }>;
}

export interface SentMessage {
  to: string;
  text: string;
}

/** In-memory SMS: used in dev/test. */
export class MockSmsProvider implements SmsProvider {
  readonly sent: SentMessage[] = [];
  failNext = 0;
  send(phone: string, text: string): Promise<{ providerRef: string }> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('mock SMS gateway unavailable'));
    }
    this.sent.push({ to: phone, text });
    return Promise.resolve({ providerRef: `sms-${String(this.sent.length)}` });
  }
}

/**
 * Eskiz SMS gateway.
 * TODO(external-spec): the Eskiz API (auth/token refresh, send endpoint, sender id, template moderation,
 * delivery callbacks) was not provided, so nothing is invented here. Configure SMS_MODE=eskiz only after
 * implementing this against the real documentation.
 */
export class EskizSmsProvider implements SmsProvider {
  send(): Promise<{ providerRef: string }> {
    return Promise.reject(new Error('Eskiz provider is not implemented (TODO(external-spec))'));
  }
}

export class MockTelegram implements TelegramSender {
  readonly sent: SentMessage[] = [];
  send(chatId: string, text: string): Promise<{ providerRef: string }> {
    this.sent.push({ to: chatId, text });
    return Promise.resolve({ providerRef: `tg-${String(this.sent.length)}` });
  }
}

/** Telegram Bot API through grammY (`sendMessage`). */
export class GrammyTelegram implements TelegramSender {
  private readonly api: Api;
  constructor(token: string) {
    this.api = new Api(token);
  }
  async send(chatId: string, text: string): Promise<{ providerRef: string }> {
    const m = await this.api.sendMessage(chatId, text);
    return { providerRef: String(m.message_id) };
  }
}

export interface Messaging {
  sms: SmsProvider;
  telegram: TelegramSender;
}

export function buildMessaging(env: Pick<Env, 'SMS_MODE' | 'TELEGRAM_BOT_TOKEN'>): Messaging {
  return {
    sms: env.SMS_MODE === 'eskiz' ? new EskizSmsProvider() : new MockSmsProvider(),
    telegram: env.TELEGRAM_BOT_TOKEN
      ? new GrammyTelegram(env.TELEGRAM_BOT_TOKEN)
      : new MockTelegram(),
  };
}
