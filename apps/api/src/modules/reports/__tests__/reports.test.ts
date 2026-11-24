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

interface Report {
  columns: string[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
}

describe.skipIf(!hasDatabase)('reports', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  const tok: Record<string, string> = {};
  const auth = (k: string) => ({ Authorization: `Bearer ${tok[k]}` });
  const q = { from: '2030-03-01', to: '2030-03-31' };
  const get = (name: string, who = 'OWNER', extra: object = {}) =>
    request(app)
      .get(`/api/v1/reports/${name}`)
      .query({ ...q, ...extra })
      .set(auth(who));

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(testEnv(), createLogger('silent'), db);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    for (const r of ['OWNER', 'ADMIN', 'DOCTOR', 'CASHIER'] as const) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ login: a.users[r]?.login, password: PASSWORD });
      tok[r] = (res.body as { accessToken: string }).accessToken;
    }
    const resB = await request(app)
      .post('/api/v1/auth/login')
      .send({ login: b.users.OWNER?.login, password: PASSWORD });
    tok.OWNER_B = (resB.body as { accessToken: string }).accessToken;

    const t = db.forTenant(a.clinicId);
    const doctorId = a.users.DOCTOR?.id ?? '';
    const cashierId = a.users.CASHIER?.id ?? '';
    const patient = await t.patient.create({
      data: {
        clinicId: a.clinicId,
        lastName: '=HYPERLINK("x")',
        firstName: 'Hisobot',
        birthDate: new Date('1990-01-01'),
        sex: 'MALE',
        phone: '+998901234500',
      },
    });
    const enc = await t.encounter.create({
      data: {
        clinicId: a.clinicId,
        branchId: a.branchId,
        patientId: patient.id,
        doctorId,
        status: 'SIGNED',
        signedAt: new Date('2030-03-10T06:00:00Z'),
      },
    });
    const mkInvoice = async (
      n: string,
      total: bigint,
      paid: bigint,
      status: 'PAID' | 'PARTIAL' | 'ISSUED',
      encId: string | null,
      issuedAt: string,
    ) =>
      t.invoice.create({
        data: {
          clinicId: a.clinicId,
          branchId: a.branchId,
          patientId: patient.id,
          encounterId: encId,
          number: n,
          status,
          subtotal: total,
          total,
          paidAmount: paid,
          createdByUserId: cashierId,
          issuedAt: new Date(issuedAt),
          lines: {
            create: [
              {
                clinicId: a.clinicId,
                description: 'Konsultatsiya',
                qty: 1,
                unitPrice: total,
                total,
              },
            ],
          },
        },
      });
    const i1 = await mkInvoice('R-1', 100_000n, 100_000n, 'PAID', enc.id, '2030-03-10T05:00:00Z');
    const i2 = await mkInvoice('R-2', 200_000n, 50_000n, 'PARTIAL', null, '2030-03-11T05:00:00Z');
    await mkInvoice('R-3', 70_000n, 0n, 'ISSUED', null, '2030-03-12T05:00:00Z');
    const pay = (
      invoiceId: string,
      method: 'CASH' | 'CARD',
      amount: bigint,
      at: string,
      key: string,
    ) =>
      t.payment.create({
        data: {
          clinicId: a.clinicId,
          invoiceId,
          method,
          amount,
          idempotencyKey: key,
          receivedByUserId: cashierId,
          createdAt: new Date(at),
        },
      });
    const p1 = await pay(i1.id, 'CASH', 100_000n, '2030-03-10T06:30:00Z', 'k-report-1');
    await pay(i2.id, 'CARD', 50_000n, '2030-03-11T06:30:00Z', 'k-report-2');
    await t.refund.create({
      data: {
        clinicId: a.clinicId,
        paymentId: p1.id,
        amount: 10_000n,
        reason: 'test refund',
        createdByUserId: cashierId,
        createdAt: new Date('2030-03-12T07:00:00Z'),
      },
    });
    // outside the window: must not count
    await pay(i2.id, 'CASH', 1_000n, '2030-04-05T06:30:00Z', 'k-report-3');

    for (const [status, n] of [
      ['COMPLETED', 3],
      ['NO_SHOW', 1],
    ] as const) {
      for (let k = 0; k < n; k++) {
        await t.appointment.create({
          data: {
            clinicId: a.clinicId,
            branchId: a.branchId,
            patientId: patient.id,
            doctorId,
            status,
            startsAt: new Date(
              `2030-03-15T0${String(k + 1)}:00:00Z`.replace(
                '01',
                status === 'NO_SHOW' ? '08' : '01',
              ),
            ),
            endsAt: new Date(
              `2030-03-15T0${String(k + 1)}:30:00Z`.replace(
                '01',
                status === 'NO_SHOW' ? '08' : '01',
              ),
            ),
          },
        });
      }
    }
    await t.cashShift.create({
      data: {
        clinicId: a.clinicId,
        branchId: a.branchId,
        cashierId,
        status: 'CLOSED',
        openingFloat: 10_000n,
        expectedCash: 100_000n,
        countedCash: 99_000n,
        difference: -1_000n,
        closedAt: new Date('2030-03-10T14:00:00Z'),
      },
    });
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  });

  it('revenue: received, refunded and net by day and method within the window', async () => {
    const res = await get('revenue').expect(200);
    const r = res.body as Report;
    expect(r.totals).toEqual({ received: '150000', refunded: '10000', net: '140000' });
    expect(r.rows).toContainEqual({
      date: '2030-03-10',
      method: 'CASH',
      received: '100000',
      refunded: '0',
      net: '100000',
    });
    expect(r.rows).toContainEqual({
      date: '2030-03-12',
      method: 'CASH',
      received: '0',
      refunded: '10000',
      net: '-10000',
    });
    expect(r.rows).toContainEqual({
      date: '2030-03-11',
      method: 'CARD',
      received: '50000',
      refunded: '0',
      net: '50000',
    });
  });

  it('revenue by doctor attributes through the encounter; others are unassigned', async () => {
    const r = (await get('revenue-by-doctor').expect(200)).body as Report;
    const doc = r.rows.find((x) => x.doctorId === a.users.DOCTOR?.id);
    expect(doc).toMatchObject({ invoices: 1, received: '100000', refunded: '10000', net: '90000' });
    expect(r.rows.find((x) => x.doctorId === 'unassigned')).toMatchObject({
      received: '50000',
      net: '50000',
    });
  });

  it('services, visits, appointments, debts and cash shifts', async () => {
    const services = (await get('services').expect(200)).body as Report;
    expect(services.totals).toEqual({ total: '370000' });

    const visits = (await get('visits').expect(200)).body as Report;
    expect(visits.totals).toEqual({ visits: 1 });
    expect(visits.rows[0]).toMatchObject({
      date: '2030-03-10',
      doctor: expect.stringContaining('DOCTOR') as string,
    });

    const appts = (await get('appointments').expect(200)).body as Report;
    expect(appts.totals).toEqual({ total: 4, noShowRatePercent: '25.0' });

    const debts = (await get('debts').expect(200)).body as Report;
    expect(debts.rows.map((x) => x.number)).toEqual(['R-2', 'R-3']);
    expect(debts.totals).toEqual({ balance: '220000' }); // 150000 + 70000
    expect(JSON.stringify(debts)).not.toContain('HYPERLINK'); // no patient names in debts

    const shifts = (await get('cash-shifts').expect(200)).body as Report;
    expect(shifts.rows[0]).toMatchObject({
      expectedCash: '100000',
      countedCash: '99000',
      difference: '-1000',
    });
  });

  it('exports CSV with a BOM and an attachment filename', async () => {
    const res = await get('revenue', 'OWNER', { format: 'csv' }).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('revenue-2030-03-01_2030-03-31.csv');
    expect(res.text.startsWith('﻿date,method,received,refunded,net')).toBe(true);
    expect(res.text).toContain('2030-03-12,CASH,0,10000,-10000');
  });

  it('validates the range and the report name', async () => {
    await request(app)
      .get('/api/v1/reports/revenue')
      .query({ from: '2030-03-05', to: '2030-03-01' })
      .set(auth('OWNER'))
      .expect(422);
    await request(app)
      .get('/api/v1/reports/revenue')
      .query({ from: '2020-01-01', to: '2030-01-01' })
      .set(auth('OWNER'))
      .expect(422);
    await request(app).get('/api/v1/reports/nope').query(q).set(auth('OWNER')).expect(422);
    await get('revenue', 'OWNER', { branchId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('is limited to OWNER/ADMIN, isolated per clinic, and audited', async () => {
    await get('revenue', 'DOCTOR').expect(403);
    await get('revenue', 'CASHIER').expect(403);
    await get('revenue', 'ADMIN').expect(200);
    const other = (await get('revenue', 'OWNER_B').expect(200)).body as Report;
    expect(other.rows).toEqual([]);
    const audit = await db
      .forTenant(a.clinicId)
      .auditLog.findMany({ where: { action: { in: ['report.viewed', 'report.exported'] } } });
    expect(audit.length).toBeGreaterThanOrEqual(5);
  });
});
