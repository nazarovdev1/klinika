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
} from '../../../test/harness.js';

const base = {
  lastName: 'Karimov',
  firstName: 'Aziz',
  birthDate: '1990-05-17',
  sex: 'MALE',
  phone: '+998901112233',
  pinfl: '12345678901234',
  passport: 'AA1234567',
};

describe.skipIf(!hasDatabase)('patients', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof buildApp>['app'];
  let a: SeededClinic;
  let b: SeededClinic;
  let reg: string;
  let regB: string;
  let doctor: string;
  let cashier: string;

  const tokenFor = async (login: string): Promise<string> => {
    const res = await request(app).post('/api/v1/auth/login').send({ login, password: PASSWORD });
    return (res.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    ({ app } = buildApp(db));
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    reg = await tokenFor(a.users.REGISTRAR?.login ?? '');
    regB = await tokenFor(b.users.REGISTRAR?.login ?? '');
    doctor = await tokenFor(a.users.DOCTOR?.login ?? '');
    cashier = await tokenFor(a.users.CASHIER?.login ?? '');
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let patientId = '';

  it('validates PINFL, passport and phone formats', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set(auth(reg))
      .send({ ...base, pinfl: '123', passport: 'bad', phone: '90123' });
    expect(res.status).toBe(422);
    const paths = (res.body as { errors: { path: string }[] }).errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['pinfl', 'passport', 'phone']));
  });

  it('creates a patient, encrypts PINFL/passport at rest and never logs them in audit', async () => {
    const res = await request(app).post('/api/v1/patients').set(auth(reg)).send(base).expect(201);
    patientId = (res.body as { id: string }).id;
    expect((res.body as { pinfl: string }).pinfl).toBe(base.pinfl);

    const row = await db.system().patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(row.pinflEnc).toBeTruthy();
    expect(row.pinflEnc).not.toContain(base.pinfl);
    expect(row.passportEnc).not.toContain(base.passport);
    expect(row.pinflHash).toMatch(/^[0-9a-f]{64}$/);

    const audit = await db.forTenant(a.clinicId).auditLog.findMany({
      where: { action: 'patient.created' },
    });
    expect(JSON.stringify(audit)).not.toContain(base.pinfl);
  });

  it('rejects a duplicate PINFL', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set(auth(reg))
      .send({ ...base, firstName: 'Other', phone: '+998909998877' });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('DUPLICATE_PATIENT');
  });

  it('warns on name+birthDate+phone duplicates until confirmed', async () => {
    const dup = { ...base, pinfl: undefined, passport: undefined };
    const warn = await request(app).post('/api/v1/patients').set(auth(reg)).send(dup);
    expect(warn.status).toBe(409);
    expect((warn.body as { code: string }).code).toBe('DUPLICATE_PATIENT');
    await request(app)
      .post('/api/v1/patients')
      .set(auth(reg))
      .send({ ...dup, confirmDuplicate: true })
      .expect(201);
  });

  it('finds a patient by PINFL, passport, phone, birth date and name prefix', async () => {
    const find = async (q: string) => {
      const res = await request(app).get('/api/v1/patients').query({ q }).set(auth(reg));
      return (res.body as { items: { id: string }[] }).items.map((i) => i.id);
    };
    expect(await find(base.pinfl)).toEqual([patientId]);
    expect(await find('aa1234567')).toEqual([patientId]);
    expect(await find(base.phone)).toContain(patientId);
    expect(await find('1112233')).toContain(patientId);
    expect(await find('17.05.1990')).toContain(patientId);
    expect(await find('kari az')).toContain(patientId);
    expect(await find('Nobody')).toEqual([]);
  });

  it('masks PINFL in lists and returns it in the card, auditing the view', async () => {
    const list = await request(app).get('/api/v1/patients').query({ q: base.pinfl }).set(auth(reg));
    expect((list.body as { items: { pinfl: string }[] }).items[0]?.pinfl).toMatch(/^•+1234$/);
    const card = await request(app)
      .get(`/api/v1/patients/${patientId}`)
      .set(auth(doctor))
      .expect(200);
    expect((card.body as { pinfl: string }).pinfl).toBe(base.pinfl);
    const viewed = await db.forTenant(a.clinicId).auditLog.findMany({
      where: { action: 'patient.viewed', entityId: patientId },
    });
    expect(viewed.length).toBeGreaterThan(0);
  });

  it('enforces permissions: doctor cannot write, cashier cannot create', async () => {
    await request(app).post('/api/v1/patients').set(auth(doctor)).send(base).expect(403);
    await request(app).post('/api/v1/patients').set(auth(cashier)).send(base).expect(403);
    await request(app).get('/api/v1/patients').set(auth(cashier)).expect(200);
  });

  it('updates with optimistic concurrency', async () => {
    await request(app)
      .patch(`/api/v1/patients/${patientId}`)
      .set(auth(reg))
      .send({ version: 1, address: 'Tashkent' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/patients/${patientId}`)
      .set(auth(reg))
      .send({ version: 1, address: 'Samarkand' })
      .expect(409);
  });

  it('is isolated between clinics', async () => {
    await request(app).get(`/api/v1/patients/${patientId}`).set(auth(regB)).expect(404);
    const list = await request(app)
      .get('/api/v1/patients')
      .query({ q: base.pinfl })
      .set(auth(regB));
    expect((list.body as { items: unknown[] }).items).toEqual([]);
    // the same PINFL may exist in another clinic
    await request(app).post('/api/v1/patients').set(auth(regB)).send(base).expect(201);
  });

  it('tracks consents with history', async () => {
    const put = (granted: boolean) =>
      request(app)
        .put(`/api/v1/patients/${patientId}/consents/SMS`)
        .set(auth(reg))
        .send({ granted });
    await put(true).expect(200);
    await put(true).expect(200); // idempotent
    const revoked = await put(false).expect(200);
    const items = (revoked.body as { items: { type: string; revokedAt: string | null }[] }).items;
    expect(items.filter((c) => c.type === 'SMS')).toHaveLength(1);
    expect(items[0]?.revokedAt).not.toBeNull();
  });

  it('soft deletes patients (record stays, hidden from reads)', async () => {
    await request(app).delete(`/api/v1/patients/${patientId}`).set(auth(reg)).expect(204);
    await request(app).get(`/api/v1/patients/${patientId}`).set(auth(reg)).expect(404);
    const row = await db.system().patient.findUnique({ where: { id: patientId } });
    expect(row?.deletedAt).not.toBeNull();
  });
});
