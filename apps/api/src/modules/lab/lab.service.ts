import type {
  createLabOrderSchema,
  enterResultsSchema,
  labOrderListSchema,
  labTestInputSchema,
} from '@shifo/contracts';
import type { Db } from '@shifo/db';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { patientNames } from '../../core/patient-names.js';
import { todayIn } from '../../core/time.js';
import { flagFor, parseNumeric } from './flags.js';

type TestInput = z.infer<typeof labTestInputSchema>;

/** Roles that may enter results (ordering/collecting is open to clinical roles with lab:write). */
const RESULT_ROLES = new Set(['LAB', 'OWNER', 'ADMIN']);

function orderDto<
  T extends {
    collectedAt: Date | null;
    resultedAt: Date | null;
    validatedAt: Date | null;
    createdAt: Date;
    items?: { enteredAt: Date | null }[];
  },
>(o: T) {
  return {
    ...o,
    collectedAt: o.collectedAt?.toISOString() ?? null,
    resultedAt: o.resultedAt?.toISOString() ?? null,
    validatedAt: o.validatedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    items: o.items?.map((i) => ({ ...i, enteredAt: i.enteredAt?.toISOString() ?? null })),
  };
}

export function labService(db: Db) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);
  const withItems = { items: { orderBy: { createdAt: 'asc' as const } } };

  return {
    // ---- test dictionary --------------------------------------------------------------------
    listTests: (ctx: AuthContext) =>
      tenant(ctx).labTest.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),

    async createTest(ctx: AuthContext, input: TestInput) {
      return tenant(ctx).$transaction(async (tx) => {
        const t = await tx.labTest.create({
          data: {
            clinicId: ctx.clinicId,
            ...input,
            serviceId: input.serviceId ?? null,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'labtest.created',
          entityType: 'LabTest',
          entityId: t.id,
        });
        return t;
      });
    },

    async updateTest(ctx: AuthContext, id: string, input: TestInput) {
      return tenant(ctx).$transaction(async (tx) => {
        const res = await tx.labTest.updateMany({
          where: { id },
          data: { ...input, serviceId: input.serviceId ?? null },
        });
        if (res.count === 0) throw new AppError(404, 'NOT_FOUND', 'Test not found');
        await recordAudit(tx, ctx, {
          action: 'labtest.updated',
          entityType: 'LabTest',
          entityId: id,
        });
        return tx.labTest.findFirstOrThrow({ where: { id } });
      });
    },

    // ---- orders -----------------------------------------------------------------------------
    async createOrder(ctx: AuthContext, input: z.infer<typeof createLabOrderSchema>) {
      return tenant(ctx).$transaction(async (tx) => {
        if (!(await tx.patient.findFirst({ where: { id: input.patientId, deletedAt: null } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Patient not found');
        }
        const branch = await tx.branch.findFirst({ where: { id: input.branchId } });
        if (!branch) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        const ids = [...new Set(input.testIds)];
        const tests = await tx.labTest.findMany({ where: { id: { in: ids }, isActive: true } });
        if (tests.length !== ids.length) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Unknown or inactive test', [
            { path: 'testIds', message: 'one or more tests do not exist' },
          ]);
        }
        const date = todayIn(branch.timezone);
        const seq = await tx.numberSequence.upsert({
          where: {
            clinicId_branchId_key_date: {
              clinicId: ctx.clinicId,
              branchId: branch.id,
              key: 'lab',
              date,
            },
          },
          create: { clinicId: ctx.clinicId, branchId: branch.id, key: 'lab', date, value: 1 },
          update: { value: { increment: 1 } },
        });
        const barcode = `L${date.replaceAll('-', '').slice(2)}${branch.id.slice(0, 2).toUpperCase()}${String(seq.value).padStart(4, '0')}`;
        const order = await tx.labOrder.create({
          data: {
            clinicId: ctx.clinicId,
            branchId: branch.id,
            patientId: input.patientId,
            encounterId: input.encounterId ?? null,
            orderedByUserId: ctx.userId,
            barcode,
          },
        });
        await tx.labOrderItem.createMany({
          data: tests.map((t) => ({
            clinicId: ctx.clinicId,
            orderId: order.id,
            testId: t.id,
            testCode: t.code,
            testName: t.nameUz,
            unit: t.unit,
            refLow: t.refLow,
            refHigh: t.refHigh,
          })),
        });
        await recordAudit(tx, ctx, {
          action: 'lab.ordered',
          entityType: 'LabOrder',
          entityId: order.id,
          after: { tests: tests.length },
        });
        return orderDto(
          await tx.labOrder.findFirstOrThrow({ where: { id: order.id }, include: withItems }),
        );
      });
    },

    async getOrder(ctx: AuthContext, id: string) {
      const t = tenant(ctx);
      const order = await t.labOrder.findFirst({ where: { id }, include: withItems });
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Lab order not found');
      await t.$transaction((tx) =>
        recordAudit(tx, ctx, { action: 'lab.viewed', entityType: 'LabOrder', entityId: id }),
      );
      const names = await patientNames(tenant(ctx), [order.patientId]);
      return { ...orderDto(order), patientName: names.get(order.patientId) ?? null };
    },

    async listOrders(ctx: AuthContext, q: z.infer<typeof labOrderListSchema>) {
      const t = tenant(ctx);
      const rows = await t.labOrder.findMany({
        where: {
          ...(q.patientId && { patientId: q.patientId }),
          ...(q.status && { status: q.status }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, q.limit);
      const names = await patientNames(
        t,
        page.map((r) => r.patientId),
      );
      return {
        items: page.map((r) => ({ ...orderDto(r), patientName: names.get(r.patientId) ?? null })),
        nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async collect(ctx: AuthContext, id: string) {
      return tenant(ctx).$transaction(async (tx) => {
        const res = await tx.labOrder.updateMany({
          where: { id, status: 'ORDERED' },
          data: { status: 'COLLECTED', collectedAt: new Date(), version: { increment: 1 } },
        });
        if (res.count === 0)
          await this_notFoundOrConflict(tx, id, 'The sample was already collected');
        await recordAudit(tx, ctx, {
          action: 'lab.collected',
          entityType: 'LabOrder',
          entityId: id,
        });
        return orderDto(await tx.labOrder.findFirstOrThrow({ where: { id }, include: withItems }));
      });
    },

    async cancel(ctx: AuthContext, id: string) {
      return tenant(ctx).$transaction(async (tx) => {
        const res = await tx.labOrder.updateMany({
          where: { id, status: { in: ['ORDERED', 'COLLECTED'] } },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        if (res.count === 0)
          await this_notFoundOrConflict(tx, id, 'Only orders without results can be cancelled');
        await recordAudit(tx, ctx, {
          action: 'lab.cancelled',
          entityType: 'LabOrder',
          entityId: id,
        });
        return orderDto(await tx.labOrder.findFirstOrThrow({ where: { id }, include: withItems }));
      });
    },

    async enterResults(ctx: AuthContext, id: string, input: z.infer<typeof enterResultsSchema>) {
      if (!RESULT_ROLES.has(ctx.role)) {
        throw new AppError(403, 'FORBIDDEN', 'Only laboratory staff can enter results');
      }
      return tenant(ctx).$transaction(async (tx) => {
        const order = await tx.labOrder.findFirst({ where: { id }, include: withItems });
        if (!order) throw new AppError(404, 'NOT_FOUND', 'Lab order not found');
        if (order.status !== 'COLLECTED' && order.status !== 'RESULTED') {
          throw new AppError(
            409,
            'CONFLICT',
            'Results can be entered after sample collection and before validation',
          );
        }
        const byId = new Map(order.items.map((i) => [i.id, i]));
        const tests = new Map(
          (
            await tx.labTest.findMany({ where: { id: { in: order.items.map((i) => i.testId) } } })
          ).map((t) => [t.id, t]),
        );
        for (const r of input.items) {
          const item = byId.get(r.itemId);
          if (!item) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Item does not belong to this order', [
              { path: 'itemId', message: r.itemId },
            ]);
          }
          const test = tests.get(item.testId);
          const numeric = test?.isNumeric === false ? null : parseNumeric(r.value);
          if (test?.isNumeric !== false && numeric === null) {
            throw new AppError(422, 'VALIDATION_ERROR', 'A numeric value is required', [
              { path: 'value', message: `${item.testCode}: not a number` },
            ]);
          }
          await tx.labOrderItem.update({
            where: { id: item.id },
            data: {
              value: r.value,
              numericValue: numeric,
              flag:
                numeric === null
                  ? null
                  : flagFor(numeric, {
                      refLow: item.refLow,
                      refHigh: item.refHigh,
                      criticalLow: test?.criticalLow ?? null,
                      criticalHigh: test?.criticalHigh ?? null,
                    }),
              note: r.note ?? null,
              enteredByUserId: ctx.userId,
              enteredAt: new Date(),
            },
          });
        }
        const missing = await tx.labOrderItem.count({ where: { orderId: id, value: null } });
        await tx.labOrder.updateMany({
          where: { id },
          data: {
            status: missing === 0 ? 'RESULTED' : 'COLLECTED',
            resultedAt: missing === 0 ? new Date() : null,
            version: { increment: 1 },
          },
        });
        await recordAudit(tx, ctx, {
          action: 'lab.results_entered',
          entityType: 'LabOrder',
          entityId: id,
          after: { items: input.items.length }, // values are clinical data and stay out of the audit trail
        });
        return orderDto(await tx.labOrder.findFirstOrThrow({ where: { id }, include: withItems }));
      });
    },

    /**
     * Validation releases results. Four-eyes: the validator must differ from the person who entered the
     * values, unless the clinic enabled `settings.labSelfValidation`.
     */
    async validate(ctx: AuthContext, id: string) {
      return tenant(ctx).$transaction(async (tx) => {
        const order = await tx.labOrder.findFirst({ where: { id }, include: withItems });
        if (!order) throw new AppError(404, 'NOT_FOUND', 'Lab order not found');
        if (order.status !== 'RESULTED') {
          throw new AppError(409, 'CONFLICT', 'All results must be entered before validation');
        }
        const clinic = await tx.clinic.findFirstOrThrow({ where: {} });
        const selfOk =
          (clinic.settings as { labSelfValidation?: boolean } | null)?.labSelfValidation === true;
        if (!selfOk && order.items.some((i) => i.enteredByUserId === ctx.userId)) {
          throw new AppError(
            403,
            'FORBIDDEN',
            'Results must be validated by a different person than the one who entered them',
          );
        }
        const res = await tx.labOrder.updateMany({
          where: { id, status: 'RESULTED' },
          data: {
            status: 'VALIDATED',
            validatedAt: new Date(),
            validatedByUserId: ctx.userId,
            version: { increment: 1 },
          },
        });
        if (res.count === 0) throw new AppError(409, 'CONFLICT', 'The order changed, retry');
        await tx.outboxEvent.create({
          data: {
            clinicId: ctx.clinicId,
            type: 'lab.validated',
            payload: { labOrderId: id, patientId: order.patientId },
          },
        });
        await recordAudit(tx, ctx, {
          action: 'lab.validated',
          entityType: 'LabOrder',
          entityId: id,
        });
        return orderDto(await tx.labOrder.findFirstOrThrow({ where: { id }, include: withItems }));
      });
    },

    async resultDocument(ctx: AuthContext, id: string) {
      const t = tenant(ctx);
      const order = await t.labOrder.findFirst({ where: { id }, include: withItems });
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Lab order not found');
      if (order.status !== 'VALIDATED') {
        throw new AppError(409, 'CONFLICT', 'The result form is available after validation');
      }
      const [patient, clinic, branch, validator] = await Promise.all([
        t.patient.findFirstOrThrow({ where: { id: order.patientId } }),
        t.clinic.findFirstOrThrow({ where: {} }),
        t.branch.findFirstOrThrow({ where: { id: order.branchId } }),
        t.user.findFirstOrThrow({ where: { id: order.validatedByUserId ?? '' } }),
      ]);
      await t.$transaction((tx) =>
        recordAudit(tx, ctx, { action: 'lab.pdf_generated', entityType: 'LabOrder', entityId: id }),
      );
      return { order, patient, clinic, branch, validator };
    },
  };
}
export type LabService = ReturnType<typeof labService>;

async function this_notFoundOrConflict(
  tx: { labOrder: { findFirst(a: { where: { id: string } }): Promise<unknown> } },
  id: string,
  conflict: string,
): Promise<never> {
  if (!(await tx.labOrder.findFirst({ where: { id } }))) {
    throw new AppError(404, 'NOT_FOUND', 'Lab order not found');
  }
  throw new AppError(409, 'CONFLICT', conflict);
}
