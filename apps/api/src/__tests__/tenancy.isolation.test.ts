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

type App = ReturnType<typeof buildApp>['app'];

describe.skipIf(!hasDatabase)('tenancy isolation (must stay green forever)', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: App;
  let a: SeededClinic;
  let b: SeededClinic;
  let tokenA: string;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    ({ app } = buildApp(db));
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ login: a.users.OWNER?.login, password: PASSWORD });
    tokenA = (res.body as { accessToken: string }).accessToken;
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  const bUser = (role: string): string => b.users[role]?.id ?? '';

  it('staff list never contains the other clinic', async () => {
    const res = await request(app).get('/api/v1/staff').set('Authorization', `Bearer ${tokenA}`);
    const items = (res.body as { items: { id: string }[] }).items;
    const bIds = Object.values(b.users).map((u) => u.id);
    expect(items.length).toBe(7);
    expect(items.some((u) => bIds.includes(u.id))).toBe(false);
  });

  it('cannot read another clinic staff member by id', async () => {
    await request(app)
      .get(`/api/v1/staff/${bUser('DOCTOR')}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('cannot mutate another clinic staff member', async () => {
    await request(app)
      .patch(`/api/v1/staff/${bUser('DOCTOR')}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ version: 1, isActive: false })
      .expect(404);
    await request(app)
      .post(`/api/v1/staff/${bUser('DOCTOR')}/reset-password`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newPassword: 'Another-pass-123' })
      .expect(404);
    const row = await db.system().user.findUniqueOrThrow({ where: { id: bUser('DOCTOR') } });
    expect(row.isActive).toBe(true);
  });

  it('cannot assign staff to a branch of another clinic', async () => {
    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        fullName: 'Intruder',
        phone: '+998901112233',
        login: 'intruder',
        password: 'Intruder-pass-1',
        role: 'REGISTRAR',
        branchIds: [b.branchId],
      });
    expect(res.status).toBe(422);
  });

  it('cannot update or list the other clinic branches', async () => {
    await request(app)
      .patch(`/api/v1/branches/${b.branchId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'hijacked' })
      .expect(404);
    const res = await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${tokenA}`);
    const items = (res.body as { items: { id: string }[] }).items;
    expect(items.map((x) => x.id)).toEqual([a.branchId]);
  });

  it('the tenant client scopes every operation and stamps clinicId on create', async () => {
    const ta = db.forTenant(a.clinicId);
    expect(await ta.user.count()).toBe(7);
    expect(await ta.user.findFirst({ where: { id: bUser('OWNER') } })).toBeNull();
    expect((await ta.clinic.findFirst({ where: {} }))?.id).toBe(a.clinicId);
    const created = await ta.branch.create({ data: { name: 'extra', clinicId: b.clinicId } });
    expect(created.clinicId).toBe(a.clinicId); // a forged clinicId is overridden
    const res = await ta.branch.updateMany({ where: { id: b.branchId }, data: { name: 'x' } });
    expect(res.count).toBe(0);
  });

  it('audit log entries are tenant scoped', async () => {
    const entries = await db.forTenant(a.clinicId).auditLog.findMany();
    expect(entries.every((e) => e.clinicId === a.clinicId)).toBe(true);
  });
});
