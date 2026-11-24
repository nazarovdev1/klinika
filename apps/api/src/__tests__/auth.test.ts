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

describe.skipIf(!hasDatabase)('auth', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof buildApp>['app'];
  let clinic: SeededClinic;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    ({ app } = buildApp(db, { LOGIN_MAX_FAILURES: '3' }));
    clinic = await seedClinic(db, 'a');
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  const loginOf = (role: string) => clinic.users[role]?.login ?? '';
  const doLogin = (login: string, password = PASSWORD) =>
    request(app).post('/api/v1/auth/login').send({ login, password });

  const cookieOf = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const c = raw?.find((x) => x.startsWith('refresh_token='));
    if (!c) throw new Error('no refresh cookie');
    return c.split(';')[0] ?? '';
  };

  it('login sets an httpOnly SameSite=Strict refresh cookie', async () => {
    const res = await doLogin(loginOf('DOCTOR')).expect(200);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect((res.body as { user: { role: string } }).user.role).toBe('DOCTOR');
  });

  it('rotates the refresh token and detects reuse (revokes the family)', async () => {
    const c1 = cookieOf(await doLogin(loginOf('NURSE')));
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', c1).expect(200);
    const c2 = cookieOf(r1);
    expect(c2).not.toBe(c1);

    // replaying the old token is reuse
    await request(app).post('/api/v1/auth/refresh').set('Cookie', c1).expect(401);
    // the whole family is dead now, including the newest token
    await request(app).post('/api/v1/auth/refresh').set('Cookie', c2).expect(401);
  });

  it('logout revokes the session', async () => {
    const c = cookieOf(await doLogin(loginOf('LAB')));
    await request(app).post('/api/v1/auth/logout').set('Cookie', c).expect(204);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', c).expect(401);
  });

  it('locks the account after repeated failures', async () => {
    const l = loginOf('CASHIER');
    for (let i = 0; i < 3; i++) await doLogin(l, 'wrong-password').expect(401);
    // even the right password is refused while locked
    await doLogin(l).expect(423);
  });

  it('rate limits login attempts per IP+login', async () => {
    const { app: limited } = buildApp(db, { LOGIN_RATE_LIMIT: '2' });
    const send = () =>
      request(limited).post('/api/v1/auth/login').send({ login: 'nobody', password: 'x' });
    await send();
    await send();
    expect((await send()).status).toBe(429);
  });

  it('enforces the first-login password change', async () => {
    const owner = await doLogin(loginOf('OWNER'));
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const created = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'New Registrar',
        phone: '+998901234567',
        login: 'new.registrar',
        password: 'Initial-pass-1',
        role: 'REGISTRAR',
        branchIds: [clinic.branchId],
      })
      .expect(201);
    expect((created.body as { mustChangePassword: boolean }).mustChangePassword).toBe(true);

    const first = await doLogin('new.registrar', 'Initial-pass-1').expect(200);
    const token = (first.body as { accessToken: string }).accessToken;

    // blocked everywhere except me / change-password
    const blocked = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(403);
    expect((blocked.body as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Initial-pass-1', newPassword: 'Brand-new-pass-2' })
      .expect(200);
    const newToken = (changed.body as { accessToken: string }).accessToken;
    await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);
  });

  it('writes audit entries for staff changes', async () => {
    const entries = await db.forTenant(clinic.clinicId).auditLog.findMany({
      where: { action: 'staff.created' },
    });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('optimistic concurrency: a stale version returns 409', async () => {
    const owner = await doLogin(loginOf('OWNER'));
    const token = (owner.body as { accessToken: string }).accessToken;
    const id = clinic.users.REGISTRAR?.id ?? '';
    await request(app)
      .patch(`/api/v1/staff/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, fullName: 'Renamed One' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/staff/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, fullName: 'Renamed Two' })
      .expect(409);
  });
});
