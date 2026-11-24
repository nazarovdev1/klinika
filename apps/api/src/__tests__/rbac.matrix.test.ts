import { ROLES, type Role } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildApp,
  createTestDb,
  hasDatabase,
  PASSWORD,
  seedClinic,
  type SeededClinic,
} from '../test/harness.js';

type Method = 'get' | 'post' | 'patch';
interface Endpoint {
  name: string;
  method: Method;
  path: string;
  body?: object;
  /** roles that pass authorization (any status except 401/403) */
  allowed: readonly Role[];
}

const MANAGERS: readonly Role[] = ['OWNER', 'ADMIN'];

const endpoints: Endpoint[] = [
  { name: 'GET /staff', method: 'get', path: '/api/v1/staff', allowed: MANAGERS },
  { name: 'POST /staff', method: 'post', path: '/api/v1/staff', body: {}, allowed: MANAGERS },
  { name: 'GET /clinic', method: 'get', path: '/api/v1/clinic', allowed: ROLES },
  {
    name: 'PATCH /clinic',
    method: 'patch',
    path: '/api/v1/clinic',
    body: { name: 'Renamed' },
    allowed: MANAGERS,
  },
  { name: 'GET /branches', method: 'get', path: '/api/v1/branches', allowed: ROLES },
  { name: 'POST /branches', method: 'post', path: '/api/v1/branches', body: {}, allowed: MANAGERS },
  { name: 'GET /auth/me', method: 'get', path: '/api/v1/auth/me', allowed: ROLES },
];

describe.skipIf(!hasDatabase)('rbac.matrix: role x endpoint', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof buildApp>['app'];
  let clinic: SeededClinic;
  const tokens = {} as Record<Role, string>;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    ({ app } = buildApp(db));
    clinic = await seedClinic(db, 'a');
    for (const role of ROLES) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ login: clinic.users[role]?.login, password: PASSWORD });
      tokens[role] = (res.body as { accessToken: string }).accessToken;
    }
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  for (const ep of endpoints) {
    it(`${ep.name}: anonymous -> 401`, async () => {
      const res = await request(app)[ep.method](ep.path).send(ep.body);
      expect(res.status).toBe(401);
    });
    for (const role of ROLES) {
      const allowed = ep.allowed.includes(role);
      it(`${ep.name}: ${role} -> ${allowed ? 'allowed' : '403'}`, async () => {
        const call = request(app)[ep.method](ep.path);
        const res = await call.set('Authorization', `Bearer ${tokens[role]}`).send(ep.body);
        if (allowed) expect([401, 403]).not.toContain(res.status);
        else expect(res.status).toBe(403);
      });
    }
  }

  it('ADMIN cannot create an OWNER, OWNER can', async () => {
    const body = {
      fullName: 'New Owner',
      phone: '+998933334455',
      login: 'owner2',
      password: 'Owner-pass-12345',
      role: 'OWNER',
      branchIds: [clinic.branchId],
    };
    await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .send(body)
      .expect(403);
    await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokens.OWNER}`)
      .send(body)
      .expect(201);
  });
});
