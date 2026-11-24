import { describe, expect, it } from 'vitest';
import { parseWorkerEnv } from './config.js';

describe('parseWorkerEnv', () => {
  it('requires REDIS_URL', () => {
    expect(() => parseWorkerEnv({})).toThrow(/REDIS_URL/);
  });
  it('accepts a valid env', () => {
    expect(parseWorkerEnv({ REDIS_URL: 'redis://localhost:6379' }).LOG_LEVEL).toBe('info');
  });
});
