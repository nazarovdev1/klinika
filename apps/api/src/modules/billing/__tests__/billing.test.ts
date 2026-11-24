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

interface InvoiceBody {
  id: string;
  number: string;
  status: string;
  subtotal: string;
  discount: string;
  total: string;
  paidAmount: string;
  balance: string;
  version: number;
  lines: { unitPrice: string; total: string }[];
}

describe.skipIf(!hasDatabase)('billing', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  const tok: Record<string, string> = {};
  let patientId = '';
  let serviceId = '';
  let key = 0;
  const auth = (k: string) => ({ Authorization: `Bearer ${tok[k]}` });
  const idem = () => `test-key-${String(++key).padStart(6, '0')}`;

  const login = async (l: string): Promise<string> =>
    (
      (await request(app).post('/api/v1/auth/login').send({ login: l, password: PASSWORD }))
        .body as {
        accessToken: string;
      }
    ).accessToken;

  async function newIssuedInvoice(total = 100_000): Promise<InvoiceBody> {
    const created = await request(app)
      .post('/api/v1/invoices')
      .set(auth('CASHIER'))
      .send({
        patientId,
        branchId: a.branchId,
        lines: [{ description: 'Custom item', unitPrice: String(total), qty: 1 }],
      })
      .expect(201);
    const issued = await request(app)
      .post(`/api/v1/invoices/${(created.body as InvoiceBody).id}/issue`)
      .set(auth('CASHIER'))
      .expect(200);
    return issued.body as InvoiceBody;
  }
  const pay = (invoiceId: string, method: string, amount: string, k = idem(), who = 'CASHIER') =>
    request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(auth(who))
      .set('Idempotency-Key', k)
      .send({ method, amount });

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(testEnv(), createLogger('silent'), db, undefined, renderer);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    for (const r of ['OWNER', 'REGISTRAR', 'DOCTOR', 'CASHIER'] as const) {
      tok[r] = await login(a.users[r]?.login ?? '');
    }
    tok.CASHIER_B = await login(b.users.CASHIER?.login ?? '');

    const t = db.forTenant(a.clinicId);
    const patient = await t.patient.create({
      data: {
        clinicId: a.clinicId,
        lastName: 'To‘lov',
        firstName: 'Sinov',
        birthDate: new Date('1992-04-05'),
        sex: 'MALE',
        phone: '+998901110000',
      },
    });
    patientId = patient.id;
    const service = await t.service.create({
      data: { clinicId: a.clinicId, code: 'CONS', nameUz: 'Konsultatsiya', nameRu: 'Консультация' },
    });
    serviceId = service.id;
    await t.servicePrice.create({
      data: {
        clinicId: a.clinicId,
        serviceId,
        branchId: a.branchId,
        price: 150_000n,
        validFrom: new Date('2020-01-01'),
      },
    });
  }, 120_000);

  afterAll(async () => {
    await renderer.close();
    await cleanup();
  });

  it('prices catalog lines on the server (client price is ignored) and returns money as strings', async () => {
    const res = await request(app)
      .post('/api/v1/invoices')
      .set(auth('REGISTRAR'))
      .send({
        patientId,
        branchId: a.branchId,
        lines: [
          { serviceId, qty: 2, unitPrice: '1', discount: '10000' },
          { description: 'Bandaj', unitPrice: '25000', qty: 1 },
        ],
        discount: '15000',
      })
      .expect(201);
    const inv = res.body as InvoiceBody;
    expect(inv.lines[0]?.unitPrice).toBe('150000');
    // 2*150000-10000 = 290000 ; + 25000 = 315000 ; - 15000 = 300000
    expect(inv.subtotal).toBe('315000');
    expect(inv.total).toBe('300000');
    expect(inv.status).toBe('DRAFT');
    expect(inv.number).toMatch(/^DRAFT-/);
  });

  it('validates discounts and unpriced services', async () => {
    await request(app)
      .post('/api/v1/invoices')
      .set(auth('CASHIER'))
      .send({
        patientId,
        branchId: a.branchId,
        lines: [{ description: 'x', unitPrice: '1000', qty: 1, discount: '2000' }],
      })
      .expect(422);
    const bare = await db.forTenant(a.clinicId).service.create({
      data: { clinicId: a.clinicId, code: 'NOPRICE', nameUz: 'Narxsiz', nameRu: 'Без цены' },
    });
    await request(app)
      .post('/api/v1/invoices')
      .set(auth('CASHIER'))
      .send({ patientId, branchId: a.branchId, lines: [{ serviceId: bare.id, qty: 1 }] })
      .expect(422);
    await request(app)
      .post('/api/v1/invoices')
      .set(auth('CASHIER'))
      .send({
        patientId,
        branchId: a.branchId,
        lines: [{ description: 'x', unitPrice: '1.5', qty: 1 }],
      })
      .expect(422);
  });

  it('edits drafts with a version check; issuing assigns a number and freezes the invoice', async () => {
    const created = await request(app)
      .post('/api/v1/invoices')
      .set(auth('CASHIER'))
      .send({ patientId, branchId: a.branchId, lines: [{ serviceId, qty: 1 }] })
      .expect(201);
    const inv = created.body as InvoiceBody;
    const edited = await request(app)
      .put(`/api/v1/invoices/${inv.id}/lines`)
      .set(auth('CASHIER'))
      .send({ version: inv.version, lines: [{ serviceId, qty: 3 }] })
      .expect(200);
    expect((edited.body as InvoiceBody).total).toBe('450000');
    await request(app)
      .put(`/api/v1/invoices/${inv.id}/lines`)
      .set(auth('CASHIER'))
      .send({ version: inv.version, lines: [{ serviceId, qty: 1 }] })
      .expect(409);
    const issued = await request(app)
      .post(`/api/v1/invoices/${inv.id}/issue`)
      .set(auth('CASHIER'))
      .expect(200);
    expect((issued.body as InvoiceBody).number).toMatch(/^\d{4}-[0-9A-F]{6}-\d{6}$/);
    await request(app).post(`/api/v1/invoices/${inv.id}/issue`).set(auth('CASHIER')).expect(409);
    await request(app)
      .put(`/api/v1/invoices/${inv.id}/lines`)
      .set(auth('CASHIER'))
      .send({ version: 99, lines: [{ serviceId, qty: 1 }] })
      .expect(409);
  });

  it('issues gap-free sequential numbers', async () => {
    const x = await newIssuedInvoice(1000);
    const y = await newIssuedInvoice(1000);
    const seq = (n: string) => Number(n.split('-')[2]);
    expect(seq(y.number)).toBe(seq(x.number) + 1);
  });

  it('requires an open shift for cash, then takes partial and full payments', async () => {
    const inv = await newIssuedInvoice(100_000);
    await pay(inv.id, 'CASH', '40000').expect(409); // no shift
    await pay(inv.id, 'CARD', '10000').expect(201); // non-cash needs no shift

    await request(app)
      .post('/api/v1/cash-shifts')
      .set(auth('CASHIER'))
      .send({ branchId: a.branchId, openingFloat: '50000' })
      .expect(201);
    await request(app)
      .post('/api/v1/cash-shifts')
      .set(auth('CASHIER'))
      .send({ branchId: a.branchId })
      .expect(409); // already open

    await pay(inv.id, 'CASH', '40000').expect(201);
    let cur = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect(cur.body).toMatchObject({ status: 'PARTIAL', paidAmount: '50000', balance: '50000' });
    await pay(inv.id, 'CASH', '50001').expect(422); // overpay
    await pay(inv.id, 'CASH', '50000').expect(201);
    cur = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect(cur.body).toMatchObject({ status: 'PAID', balance: '0' });
    await pay(inv.id, 'CASH', '1').expect(409); // already paid
  });

  it('payments are idempotent per Idempotency-Key', async () => {
    const inv = await newIssuedInvoice(80_000);
    const k = idem();
    const first = await pay(inv.id, 'CASH', '30000', k).expect(201);
    const replay = await pay(inv.id, 'CASH', '30000', k).expect(200);
    expect((replay.body as { id: string }).id).toBe((first.body as { id: string }).id);
    await pay(inv.id, 'CASH', '31000', k).expect(409); // same key, different request
    await request(app)
      .post(`/api/v1/invoices/${inv.id}/payments`)
      .set(auth('CASHIER'))
      .send({ method: 'CASH', amount: '1000' })
      .expect(422); // key is mandatory
    const cur = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect((cur.body as InvoiceBody).paidAmount).toBe('30000');
  });

  it('never overpays under concurrent payments (CAS)', async () => {
    const inv = await newIssuedInvoice(100_000);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => pay(inv.id, 'CARD', '30000')),
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3); // 3 x 30000 = 90000; a 4th would exceed... 120000 > 100000
    expect(results.every((r) => [201, 422, 409].includes(r.status))).toBe(true);
    const cur = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect((cur.body as InvoiceBody).paidAmount).toBe('90000');
  });

  it('refunds: only roles with billing:refund, bounded by the payment, restoring the invoice state', async () => {
    const inv = await newIssuedInvoice(60_000);
    const p = (await pay(inv.id, 'CASH', '60000').expect(201)).body as { id: string };
    await request(app)
      .post(`/api/v1/payments/${p.id}/refunds`)
      .set(auth('REGISTRAR'))
      .send({ amount: '1000', reason: 'registrar cannot' })
      .expect(403);
    await request(app)
      .post(`/api/v1/payments/${p.id}/refunds`)
      .set(auth('CASHIER'))
      .send({ amount: '70000', reason: 'too much' })
      .expect(422);
    await request(app)
      .post(`/api/v1/payments/${p.id}/refunds`)
      .set(auth('CASHIER'))
      .send({ amount: '20000', reason: 'Xizmat bajarilmadi' })
      .expect(201);
    const cur = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect(cur.body).toMatchObject({ status: 'PARTIAL', paidAmount: '40000' });
    await request(app)
      .post(`/api/v1/payments/${p.id}/refunds`)
      .set(auth('CASHIER'))
      .send({ amount: '40001', reason: 'over refund' })
      .expect(422);
    await request(app)
      .post(`/api/v1/payments/${p.id}/refunds`)
      .set(auth('CASHIER'))
      .send({ amount: '40000', reason: 'Qolgan qismi' })
      .expect(201);
    const after = await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER'));
    expect(after.body).toMatchObject({ status: 'ISSUED', paidAmount: '0' });
  });

  it('void: only unpaid invoices', async () => {
    const paid = await newIssuedInvoice(10_000);
    await pay(paid.id, 'CARD', '10000').expect(201);
    await request(app).post(`/api/v1/invoices/${paid.id}/void`).set(auth('CASHIER')).expect(409);
    const unpaid = await newIssuedInvoice(10_000);
    const v = await request(app)
      .post(`/api/v1/invoices/${unpaid.id}/void`)
      .set(auth('CASHIER'))
      .expect(200);
    expect((v.body as InvoiceBody).status).toBe('VOID');
    await pay(unpaid.id, 'CARD', '10000').expect(409);
  });

  it('closes a shift with expected cash and the counted difference', async () => {
    const cur = await request(app)
      .get('/api/v1/cash-shifts/current')
      .set(auth('CASHIER'))
      .expect(200);
    const shift = (cur.body as { shift: { id: string; openingFloat: string } }).shift;
    expect(shift.openingFloat).toBe('50000');
    // cash in this shift (see earlier tests), computed from the DB independently:
    const t = db.forTenant(a.clinicId);
    const cash = (
      await t.payment.findMany({ where: { cashShiftId: shift.id, method: 'CASH' } })
    ).reduce((s, p) => s + p.amount, 0n);
    const refunded = (await t.refund.findMany({ where: { cashShiftId: shift.id } })).reduce(
      (s, r) => s + r.amount,
      0n,
    );
    const expected = 50_000n + cash - refunded;
    const closed = await request(app)
      .post('/api/v1/cash-shifts/current/close')
      .set(auth('CASHIER'))
      .send({ countedCash: String(expected - 500n) })
      .expect(200);
    expect(closed.body).toMatchObject({
      status: 'CLOSED',
      expectedCash: expected.toString(),
      difference: '-500',
    });
    await request(app)
      .post('/api/v1/cash-shifts/current/close')
      .set(auth('CASHIER'))
      .send({ countedCash: '0' })
      .expect(404);
    // cash is blocked again once the shift is closed
    const inv = await newIssuedInvoice(5_000);
    await pay(inv.id, 'CASH', '5000').expect(409);
  });

  it('enforces RBAC and tenant isolation', async () => {
    await request(app).get('/api/v1/invoices').set(auth('DOCTOR')).expect(403);
    const inv = await newIssuedInvoice(5_000);
    await request(app).get(`/api/v1/invoices/${inv.id}`).set(auth('CASHIER_B')).expect(404);
    await pay(inv.id, 'CARD', '5000', idem(), 'CASHIER_B').expect(404);
    const list = await request(app).get('/api/v1/invoices').set(auth('CASHIER_B')).expect(200);
    expect((list.body as { items: unknown[] }).items).toEqual([]);
  });

  it('online providers are explicit stubs', async () => {
    const inv = await newIssuedInvoice(5_000);
    const res = await request(app)
      .post(`/api/v1/invoices/${inv.id}/online-payments/CLICK`)
      .set(auth('CASHIER'));
    expect(res.status).toBe(501);
    expect((res.body as { code: string }).code).toBe('NOT_IMPLEMENTED');
  });

  it('audits money movements and renders an 80mm receipt PDF', async () => {
    const t = db.forTenant(a.clinicId);
    const actions = (await t.auditLog.findMany()).map((x) => x.action);
    for (const want of [
      'invoice.issued',
      'payment.created',
      'payment.refunded',
      'shift.opened',
      'shift.closed',
    ]) {
      expect(actions).toContain(want);
    }
    if (!canRenderPdf()) return;
    const anyPay = await t.payment.findFirstOrThrow({});
    const res = await request(app)
      .get(`/api/v1/payments/${anyPay.id}/receipt`)
      .query({ lang: 'ru' })
      .set(auth('CASHIER'))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => {
          cb(null, Buffer.concat(chunks));
        });
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
