import { pino, type Logger } from 'pino';

/** PII must never reach logs: PINFL, passport, phone, diagnoses, credentials. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.pinfl',
  '*.passport',
  '*.phone',
  '*.phone2',
  '*.diagnosis',
  '*.diagnoses',
  '*.icd10Code',
];

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  });
}
