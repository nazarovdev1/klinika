import { healthResponseSchema, problemSchema } from '@shifo/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { parseEnv } from '../../../config/env.js';
import { createLogger } from '../../../core/logger.js';

const env = parseEnv({
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  LOG_LEVEL: 'silent',
});
const app = createApp(env, createLogger('silent'));

describe('GET /api/v1/health', () => {
  it('returns ok and a request id', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(healthResponseSchema.parse(res.body).status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns RFC 9457 problem for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(problemSchema.parse(res.body).code).toBe('NOT_FOUND');
  });
});
