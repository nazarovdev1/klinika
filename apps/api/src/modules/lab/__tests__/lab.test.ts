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
import { canRenderPdf, createPlaywrightPdfRenderer } from '../../documents/pdf.js';

const renderer = createPlaywrightPdfRenderer();

interface OrderBody {
  id: string;
  barcode: string;
  status: string;
  items: { id: string; testCode: string; flag: string | null; value: string | null }[];
}

describe.skipIf(!hasDatabase)('laboratory', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  const tok: Record<string, string> = {};
  let patientId = '';
  let hgbId = '';
  let glucId = '';
  let colorId = '';
  const auth = (k: string) => ({ Authorization: `Bearer ${tok[k]}` });
  const login = async (l: string): Promise<string> =>
    (
      (await request(app).post('/api/v1/auth/login').send({ login: l, password: PASSWORD }))
        .body as {
        accessToken: string;
      }
    ).accessToken;

  const newOrder = async (testIds: string[]): Promise<OrderBody> =>
    (
      await request(app)
        .post('/api/v1/lab/orders')
        .set(auth('DOCTOR'))
        .send({ patientId, branchId: a.branchId, testIds })
        .expect(201)
    ).body as OrderBody;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(testEnv(), createLogger('silent'), db, undefined, renderer);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    for (const r of ['OWNER', 'ADMIN', 'REGISTRAR', 'DOCTOR', 'NURSE', 'LAB'] as const) {
      tok[r] = await login(a.users[r]?.login ?? '');
    }
    tok.DOCTOR_B = await login(b.users.DOCTOR?.login ?? '');
    tok.OWNER_B = await login(b.users.OWNER?.login ?? '');

    const patient = await db.forTenant(a.clinicId).patient.create({
      data: {
        clinicId: a.clinicId,
        lastName: 'Laboratoriya',
        firstName: 'Bemor',
        birthDate: new Date('1980-01-01'),
        sex: 'FEMALE',
        phone: '+998901119999',
      },
    });
    patientId = patient.id;

    const mk = async (body: object) =>
      (
        (await request(app).post('/api/v1/lab/tests').set(auth('OWNER')).send(body).expect(201))
          .body as {
          id: string;
        }
      ).id;
    hgbId = await mk({
      code: 'HGB',
      nameUz: 'Gemoglobin',
      nameRu: 'Гемоглобин',
      unit: 'g/L',
      refLow: 120,
      refHigh: 160,
      criticalLow: 70,
      criticalHigh: 200,
    });
    glucId = await mk({
      code: 'GLU',
      nameUz: 'Glyukoza',
      nameRu: 'Глюкоза',
      unit: 'mmol/L',
      refLow: 3.9,
      refHigh: 6.1,
    });
    colorId = await mk({ code: 'COLOR', nameUz: 'Rang', nameRu: 'Цвет', isNumeric: false });
  }, 120_000);

  afterAll(async () => {
    await renderer.close();
    await cleanup();
  });

  it('manages the test dictionary with range validation and RBAC', async () => {
    await request(app)
      .post('/api/v1/lab/tests')
      .set(auth('OWNER'))
      .send({ code: 'BAD', nameUz: 'x', nameRu: 'x', refLow: 10, refHigh: 1 })
      .expect(422);
    await request(app)
      .post('/api/v1/lab/tests')
      .set(auth('DOCTOR'))
      .send({ code: 'NOPE', nameUz: 'x', nameRu: 'x' })
      .expect(403);
    await request(app)
      .post('/api/v1/lab/tests')
      .set(auth('OWNER'))
      .send({ code: 'HGB', nameUz: 'dup', nameRu: 'dup' })
      .expect(409);
    const list = await request(app).get('/api/v1/lab/tests').set(auth('LAB')).expect(200);
    expect((list.body as { items: unknown[] }).items).toHaveLength(3);
  });

  it('orders tests with a unique barcode and snapshots the reference ranges', async () => {
    const o1 = await newOrder([hgbId, glucId]);
    const o2 = await newOrder([hgbId]);
    expect(o1.barcode).toMatch(/^L\d{6}[0-9A-F]{2}\d{4}$/);
    expect(o2.barcode).not.toBe(o1.barcode);
    expect(o1.status).toBe('ORDERED');
    expect(o1.items.map((i) => i.testCode).sort()).toEqual(['GLU', 'HGB']);
    await request(app)
      .post('/api/v1/lab/orders')
      .set(auth('REGISTRAR'))
      .send({ patientId, branchId: a.branchId, testIds: [hgbId] })
      .expect(403);
    await request(app)
      .post('/api/v1/lab/orders')
      .set(auth('DOCTOR'))
      .send({ patientId, branchId: a.branchId, testIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(422);
  });

  it('runs the full flow: order -> collect -> results (flags) -> validate (four-eyes) -> PDF', async () => {
    const order = await newOrder([hgbId, glucId, colorId]);
    const item = (code: string) => order.items.find((i) => i.testCode === code)?.id ?? '';

    // results are not accepted before the sample is collected
    await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('LAB'))
      .send({ items: [{ itemId: item('HGB'), value: '140' }] })
      .expect(409);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/collect`)
      .set(auth('NURSE'))
      .expect(200);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/collect`)
      .set(auth('NURSE'))
      .expect(409);

    // clinical staff may not enter results
    await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('DOCTOR'))
      .send({ items: [{ itemId: item('HGB'), value: '140' }] })
      .expect(403);

    // partial entry keeps the order open; bad numbers are rejected
    await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('LAB'))
      .send({ items: [{ itemId: item('HGB'), value: 'abc' }] })
      .expect(422);
    const partial = await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('LAB'))
      .send({
        items: [
          { itemId: item('HGB'), value: '65' },
          { itemId: item('GLU'), value: '7,2' },
        ],
      })
      .expect(200);
    expect((partial.body as OrderBody).status).toBe('COLLECTED');
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/validate`)
      .set(auth('OWNER'))
      .expect(409);

    const full = await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('LAB'))
      .send({ items: [{ itemId: item('COLOR'), value: 'sariq' }] })
      .expect(200);
    const body = full.body as OrderBody;
    expect(body.status).toBe('RESULTED');
    const flag = (code: string) => body.items.find((i) => i.testCode === code)?.flag;
    expect(flag('HGB')).toBe('CRITICAL_LOW');
    expect(flag('GLU')).toBe('HIGH');
    expect(flag('COLOR')).toBeNull();

    // four-eyes: the person who entered the values cannot validate them
    await request(app).post(`/api/v1/lab/orders/${order.id}/validate`).set(auth('LAB')).expect(403);
    // no PDF before validation
    await request(app).get(`/api/v1/lab/orders/${order.id}/pdf`).set(auth('DOCTOR')).expect(409);
    const validated = await request(app)
      .post(`/api/v1/lab/orders/${order.id}/validate`)
      .set(auth('OWNER'))
      .expect(200);
    expect((validated.body as OrderBody).status).toBe('VALIDATED');

    // immutable afterwards
    await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('LAB'))
      .send({ items: [{ itemId: item('HGB'), value: '130' }] })
      .expect(409);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/cancel`)
      .set(auth('DOCTOR'))
      .expect(409);

    const events = await db
      .forTenant(a.clinicId)
      .outboxEvent.findMany({ where: { type: 'lab.validated' } });
    expect(events.some((e) => (e.payload as { labOrderId: string }).labOrderId === order.id)).toBe(
      true,
    );

    if (canRenderPdf()) {
      const pdf = await request(app)
        .get(`/api/v1/lab/orders/${order.id}/pdf`)
        .query({ lang: 'ru' })
        .set(auth('DOCTOR'))
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => {
            cb(null, Buffer.concat(chunks));
          });
        });
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('allows self-validation only when the clinic enables it', async () => {
    const order = await newOrder([glucId]);
    const itemId = order.items[0]?.id ?? '';
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/collect`)
      .set(auth('NURSE'))
      .expect(200);
    await request(app)
      .put(`/api/v1/lab/orders/${order.id}/results`)
      .set(auth('OWNER'))
      .send({ items: [{ itemId, value: '5.0' }] })
      .expect(200);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/validate`)
      .set(auth('OWNER'))
      .expect(403);
    await db
      .system()
      .clinic.update({
        where: { id: a.clinicId },
        data: { settings: { labSelfValidation: true } },
      });
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/validate`)
      .set(auth('OWNER'))
      .expect(200);
  });

  it('cancels orders that have no results', async () => {
    const order = await newOrder([glucId]);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/cancel`)
      .set(auth('DOCTOR'))
      .expect(200);
    await request(app)
      .post(`/api/v1/lab/orders/${order.id}/collect`)
      .set(auth('NURSE'))
      .expect(409);
  });

  it('hides lab data from reception and other clinics; reads are audited', async () => {
    const order = await newOrder([glucId]);
    await request(app).get(`/api/v1/lab/orders/${order.id}`).set(auth('REGISTRAR')).expect(403);
    await request(app).get(`/api/v1/lab/orders/${order.id}`).set(auth('DOCTOR_B')).expect(404);
    const list = await request(app).get('/api/v1/lab/orders').set(auth('DOCTOR_B')).expect(200);
    expect((list.body as { items: unknown[] }).items).toEqual([]);
    await request(app).get(`/api/v1/lab/orders/${order.id}`).set(auth('DOCTOR')).expect(200);
    const viewed = await db
      .forTenant(a.clinicId)
      .auditLog.findMany({ where: { action: 'lab.viewed', entityId: order.id } });
    expect(viewed).toHaveLength(1);
    const all = JSON.stringify(await db.forTenant(a.clinicId).auditLog.findMany());
    expect(all).not.toContain('sariq');
  });
});
