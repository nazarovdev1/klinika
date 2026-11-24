import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

describe('parseEnv', () => {
  it('fails fast on missing variables', () => {
    expect(() => parseEnv({})).toThrow(/Invalid environment configuration/);
  });

  it('rejects a short JWT secret', () => {
    expect(() =>
      parseEnv({
        WEB_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: 'x',
        REDIS_URL: 'x',
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});
