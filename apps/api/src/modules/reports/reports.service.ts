import type { ReportQuery } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import type { AuthContext } from '../../core/context.js';
import { recordAudit } from '../../core/audit.js';
import { AppError } from '../../core/errors.js';
import { dayOf, todayIn, zonedToUtc } from '../../core/time.js';

type Cell = string | number | null;
export interface ReportResult {
  columns: string[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
}

const big = (v: bigint): string => v.toString();

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return dayOf(d);
}

export function reportsService(db: Db) {
  async function window(ctx: AuthContext, q: ReportQuery) {
    const t = db.forTenant(ctx.clinicId);
    if (q.branchId && !(await t.branch.findFirst({ where: { id: q.branchId } }))) {
      throw new AppError(404, 'NOT_FOUND', 'Branch not found');
    }
    const branch = await t.branch.findFirst({
      where: q.branchId ? { id: q.branchId } : {},
      orderBy: { createdAt: 'asc' },
    });
    const tz = branch?.timezone ?? 'Asia/Tashkent';
    return {
      t,
      tz,
      start: zonedToUtc(q.from, '00:00', tz),
      end: zonedToUtc(nextDay(q.to), '00:00', tz),
    };
  }
  const localDay = (d: Date, tz: string): string => todayIn(tz, d);

  const reports: Record<string, (ctx: AuthContext, q: ReportQuery) => Promise<ReportResult>> = {
    /** Cash received, refunded and net, per local day and payment method. */
    async revenue(ctx, q) {
      const { t, tz, start, end } = await window(ctx, q);
      const inv = q.branchId ? { invoice: { branchId: q.branchId } } : {};
      const [pays, refunds] = await Promise.all([
        t.payment.findMany({
          where: { createdAt: { gte: start, lt: end }, ...inv },
          select: { createdAt: true, method: true, amount: true },
        }),
        t.refund.findMany({
          where: { createdAt: { gte: start, lt: end }, payment: inv },
          select: { createdAt: true, amount: true, payment: { select: { method: true } } },
        }),
      ]);
      const acc = new Map<
        string,
        { date: string; method: string; received: bigint; refunded: bigint }
      >();
      const slot = (date: string, method: string) => {
        const k = `${date}|${method}`;
        let s = acc.get(k);
        if (!s) acc.set(k, (s = { date, method, received: 0n, refunded: 0n }));
        return s;
      };
      for (const p of pays) slot(localDay(p.createdAt, tz), p.method).received += p.amount;
      for (const r of refunds)
        slot(localDay(r.createdAt, tz), r.payment.method).refunded += r.amount;
      const list = [...acc.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || a.method.localeCompare(b.method),
      );
      const received = list.reduce((s, r) => s + r.received, 0n);
      const refunded = list.reduce((s, r) => s + r.refunded, 0n);
      return {
        columns: ['date', 'method', 'received', 'refunded', 'net'],
        rows: list.map((r) => ({
          date: r.date,
          method: r.method,
          received: big(r.received),
          refunded: big(r.refunded),
          net: big(r.received - r.refunded),
        })),
        totals: { received: big(received), refunded: big(refunded), net: big(received - refunded) },
      };
    },

    /** Net revenue attributed to the doctor of the invoice's encounter ("unassigned" otherwise). */
    async 'revenue-by-doctor'(ctx, q) {
      const { t, start, end } = await window(ctx, q);
      const inv = q.branchId ? { branchId: q.branchId } : {};
      const [pays, refunds] = await Promise.all([
        t.payment.findMany({
          where: { createdAt: { gte: start, lt: end }, invoice: inv },
          select: { amount: true, invoice: { select: { id: true, encounterId: true } } },
        }),
        t.refund.findMany({
          where: { createdAt: { gte: start, lt: end }, payment: { invoice: inv } },
          select: {
            amount: true,
            payment: { select: { invoice: { select: { encounterId: true } } } },
          },
        }),
      ]);
      const encIds = [
        ...new Set([
          ...pays.map((p) => p.invoice.encounterId),
          ...refunds.map((r) => r.payment.invoice.encounterId),
        ]),
      ].filter((x): x is string => x !== null);
      const encs = await t.encounter.findMany({
        where: { id: { in: encIds } },
        select: { id: true, doctorId: true },
      });
      const doctorOf = new Map(encs.map((e) => [e.id, e.doctorId]));
      const users = await t.user.findMany({
        where: { id: { in: [...new Set(encs.map((e) => e.doctorId))] } },
        select: { id: true, fullName: true },
      });
      const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
      const acc = new Map<string, { received: bigint; refunded: bigint; invoices: Set<string> }>();
      const slot = (doctor: string) => {
        let s = acc.get(doctor);
        if (!s) acc.set(doctor, (s = { received: 0n, refunded: 0n, invoices: new Set() }));
        return s;
      };
      const key = (encId: string | null) =>
        encId ? (doctorOf.get(encId) ?? 'unassigned') : 'unassigned';
      for (const p of pays) {
        const s = slot(key(p.invoice.encounterId));
        s.received += p.amount;
        s.invoices.add(p.invoice.id);
      }
      for (const r of refunds) slot(key(r.payment.invoice.encounterId)).refunded += r.amount;
      return {
        columns: ['doctorId', 'doctor', 'invoices', 'received', 'refunded', 'net'],
        rows: [...acc.entries()]
          .map(([id, s]) => ({
            doctorId: id,
            doctor: nameOf.get(id) ?? (id === 'unassigned' ? 'Unassigned' : id),
            invoices: s.invoices.size,
            received: big(s.received),
            refunded: big(s.refunded),
            net: big(s.received - s.refunded),
            _n: s.received - s.refunded,
          }))
          .sort((a, b) => (b._n > a._n ? 1 : b._n < a._n ? -1 : 0))
          .map(({ _n: _ignored, ...r }) => r),
      };
    },

    /** Billed amount per service on issued (non-void) invoices. */
    async services(ctx, q) {
      const { t, start, end } = await window(ctx, q);
      const lines = await t.invoiceLine.findMany({
        where: {
          invoice: {
            status: { in: ['ISSUED', 'PARTIAL', 'PAID'] },
            issuedAt: { gte: start, lt: end },
            ...(q.branchId ? { branchId: q.branchId } : {}),
          },
        },
        select: { serviceId: true, description: true, qty: true, total: true },
      });
      const acc = new Map<string, { service: string; qty: number; total: bigint }>();
      for (const l of lines) {
        const k = l.serviceId ?? `custom:${l.description}`;
        const s = acc.get(k) ?? { service: l.description, qty: 0, total: 0n };
        s.qty += l.qty;
        s.total += l.total;
        acc.set(k, s);
      }
      const list = [...acc.values()].sort((a, b) =>
        b.total > a.total ? 1 : b.total < a.total ? -1 : 0,
      );
      return {
        columns: ['service', 'qty', 'total'],
        rows: list.map((s) => ({ service: s.service, qty: s.qty, total: big(s.total) })),
        totals: { total: big(list.reduce((s, r) => s + r.total, 0n)) },
      };
    },

    /** Signed encounters per local day and doctor. */
    async visits(ctx, q) {
      const { t, tz, start, end } = await window(ctx, q);
      const encs = await t.encounter.findMany({
        where: {
          status: 'SIGNED',
          signedAt: { gte: start, lt: end },
          ...(q.branchId ? { branchId: q.branchId } : {}),
        },
        select: { signedAt: true, doctorId: true },
      });
      const users = await t.user.findMany({
        where: { id: { in: [...new Set(encs.map((e) => e.doctorId))] } },
        select: { id: true, fullName: true },
      });
      const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
      const acc = new Map<string, { date: string; doctorId: string; visits: number }>();
      for (const e of encs) {
        const date = localDay(e.signedAt ?? start, tz);
        const k = `${date}|${e.doctorId}`;
        const s = acc.get(k) ?? { date, doctorId: e.doctorId, visits: 0 };
        s.visits++;
        acc.set(k, s);
      }
      const list = [...acc.values()].sort((a, b) => a.date.localeCompare(b.date));
      return {
        columns: ['date', 'doctorId', 'doctor', 'visits'],
        rows: list.map((r) => ({ ...r, doctor: nameOf.get(r.doctorId) ?? '' })),
        totals: { visits: list.reduce((s, r) => s + r.visits, 0) },
      };
    },

    /** Appointments by status, with the no-show rate (percent with one decimal, integer math). */
    async appointments(ctx, q) {
      const { t, start, end } = await window(ctx, q);
      const groups = await t.appointment.groupBy({
        by: ['status'],
        where: {
          startsAt: { gte: start, lt: end },
          ...(q.branchId ? { branchId: q.branchId } : {}),
        },
        _count: { _all: true },
      });
      const total = groups.reduce((s, g) => s + g._count._all, 0);
      const noShow = groups.find((g) => g.status === 'NO_SHOW')?._count._all ?? 0;
      const tenths = total === 0 ? 0 : Math.round((noShow * 1000) / total);
      return {
        columns: ['status', 'count'],
        rows: groups
          .map((g) => ({ status: g.status, count: g._count._all }))
          .sort((a, b) => a.status.localeCompare(b.status)),
        totals: {
          total,
          noShowRatePercent: `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`,
        },
      };
    },

    /** Open balances (issued/partial invoices), oldest first. Patient ids only, no names. */
    async debts(ctx, q) {
      const { t, tz } = await window(ctx, q);
      const invs = await t.invoice.findMany({
        where: {
          status: { in: ['ISSUED', 'PARTIAL'] },
          ...(q.branchId ? { branchId: q.branchId } : {}),
        },
        orderBy: { issuedAt: 'asc' },
        take: 5000,
      });
      const today = todayIn(tz);
      const rows = invs.map((i) => {
        const issued = i.issuedAt ? localDay(i.issuedAt, tz) : today;
        return {
          number: i.number,
          patientId: i.patientId,
          issuedOn: issued,
          ageDays: Math.round((Date.parse(today) - Date.parse(issued)) / 86_400_000),
          total: big(i.total),
          paid: big(i.paidAmount),
          balance: big(i.total - i.paidAmount),
        };
      });
      return {
        columns: ['number', 'patientId', 'issuedOn', 'ageDays', 'total', 'paid', 'balance'],
        rows,
        totals: { balance: big(invs.reduce((s, i) => s + (i.total - i.paidAmount), 0n)) },
      };
    },

    /** Closed cash shifts with expected vs counted cash. */
    async 'cash-shifts'(ctx, q) {
      const { t, tz, start, end } = await window(ctx, q);
      const shifts = await t.cashShift.findMany({
        where: {
          status: 'CLOSED',
          closedAt: { gte: start, lt: end },
          ...(q.branchId ? { branchId: q.branchId } : {}),
        },
        orderBy: { closedAt: 'asc' },
      });
      const users = await t.user.findMany({
        where: { id: { in: [...new Set(shifts.map((s) => s.cashierId))] } },
        select: { id: true, fullName: true },
      });
      const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
      return {
        columns: [
          'shiftId',
          'cashier',
          'closedOn',
          'openingFloat',
          'expectedCash',
          'countedCash',
          'difference',
        ],
        rows: shifts.map((s) => ({
          shiftId: s.id,
          cashier: nameOf.get(s.cashierId) ?? '',
          closedOn: s.closedAt ? localDay(s.closedAt, tz) : null,
          openingFloat: big(s.openingFloat),
          expectedCash: s.expectedCash === null ? null : big(s.expectedCash),
          countedCash: s.countedCash === null ? null : big(s.countedCash),
          difference: s.difference === null ? null : big(s.difference),
        })),
      };
    },
  };

  return {
    async run(ctx: AuthContext, name: string, q: ReportQuery): Promise<ReportResult> {
      const fn = reports[name];
      if (!fn) throw new AppError(404, 'NOT_FOUND', 'Unknown report');
      const result = await fn(ctx, q);
      await db.forTenant(ctx.clinicId).$transaction((tx) =>
        recordAudit(tx, ctx, {
          action: q.format === 'csv' ? 'report.exported' : 'report.viewed',
          entityType: 'Report',
          entityId: ctx.clinicId,
          after: { name, from: q.from, to: q.to },
        }),
      );
      return result;
    },
  };
}
export type ReportsService = ReturnType<typeof reportsService>;
