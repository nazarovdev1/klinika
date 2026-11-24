import type { Db, Prisma } from '@shifo/db';
import type { z } from 'zod';
import type { branchInputSchema, branchUpdateSchema, updateClinicSchema } from '@shifo/contracts';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';

type ClinicUpdate = z.infer<typeof updateClinicSchema>;
type BranchInput = z.infer<typeof branchInputSchema>;
type BranchUpdate = z.infer<typeof branchUpdateSchema>;

export function clinicsService(db: Db) {
  return {
    async getClinic(ctx: AuthContext) {
      const clinic = await db.forTenant(ctx.clinicId).clinic.findFirst({ where: {} });
      if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
      return clinic;
    },

    async updateClinic(ctx: AuthContext, input: ClinicUpdate) {
      const t = db.forTenant(ctx.clinicId);
      return t.$transaction(async (tx) => {
        const before = await tx.clinic.findFirstOrThrow({ where: {} });
        const { settings, ...rest } = input;
        await tx.clinic.updateMany({
          where: {},
          data: {
            ...rest,
            ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
          },
        });
        const after = await tx.clinic.findFirstOrThrow({ where: {} });
        await recordAudit(tx, ctx, {
          action: 'clinic.updated',
          entityType: 'Clinic',
          entityId: ctx.clinicId,
          before,
          after,
        });
        return after;
      });
    },

    listBranches(ctx: AuthContext) {
      return db.forTenant(ctx.clinicId).branch.findMany({ orderBy: { createdAt: 'asc' } });
    },

    async createBranch(ctx: AuthContext, input: BranchInput) {
      return db.forTenant(ctx.clinicId).$transaction(async (tx) => {
        const branch = await tx.branch.create({ data: { ...input, clinicId: ctx.clinicId } });
        await recordAudit(tx, ctx, {
          action: 'branch.created',
          entityType: 'Branch',
          entityId: branch.id,
          after: branch,
        });
        return branch;
      });
    },

    async updateBranch(ctx: AuthContext, id: string, input: BranchUpdate) {
      return db.forTenant(ctx.clinicId).$transaction(async (tx) => {
        const before = await tx.branch.findFirst({ where: { id } });
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        await tx.branch.updateMany({ where: { id }, data: input });
        const after = await tx.branch.findFirstOrThrow({ where: { id } });
        await recordAudit(tx, ctx, {
          action: 'branch.updated',
          entityType: 'Branch',
          entityId: id,
          before,
          after,
        });
        return after;
      });
    },
  };
}
