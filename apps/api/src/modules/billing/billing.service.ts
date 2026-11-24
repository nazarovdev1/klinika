import type {
  closeShiftSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createRefundSchema,
  invoiceListSchema,
  openShiftSchema,
  replaceInvoiceLinesSchema,
} from '@shifo/contracts';
import type { Db, TenantClient } from '@shifo/db';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { expectedCash, invoiceTotals, MoneyError, statusFor, type LineAmounts } from './money.js';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];
type Lines = z.infer<typeof createInvoiceSchema>['lines'];

const money = (v: bigint): string => v.toString();

function invoiceDto(i: {
  id: string;
  branchId: string;
  patientId: string;
  encounterId: string | null;
  number: string;
  status: string;
  subtotal: bigint;
  discount: bigint;
  total: bigint;
  paidAmount: bigint;
  issuedAt: Date | null;
  version: number;
  createdAt: Date;
  lines?: {
    id: string;
    serviceId: string | null;
    description: string;
    qty: number;
    unitPrice: bigint;
    discount: bigint;
    total: bigint;
  }[];
  payments?: {
    id: string;
    method: string;
    amount: bigint;
    refundedAmount: bigint;
    createdAt: Date;
  }[];
}) {
  return {
    id: i.id,
    branchId: i.branchId,
    patientId: i.patientId,
    encounterId: i.encounterId,
    number: i.number,
    status: i.status,
    subtotal: money(i.subtotal),
    discount: money(i.discount),
    total: money(i.total),
    paidAmount: money(i.paidAmount),
    balance: money(i.total - i.paidAmount),
    issuedAt: i.issuedAt?.toISOString() ?? null,
    version: i.version,
    createdAt: i.createdAt.toISOString(),
    lines: i.lines?.map((l) => ({
      ...l,
      unitPrice: money(l.unitPrice),
      discount: money(l.discount),
      total: money(l.total),
    })),
    payments: i.payments?.map((p) => ({
      id: p.id,
      method: p.method,
      amount: money(p.amount),
      refundedAmount: money(p.refundedAmount),
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

const paymentDto = (p: {
  id: string;
  invoiceId: string;
  method: string;
  amount: bigint;
  refundedAmount: bigint;
  cashShiftId: string | null;
  createdAt: Date;
}) => ({
  id: p.id,
  invoiceId: p.invoiceId,
  method: p.method,
  amount: money(p.amount),
  refundedAmount: money(p.refundedAmount),
  cashShiftId: p.cashShiftId,
  createdAt: p.createdAt.toISOString(),
});

const shiftDto = (s: {
  id: string;
  branchId: string;
  cashierId: string;
  status: string;
  openingFloat: bigint;
  expectedCash: bigint | null;
  countedCash: bigint | null;
  difference: bigint | null;
  openedAt: Date;
  closedAt: Date | null;
}) => ({
  id: s.id,
  branchId: s.branchId,
  cashierId: s.cashierId,
  status: s.status,
  openingFloat: money(s.openingFloat),
  expectedCash: s.expectedCash === null ? null : money(s.expectedCash),
  countedCash: s.countedCash === null ? null : money(s.countedCash),
  difference: s.difference === null ? null : money(s.difference),
  openedAt: s.openedAt.toISOString(),
  closedAt: s.closedAt?.toISOString() ?? null,
});

const isRetryable = (e: unknown): boolean =>
  (e instanceof AppError && e.status === 409 && e.message === 'RETRY') ||
  (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002');

export function billingService(db: Db) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < 6; i++) {
      try {
        return await fn();
      } catch (e) {
        if (!isRetryable(e)) throw e;
        last = e;
      }
    }
    if (last instanceof AppError) {
      throw new AppError(409, 'CONFLICT', 'The invoice is being modified concurrently, retry');
    }
    throw last;
  }

  /** Resolves input lines to priced lines. Catalog prices are authoritative. */
  async function priceLines(tx: Tx, branchId: string, lines: Lines) {
    const now = new Date();
    const out: (LineAmounts & { serviceId: string | null; description: string })[] = [];
    for (const l of lines) {
      if (l.serviceId) {
        const service = await tx.service.findFirst({
          where: { id: l.serviceId, deletedAt: null, isActive: true },
        });
        if (!service) throw new AppError(404, 'NOT_FOUND', 'Service not found');
        const price = await tx.servicePrice.findFirst({
          where: {
            serviceId: l.serviceId,
            branchId,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          orderBy: { validFrom: 'desc' },
        });
        if (!price) {
          throw new AppError(422, 'VALIDATION_ERROR', 'No active price for the service', [
            { path: 'lines', message: `no price for ${service.code}` },
          ]);
        }
        out.push({
          serviceId: service.id,
          description: service.nameUz,
          qty: l.qty,
          unitPrice: price.price,
          discount: BigInt(l.discount),
        });
      } else {
        out.push({
          serviceId: null,
          description: l.description ?? '',
          qty: l.qty,
          unitPrice: BigInt(l.unitPrice ?? '0'),
          discount: BigInt(l.discount),
        });
      }
    }
    return out;
  }

  function totalsOrThrow(lines: LineAmounts[], discount: string) {
    try {
      return invoiceTotals(lines, BigInt(discount));
    } catch (e) {
      if (e instanceof MoneyError) {
        throw new AppError(422, 'VALIDATION_ERROR', e.message, [
          { path: 'lines', message: e.message },
        ]);
      }
      throw e;
    }
  }

  async function writeLines(
    tx: Tx,
    ctx: AuthContext,
    invoiceId: string,
    priced: Awaited<ReturnType<typeof priceLines>>,
  ) {
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    await tx.invoiceLine.createMany({
      data: priced.map((l) => ({
        clinicId: ctx.clinicId,
        invoiceId,
        serviceId: l.serviceId,
        description: l.description,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discount: l.discount,
        total: l.unitPrice * BigInt(l.qty) - l.discount,
      })),
    });
  }

  const fullInvoice = (tx: Pick<Tx, 'invoice'>, id: string) =>
    tx.invoice.findFirstOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });

  async function loadInvoice(tx: Pick<Tx, 'invoice'>, id: string) {
    const inv = await tx.invoice.findFirst({ where: { id } });
    if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    return inv;
  }

  async function openShiftFor(tx: Tx, ctx: AuthContext) {
    return tx.cashShift.findFirst({ where: { cashierId: ctx.userId, status: 'OPEN' } });
  }

  return {
    // ---- invoices ---------------------------------------------------------------------------
    async createInvoice(ctx: AuthContext, input: z.infer<typeof createInvoiceSchema>) {
      return tenant(ctx).$transaction(async (tx) => {
        if (!(await tx.patient.findFirst({ where: { id: input.patientId, deletedAt: null } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Patient not found');
        }
        if (!(await tx.branch.findFirst({ where: { id: input.branchId } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        }
        if (input.encounterId) {
          const enc = await tx.encounter.findFirst({ where: { id: input.encounterId } });
          if (enc?.patientId !== input.patientId) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Encounter does not match the patient', [
              { path: 'encounterId', message: 'unknown encounter for this patient' },
            ]);
          }
        }
        const priced = await priceLines(tx, input.branchId, input.lines);
        const totals = totalsOrThrow(priced, input.discount);
        const inv = await tx.invoice.create({
          data: {
            clinicId: ctx.clinicId,
            branchId: input.branchId,
            patientId: input.patientId,
            encounterId: input.encounterId ?? null,
            number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
            createdByUserId: ctx.userId,
            ...totals,
          },
        });
        await writeLines(tx, ctx, inv.id, priced);
        await recordAudit(tx, ctx, {
          action: 'invoice.created',
          entityType: 'Invoice',
          entityId: inv.id,
          after: { total: money(totals.total) },
        });
        return invoiceDto(await fullInvoice(tx, inv.id));
      });
    },

    async replaceLines(
      ctx: AuthContext,
      id: string,
      input: z.infer<typeof replaceInvoiceLinesSchema>,
    ) {
      return tenant(ctx).$transaction(async (tx) => {
        const inv = await loadInvoice(tx, id);
        if (inv.status !== 'DRAFT')
          throw new AppError(409, 'CONFLICT', 'Only drafts can be edited');
        const priced = await priceLines(tx, inv.branchId, input.lines);
        const totals = totalsOrThrow(priced, input.discount);
        const res = await tx.invoice.updateMany({
          where: { id, status: 'DRAFT', version: input.version },
          data: { ...totals, version: { increment: 1 } },
        });
        if (res.count === 0)
          throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
        await writeLines(tx, ctx, id, priced);
        await recordAudit(tx, ctx, {
          action: 'invoice.updated',
          entityType: 'Invoice',
          entityId: id,
          after: { total: money(totals.total) },
        });
        return invoiceDto(await fullInvoice(tx, id));
      });
    },

    /** Issuing freezes the lines and assigns the gap-free invoice number. */
    async issue(ctx: AuthContext, id: string) {
      return tenant(ctx).$transaction(async (tx) => {
        const inv = await loadInvoice(tx, id);
        if (inv.status !== 'DRAFT')
          throw new AppError(409, 'CONFLICT', 'Invoice is already issued');
        if (inv.total === 0n)
          throw new AppError(422, 'VALIDATION_ERROR', 'Cannot issue a zero invoice');
        const year = String(new Date().getUTCFullYear());
        const seq = await tx.numberSequence.upsert({
          where: {
            clinicId_branchId_key_date: {
              clinicId: ctx.clinicId,
              branchId: inv.branchId,
              key: 'invoice',
              date: year,
            },
          },
          create: {
            clinicId: ctx.clinicId,
            branchId: inv.branchId,
            key: 'invoice',
            date: year,
            value: 1,
          },
          update: { value: { increment: 1 } },
        });
        const number = `${year}-${inv.branchId.slice(0, 6).toUpperCase()}-${String(seq.value).padStart(6, '0')}`;
        const res = await tx.invoice.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'ISSUED', number, issuedAt: new Date(), version: { increment: 1 } },
        });
        if (res.count === 0) throw new AppError(409, 'CONFLICT', 'Invoice is already issued');
        await recordAudit(tx, ctx, {
          action: 'invoice.issued',
          entityType: 'Invoice',
          entityId: id,
          after: { number },
        });
        return invoiceDto(await fullInvoice(tx, id));
      });
    },

    /** Void is allowed only while nothing is paid (otherwise refund first). */
    async voidInvoice(ctx: AuthContext, id: string) {
      return tenant(ctx).$transaction(async (tx) => {
        const inv = await loadInvoice(tx, id);
        if (inv.status === 'VOID') throw new AppError(409, 'CONFLICT', 'Invoice is already void');
        if (inv.paidAmount > 0n) {
          throw new AppError(409, 'CONFLICT', 'Refund the payments before voiding the invoice');
        }
        const res = await tx.invoice.updateMany({
          where: { id, paidAmount: 0n, status: { not: 'VOID' } },
          data: { status: 'VOID', voidedAt: new Date(), version: { increment: 1 } },
        });
        if (res.count === 0) throw new AppError(409, 'CONFLICT', 'The invoice changed, retry');
        await recordAudit(tx, ctx, {
          action: 'invoice.voided',
          entityType: 'Invoice',
          entityId: id,
        });
        return invoiceDto(await fullInvoice(tx, id));
      });
    },

    async getInvoice(ctx: AuthContext, id: string) {
      const inv = await tenant(ctx).invoice.findFirst({
        where: { id },
        include: {
          lines: { orderBy: { createdAt: 'asc' } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
      return invoiceDto(inv);
    },

    async listInvoices(ctx: AuthContext, q: z.infer<typeof invoiceListSchema>) {
      const rows = await tenant(ctx).invoice.findMany({
        where: {
          ...(q.patientId && { patientId: q.patientId }),
          ...(q.status && { status: q.status }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, q.limit);
      return {
        items: page.map((r) => invoiceDto(r)),
        nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    // ---- payments ---------------------------------------------------------------------------
    /**
     * Idempotent per (clinic, Idempotency-Key): replays return the original payment. Concurrent payments
     * are serialized by a compare-and-set on the invoice version (bounded retry), so an invoice can never
     * be overpaid.
     */
    async pay(
      ctx: AuthContext,
      invoiceId: string,
      input: z.infer<typeof createPaymentSchema>,
      idempotencyKey: string,
    ) {
      const amount = BigInt(input.amount);
      return withRetry(() =>
        tenant(ctx).$transaction(async (tx) => {
          const existing = await tx.payment.findFirst({ where: { idempotencyKey } });
          if (existing) {
            if (
              existing.invoiceId !== invoiceId ||
              existing.amount !== amount ||
              existing.method !== input.method
            ) {
              throw new AppError(
                409,
                'CONFLICT',
                'Idempotency-Key was already used for another request',
              );
            }
            return { replayed: true, payment: paymentDto(existing) };
          }
          const inv = await loadInvoice(tx, invoiceId);
          if (inv.status !== 'ISSUED' && inv.status !== 'PARTIAL') {
            throw new AppError(409, 'CONFLICT', 'The invoice does not accept payments');
          }
          if (amount > inv.total - inv.paidAmount) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Payment exceeds the invoice balance', [
              { path: 'amount', message: `balance is ${money(inv.total - inv.paidAmount)}` },
            ]);
          }
          const shift = await openShiftFor(tx, ctx);
          if (input.method === 'CASH' && shift?.branchId !== inv.branchId) {
            throw new AppError(
              409,
              'CONFLICT',
              'Open a cash shift in this branch before taking cash',
            );
          }
          const paid = inv.paidAmount + amount;
          const res = await tx.invoice.updateMany({
            where: { id: invoiceId, version: inv.version },
            data: {
              paidAmount: paid,
              status: statusFor(inv.total, paid),
              version: { increment: 1 },
            },
          });
          if (res.count === 0) throw new AppError(409, 'CONFLICT', 'RETRY');
          const payment = await tx.payment.create({
            data: {
              clinicId: ctx.clinicId,
              invoiceId,
              method: input.method,
              amount,
              idempotencyKey,
              cashShiftId: input.method === 'CASH' ? (shift?.id ?? null) : null,
              receivedByUserId: ctx.userId,
            },
          });
          await recordAudit(tx, ctx, {
            action: 'payment.created',
            entityType: 'Payment',
            entityId: payment.id,
            after: { invoiceId, method: input.method, amount: money(amount) },
          });
          return { replayed: false, payment: paymentDto(payment) };
        }),
      );
    },

    async refund(ctx: AuthContext, paymentId: string, input: z.infer<typeof createRefundSchema>) {
      const amount = BigInt(input.amount);
      return withRetry(() =>
        tenant(ctx).$transaction(async (tx) => {
          const pay = await tx.payment.findFirst({ where: { id: paymentId } });
          if (!pay) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
          if (amount > pay.amount - pay.refundedAmount) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Refund exceeds the refundable amount', [
              {
                path: 'amount',
                message: `refundable is ${money(pay.amount - pay.refundedAmount)}`,
              },
            ]);
          }
          const inv = await loadInvoice(tx, pay.invoiceId);
          const shift = await openShiftFor(tx, ctx);
          if (pay.method === 'CASH' && shift?.branchId !== inv.branchId) {
            throw new AppError(409, 'CONFLICT', 'Open a cash shift in this branch to refund cash');
          }
          const claimed = await tx.payment.updateMany({
            where: { id: paymentId, refundedAmount: pay.refundedAmount },
            data: { refundedAmount: pay.refundedAmount + amount },
          });
          if (claimed.count === 0) throw new AppError(409, 'CONFLICT', 'RETRY');
          const paid = inv.paidAmount - amount;
          const upd = await tx.invoice.updateMany({
            where: { id: inv.id, version: inv.version },
            data: {
              paidAmount: paid,
              status: inv.status === 'VOID' ? 'VOID' : statusFor(inv.total, paid),
              version: { increment: 1 },
            },
          });
          if (upd.count === 0) throw new AppError(409, 'CONFLICT', 'RETRY');
          const refund = await tx.refund.create({
            data: {
              clinicId: ctx.clinicId,
              paymentId,
              amount,
              reason: input.reason,
              cashShiftId: shift?.id ?? null,
              createdByUserId: ctx.userId,
            },
          });
          await recordAudit(tx, ctx, {
            action: 'payment.refunded',
            entityType: 'Payment',
            entityId: paymentId,
            after: { refundId: refund.id, amount: money(amount) },
          });
          return { id: refund.id, paymentId, amount: money(amount), reason: refund.reason };
        }),
      );
    },

    // ---- cash shifts ------------------------------------------------------------------------
    async openShift(ctx: AuthContext, input: z.infer<typeof openShiftSchema>) {
      return tenant(ctx).$transaction(async (tx) => {
        if (!ctx.branchIds.includes(input.branchId)) {
          throw new AppError(403, 'FORBIDDEN', 'No access to this branch');
        }
        if (await openShiftFor(tx, ctx)) {
          throw new AppError(409, 'CONFLICT', 'You already have an open shift');
        }
        const shift = await tx.cashShift.create({
          data: {
            clinicId: ctx.clinicId,
            branchId: input.branchId,
            cashierId: ctx.userId,
            openingFloat: BigInt(input.openingFloat),
          },
        });
        await recordAudit(tx, ctx, {
          action: 'shift.opened',
          entityType: 'CashShift',
          entityId: shift.id,
        });
        return shiftDto(shift);
      });
    },

    async currentShift(ctx: AuthContext) {
      const s = await tenant(ctx).cashShift.findFirst({
        where: { cashierId: ctx.userId, status: 'OPEN' },
      });
      return s ? shiftDto(s) : null;
    },

    async closeShift(ctx: AuthContext, input: z.infer<typeof closeShiftSchema>) {
      return tenant(ctx).$transaction(async (tx) => {
        const shift = await openShiftFor(tx, ctx);
        if (!shift) throw new AppError(404, 'NOT_FOUND', 'No open shift');
        const [cash, refunds] = await Promise.all([
          tx.payment.aggregate({
            where: { cashShiftId: shift.id, method: 'CASH' },
            _sum: { amount: true },
          }),
          tx.refund.findMany({ where: { cashShiftId: shift.id }, include: { payment: true } }),
        ]);
        const cashRefunded = refunds
          .filter((r) => r.payment.method === 'CASH')
          .reduce((s, r) => s + r.amount, 0n);
        const expected = expectedCash(shift.openingFloat, cash._sum.amount ?? 0n, cashRefunded);
        const counted = BigInt(input.countedCash);
        const res = await tx.cashShift.updateMany({
          where: { id: shift.id, status: 'OPEN' },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            expectedCash: expected,
            countedCash: counted,
            difference: counted - expected,
          },
        });
        if (res.count === 0) throw new AppError(409, 'CONFLICT', 'The shift is already closed');
        await recordAudit(tx, ctx, {
          action: 'shift.closed',
          entityType: 'CashShift',
          entityId: shift.id,
          after: {
            expected: money(expected),
            counted: money(counted),
            difference: money(counted - expected),
          },
        });
        return shiftDto(await tx.cashShift.findFirstOrThrow({ where: { id: shift.id } }));
      });
    },

    // ---- receipt data -----------------------------------------------------------------------
    async receiptData(ctx: AuthContext, paymentId: string) {
      const t = tenant(ctx);
      const pay = await t.payment.findFirst({ where: { id: paymentId } });
      if (!pay) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
      const [inv, clinic, cashier] = await Promise.all([
        t.invoice.findFirstOrThrow({ where: { id: pay.invoiceId }, include: { lines: true } }),
        t.clinic.findFirstOrThrow({ where: {} }),
        t.user.findFirstOrThrow({ where: { id: pay.receivedByUserId } }),
      ]);
      await t.$transaction((tx) =>
        recordAudit(tx, ctx, {
          action: 'payment.receipt_printed',
          entityType: 'Payment',
          entityId: paymentId,
        }),
      );
      return { pay, inv, clinic, cashier };
    },
  };
}
export type BillingService = ReturnType<typeof billingService>;
