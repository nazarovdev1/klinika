import type { Db, Prisma } from '@shifo/db';
import type { z } from 'zod';
import type {
  categoryInputSchema,
  serviceInputSchema,
  serviceUpdateSchema,
  setPriceSchema,
} from '@shifo/contracts';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';

type CategoryInput = z.infer<typeof categoryInputSchema>;
type ServiceInput = z.infer<typeof serviceInputSchema>;
type ServiceUpdate = z.infer<typeof serviceUpdateSchema>;
type SetPrice = z.infer<typeof setPriceSchema>;

const priceDto = (p: {
  id: string;
  branchId: string;
  price: bigint;
  validFrom: Date;
  validTo: Date | null;
}) => ({
  id: p.id,
  branchId: p.branchId,
  price: p.price.toString(),
  validFrom: p.validFrom.toISOString(),
  validTo: p.validTo?.toISOString() ?? null,
});

export function catalogService(db: Db) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);

  /** Price in force at `at` for a service in a branch; null if none. */
  async function activePrice(
    ctx: AuthContext,
    serviceId: string,
    branchId: string,
    at = new Date(),
  ) {
    const row = await tenant(ctx).servicePrice.findFirst({
      where: {
        serviceId,
        branchId,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    return row ? priceDto(row) : null;
  }

  return {
    activePrice,

    listCategories: (ctx: AuthContext) =>
      tenant(ctx).serviceCategory.findMany({ orderBy: { nameUz: 'asc' } }),

    async createCategory(ctx: AuthContext, input: CategoryInput) {
      return tenant(ctx).$transaction(async (tx) => {
        const c = await tx.serviceCategory.create({ data: { ...input, clinicId: ctx.clinicId } });
        await recordAudit(tx, ctx, {
          action: 'category.created',
          entityType: 'ServiceCategory',
          entityId: c.id,
          after: c,
        });
        return c;
      });
    },

    async listServices(
      ctx: AuthContext,
      q: { branchId?: string; q?: string; limit: number; cursor?: string },
    ) {
      const where: Prisma.ServiceWhereInput = {
        deletedAt: null,
        ...(q.q && {
          OR: [
            { nameUz: { contains: q.q, mode: 'insensitive' } },
            { nameRu: { contains: q.q, mode: 'insensitive' } },
            { code: { contains: q.q, mode: 'insensitive' } },
          ],
        }),
      };
      const rows = await tenant(ctx).service.findMany({
        where,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, q.limit);
      const items = await Promise.all(
        page.map(async (s) => ({
          ...s,
          price: q.branchId ? await activePrice(ctx, s.id, q.branchId) : null,
        })),
      );
      return {
        items,
        nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async createService(ctx: AuthContext, input: ServiceInput) {
      return tenant(ctx).$transaction(async (tx) => {
        const s = await tx.service.create({ data: { ...input, clinicId: ctx.clinicId } });
        await recordAudit(tx, ctx, {
          action: 'service.created',
          entityType: 'Service',
          entityId: s.id,
          after: s,
        });
        return s;
      });
    },

    async updateService(ctx: AuthContext, id: string, input: ServiceUpdate) {
      return tenant(ctx).$transaction(async (tx) => {
        const before = await tx.service.findFirst({ where: { id, deletedAt: null } });
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Service not found');
        await tx.service.updateMany({ where: { id }, data: input });
        const after = await tx.service.findFirstOrThrow({ where: { id } });
        await recordAudit(tx, ctx, {
          action: 'service.updated',
          entityType: 'Service',
          entityId: id,
          before,
          after,
        });
        return after;
      });
    },

    async deleteService(ctx: AuthContext, id: string) {
      await tenant(ctx).$transaction(async (tx) => {
        const res = await tx.service.updateMany({
          where: { id, deletedAt: null },
          data: { deletedAt: new Date(), isActive: false },
        });
        if (res.count === 0) throw new AppError(404, 'NOT_FOUND', 'Service not found');
        await recordAudit(tx, ctx, {
          action: 'service.deleted',
          entityType: 'Service',
          entityId: id,
        });
      });
    },

    async listPrices(ctx: AuthContext, serviceId: string) {
      const rows = await tenant(ctx).servicePrice.findMany({
        where: { serviceId },
        orderBy: [{ branchId: 'asc' }, { validFrom: 'desc' }],
      });
      return rows.map(priceDto);
    },

    /**
     * Sets a new price from `validFrom` and closes the currently open one. Already issued invoices copy the
     * price into their lines, so history is never rewritten.
     */
    async setPrice(ctx: AuthContext, serviceId: string, input: SetPrice) {
      const from = input.validFrom ? new Date(input.validFrom) : new Date();
      return tenant(ctx).$transaction(async (tx) => {
        const service = await tx.service.findFirst({ where: { id: serviceId, deletedAt: null } });
        if (!service) throw new AppError(404, 'NOT_FOUND', 'Service not found');
        if ((await tx.branch.count({ where: { id: input.branchId } })) === 0) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Unknown branch', [
            { path: 'branchId', message: 'branch not found in this clinic' },
          ]);
        }
        const open = await tx.servicePrice.findFirst({
          where: { serviceId, branchId: input.branchId, validTo: null },
          orderBy: { validFrom: 'desc' },
        });
        if (open) {
          if (from <= open.validFrom) {
            throw new AppError(
              422,
              'VALIDATION_ERROR',
              'validFrom must be after the current price start',
              [{ path: 'validFrom', message: 'must be later than the current price validFrom' }],
            );
          }
          await tx.servicePrice.updateMany({ where: { id: open.id }, data: { validTo: from } });
        }
        const created = await tx.servicePrice.create({
          data: {
            clinicId: ctx.clinicId,
            serviceId,
            branchId: input.branchId,
            price: BigInt(input.price),
            validFrom: from,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'price.set',
          entityType: 'Service',
          entityId: serviceId,
          before: open ? { price: open.price.toString() } : undefined,
          after: { price: input.price, branchId: input.branchId },
        });
        return priceDto(created);
      });
    },

    async doctorServices(ctx: AuthContext, doctorId: string) {
      const rows = await tenant(ctx).doctorService.findMany({ where: { doctorId } });
      return rows.map((r) => r.serviceId);
    },

    async setDoctorServices(ctx: AuthContext, doctorId: string, serviceIds: string[]) {
      const ids = [...new Set(serviceIds)];
      await tenant(ctx).$transaction(async (tx) => {
        const doctor = await tx.user.findFirst({
          where: { id: doctorId, role: 'DOCTOR', deletedAt: null },
        });
        if (!doctor) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
        if (
          (await tx.service.count({ where: { id: { in: ids }, deletedAt: null } })) !== ids.length
        ) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Unknown service', [
            { path: 'serviceIds', message: 'contains a service outside this clinic' },
          ]);
        }
        await tx.doctorService.deleteMany({ where: { doctorId } });
        await tx.doctorService.createMany({
          data: ids.map((serviceId) => ({ doctorId, serviceId, clinicId: ctx.clinicId })),
        });
        await recordAudit(tx, ctx, {
          action: 'doctor.services_set',
          entityType: 'User',
          entityId: doctorId,
          after: { count: ids.length },
        });
      });
      return ids;
    },
  };
}
export type CatalogService = ReturnType<typeof catalogService>;
