import type { Db } from '@shifo/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { createLogger } from '../../../core/logger.js';
import {
  createTestDb,
  hasDatabase,
  PASSWORD,
  seedClinic,
  testEnv,
  type SeededClinic,
} from '../../../test/harness.js';
import { seedIcd10 } from '../../../seed/icd10.js';
import { canRenderPdf, createPlaywrightPdfRenderer } from '../../documents/pdf.js';

const renderer = createPlaywrightPdfRenderer();

describe.skipIf(!hasDatabase)('encounters', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  const tok: Record<string, string> = {};
  let patientId = '';
  let doctor2Id = '';
  let encId = '';

  const auth = (k: string) => ({ Authorization: `Bearer ${tok[k]}` });
  const login = async (l: string, password = PASSWORD): Promise<string> =>
    (
      (await request(app).post('/api/v1/auth/login').send({ login: l, password })).body as {
        accessToken: string;
      }
    ).accessToken;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(testEnv(), createLogger('silent'), db, undefined, renderer);
    await seedIcd10(db);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    for (const r of ['OWNER', 'REGISTRAR', 'DOCTOR', 'NURSE', 'CASHIER'] as const) {
      tok[r] = await login(a.users[r]?.login ?? '');
    }
    tok.DOCTOR_B = await login(b.users.DOCTOR?.login ?? '');

    // a second doctor in clinic A
    const created = await request(app)
      .post('/api/v1/staff')
      .set(auth('OWNER'))
      .send({
        fullName: 'Second Doctor',
        phone: '+998909990011',
        login: 'doctor2',
        password: 'Second-doctor-1',
        role: 'DOCTOR',
        branchIds: [a.branchId],
        doctorProfile: { specialty: 'Terapevt' },
      })
      .expect(201);
    doctor2Id = (created.body as { id: string }).id;
    // first login forces a change; do it to get a usable token
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ login: 'doctor2', password: 'Second-doctor-1' });
    const t1 = (first.body as { accessToken: string }).accessToken;
    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${t1}`)
      .send({ currentPassword: 'Second-doctor-1', newPassword: 'Second-doctor-2' });
    tok.DOCTOR2 = (changed.body as { accessToken: string }).accessToken;

    const p = await request(app)
      .post('/api/v1/patients')
      .set(auth('REGISTRAR'))
      .send({
        lastName: 'Karimov',
        firstName: 'Aziz',
        birthDate: '1985-02-03',
        sex: 'MALE',
        phone: '+998901112233',
      })
      .expect(201);
    patientId = (p.body as { id: string }).id;
  }, 180_000);

  afterAll(async () => {
    await renderer.close();
    await cleanup();
  });

  it('only doctors open encounters', async () => {
    const body = { patientId, branchId: a.branchId };
    await request(app).post('/api/v1/encounters').set(auth('REGISTRAR')).send(body).expect(403);
    await request(app).post('/api/v1/encounters').set(auth('NURSE')).send(body).expect(403);
    const res = await request(app)
      .post('/api/v1/encounters')
      .set(auth('DOCTOR'))
      .send(body)
      .expect(201);
    encId = (res.body as { id: string }).id;
    expect((res.body as { status: string }).status).toBe('OPEN');
  });

  it('the attending doctor edits; others cannot (RBAC + policy)', async () => {
    const res = await request(app)
      .patch(`/api/v1/encounters/${encId}`)
      .set(auth('DOCTOR'))
      .send({ version: 1, complaints: 'Bosh og‘rig‘i', anamnesis: '3 kundan beri' })
      .expect(200);
    expect((res.body as { version: number }).version).toBe(2);
    // another doctor: cannot edit, cannot read an unsigned encounter
    await request(app)
      .patch(`/api/v1/encounters/${encId}`)
      .set(auth('DOCTOR2'))
      .send({ version: 2, complaints: 'x' })
      .expect(403);
    await request(app).get(`/api/v1/encounters/${encId}`).set(auth('DOCTOR2')).expect(403);
    // stale version
    await request(app)
      .patch(`/api/v1/encounters/${encId}`)
      .set(auth('DOCTOR'))
      .send({ version: 1, complaints: 'stale' })
      .expect(409);
  });

  it('a nurse records vitals; values are range checked', async () => {
    await request(app)
      .put(`/api/v1/encounters/${encId}/vitals`)
      .set(auth('NURSE'))
      .send({ temperature: 36.8, systolic: 120, diastolic: 80, pulse: 72, spo2: 98 })
      .expect(200);
    await request(app)
      .put(`/api/v1/encounters/${encId}/vitals`)
      .set(auth('NURSE'))
      .send({ temperature: 99 })
      .expect(422);
    await request(app)
      .put(`/api/v1/encounters/${encId}/vitals`)
      .set(auth('CASHIER'))
      .send({ pulse: 70 })
      .expect(403);
  });

  it('searches ICD-10 in uz and ru', async () => {
    const byCode = await request(app)
      .get('/api/v1/icd10')
      .query({ q: 'j06' })
      .set(auth('DOCTOR'))
      .expect(200);
    expect((byCode.body as { items: { code: string }[] }).items[0]?.code).toBe('J06.9');
    const ru = await request(app).get('/api/v1/icd10').query({ q: 'гастрит' }).set(auth('DOCTOR'));
    expect((ru.body as { items: { code: string }[] }).items.map((i) => i.code)).toContain('K29.7');
    const uz = await request(app).get('/api/v1/icd10').query({ q: 'astma' }).set(auth('DOCTOR'));
    expect((uz.body as { items: { code: string }[] }).items.map((i) => i.code)).toContain('J45.9');
  });

  it('cannot sign without a primary diagnosis; rejects unknown codes', async () => {
    await request(app)
      .post(`/api/v1/encounters/${encId}/sign`)
      .set(auth('DOCTOR'))
      .send({ version: 4 })
      .expect(422);
    await request(app)
      .put(`/api/v1/encounters/${encId}/diagnoses`)
      .set(auth('DOCTOR'))
      .send({ items: [{ icd10Code: 'Z99.9', type: 'PRIMARY' }] })
      .expect(422);
  });

  it('records diagnoses and prescriptions, then signs; the outbox gets encounter.signed', async () => {
    await request(app)
      .put(`/api/v1/encounters/${encId}/diagnoses`)
      .set(auth('DOCTOR'))
      .send({
        items: [
          { icd10Code: 'J06.9', type: 'PRIMARY' },
          { icd10Code: 'R50.9', type: 'SECONDARY', note: '38.1' },
        ],
      })
      .expect(200);
    await request(app)
      .put(`/api/v1/encounters/${encId}/prescriptions`)
      .set(auth('DOCTOR'))
      .send({
        items: [
          {
            drugName: 'Paratsetamol',
            form: 'tabletka',
            dosage: '500 mg',
            frequency: '3 mahal',
            durationDays: 5,
          },
        ],
      })
      .expect(200);
    const current = await request(app)
      .get(`/api/v1/encounters/${encId}`)
      .set(auth('DOCTOR'))
      .expect(200);
    const { version } = current.body as { version: number };
    const signed = await request(app)
      .post(`/api/v1/encounters/${encId}/sign`)
      .set(auth('DOCTOR'))
      .send({ version })
      .expect(200);
    expect((signed.body as { status: string; signedAt: string }).status).toBe('SIGNED');

    const events = await db
      .forTenant(a.clinicId)
      .outboxEvent.findMany({ where: { type: 'encounter.signed' } });
    expect(events).toHaveLength(1);
    expect((events[0]?.payload as { encounterId: string }).encounterId).toBe(encId);
  });

  it('signed encounters are immutable: every write returns 409', async () => {
    const version = 99;
    const writes = [
      request(app)
        .patch(`/api/v1/encounters/${encId}`)
        .set(auth('DOCTOR'))
        .send({ version, complaints: 'edit' }),
      request(app)
        .put(`/api/v1/encounters/${encId}/diagnoses`)
        .set(auth('DOCTOR'))
        .send({ items: [] }),
      request(app)
        .put(`/api/v1/encounters/${encId}/prescriptions`)
        .set(auth('DOCTOR'))
        .send({ items: [] }),
      request(app).put(`/api/v1/encounters/${encId}/vitals`).set(auth('NURSE')).send({ pulse: 60 }),
      request(app).post(`/api/v1/encounters/${encId}/sign`).set(auth('DOCTOR')).send({ version }),
    ];
    for (const w of writes) expect((await w).status).toBe(409);
    const enc = await db.forTenant(a.clinicId).encounter.findFirstOrThrow({ where: { id: encId } });
    expect(enc.complaints).toBe('Bosh og‘rig‘i');
  });

  it('corrections are addenda, written by the attending doctor only', async () => {
    await request(app)
      .post(`/api/v1/encounters/${encId}/addenda`)
      .set(auth('DOCTOR2'))
      .send({ text: 'nope' })
      .expect(403);
    const res = await request(app)
      .post(`/api/v1/encounters/${encId}/addenda`)
      .set(auth('DOCTOR'))
      .send({ text: 'Tahlil natijasi keldi: norma' })
      .expect(201);
    expect((res.body as { addenda: unknown[] }).addenda).toHaveLength(1);
  });

  it('signed history is readable (read-only) by other doctors; every read is audited', async () => {
    await request(app).get(`/api/v1/encounters/${encId}`).set(auth('DOCTOR2')).expect(200);
    await request(app)
      .patch(`/api/v1/encounters/${encId}`)
      .set(auth('DOCTOR2'))
      .send({ version: 1 })
      .expect(403);
    const viewed = await db.forTenant(a.clinicId).auditLog.findMany({
      where: { action: 'encounter.viewed', entityId: encId },
    });
    expect(viewed.length).toBeGreaterThanOrEqual(2);
    // the audit trail never stores clinical text
    const all = JSON.stringify(await db.forTenant(a.clinicId).auditLog.findMany());
    expect(all).not.toContain('Bosh og‘rig‘i');
  });

  it('is isolated between clinics', async () => {
    await request(app).get(`/api/v1/encounters/${encId}`).set(auth('DOCTOR_B')).expect(404);
    const list = await request(app).get('/api/v1/encounters').set(auth('DOCTOR_B'));
    expect((list.body as { items: unknown[] }).items).toEqual([]);
  });

  it('lists a doctor own encounters for the Today screen', async () => {
    const res = await request(app)
      .get('/api/v1/encounters')
      .query({ mine: 'true' })
      .set(auth('DOCTOR'));
    expect((res.body as { items: { id: string }[] }).items.map((i) => i.id)).toContain(encId);
    const other = await request(app)
      .get('/api/v1/encounters')
      .query({ mine: 'true' })
      .set(auth('DOCTOR2'));
    expect((other.body as { items: unknown[] }).items).toEqual([]);
  });

  it('manages per-specialty text templates', async () => {
    const t = await request(app)
      .post('/api/v1/text-templates')
      .set(auth('DOCTOR'))
      .send({
        specialty: 'Terapevt',
        title: 'OITI',
        field: 'recommendations',
        body: 'Iliq ichimlik, dam olish',
      })
      .expect(201);
    const list = await request(app)
      .get('/api/v1/text-templates')
      .query({ specialty: 'Terapevt' })
      .set(auth('DOCTOR'));
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
    await request(app)
      .delete(`/api/v1/text-templates/${(t.body as { id: string }).id}`)
      .set(auth('DOCTOR'))
      .expect(204);
    await request(app).get('/api/v1/text-templates').set(auth('DOCTOR_B')).expect(200);
  });

  it('renders the visit summary PDF in uz and ru, with a working verification QR link', async () => {
    if (!canRenderPdf()) return; // Chromium not installed in this environment
    for (const lang of ['uz', 'ru'] as const) {
      const res = await request(app)
        .get(`/api/v1/encounters/${encId}/pdf`)
        .query({ lang })
        .set(auth('DOCTOR'))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => {
            cb(null, Buffer.concat(chunks));
          });
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const buf = res.body as Buffer;
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(5_000);
    }
    await request(app).get(`/api/v1/encounters/${encId}/pdf`).set(auth('DOCTOR_B')).expect(404);
  });

  it('verifies a printed summary publicly without exposing patient data', async () => {
    const { verificationUrl } = await import('../../../core/verify.js');
    const { createPii } = await import('../../../core/pii.js');
    const env = testEnv();
    const url = new URL(verificationUrl(env.WEB_ORIGIN, createPii(env), encId));
    const ok = await request(app).get(url.pathname).expect(200);
    expect(ok.body).toMatchObject({ valid: true });
    expect(JSON.stringify(ok.body)).not.toContain('Karimov');
    await request(app).get(url.pathname.replace(/.$/, '0')).expect(404);
    expect(doctor2Id).toBeTruthy();
  });
});
