import { healthResponseSchema, problemSchema } from '@shifo/contracts';
import { createDb } from '@shifo/db';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../test/harness.js';

// Health/404/docs never touch the database, so an unreachable connection string is fine.
const { app } = buildApp(createDb('postgresql://unused:unused@127.0.0.1:1/unused'));

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

  it('serves an OpenAPI 3.1 document', async () => {
    const res = await request(app).get('/api/docs').expect(200);
    expect((res.body as { openapi: string }).openapi).toBe('3.1.0');
  });
});
