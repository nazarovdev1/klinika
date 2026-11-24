import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ACCESS_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(30),
  LOGIN_RATE_LIMIT: z.coerce.number().int().default(5),
  LOGIN_MAX_FAILURES: z.coerce.number().int().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().default(15),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  /** Comma separated keyId:base64(32 bytes), e.g. k1:AAAA... Used for AES-256-GCM of PINFL/passport. */
  PII_KEYS: z.string().min(1),
  PII_ACTIVE_KEY_ID: z.string().min(1),
  /** base64, >= 32 bytes. Deterministic HMAC for exact-match search. */
  PII_HMAC_KEY: z.string().min(43),
  /** 'mock' = in-process fake DHP (default for dev/test); 'http' = real endpoint (TODO(external-spec)). */
  DHP_MODE: z.enum(['mock', 'http']).default('mock'),
  DHP_BASE_URL: z.string().optional(),
  DHP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(6),
  /** 'mock' records messages in memory; 'eskiz' is a stub until the Eskiz spec is confirmed (TODO(external-spec)). */
  SMS_MODE: z.enum(['mock', 'eskiz']).default('mock'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates env. Throws with a readable message on failure (fail fast). */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
