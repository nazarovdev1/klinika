import type { CreateStaffInput, StaffDto, UpdateStaffInput } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { hashPassword } from '../../core/passwords.js';
import { assertCanManageRole, assertNotSelf } from './staff.policy.js';
import { staffRepository, type StaffRepository } from './staff.repository.js';

interface UserWithBranches {
  id: string;
  fullName: string;
  phone: string;
  login: string;
  role: StaffDto['role'];
  isActive: boolean;
  mustChangePassword: boolean;
  version: number;
  lastLoginAt: Date | null;
  branches: { branchId: string }[];
}

const toDto = (u: UserWithBranches): StaffDto => ({
  id: u.id,
  fullName: u.fullName,
  phone: u.phone,
  login: u.login,
  role: u.role,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  branchIds: u.branches.map((b) => b.branchId),
  version: u.version,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

const audited = (u: UserWithBranches) => ({
  fullName: u.fullName,
  phone: u.phone,
  login: u.login,
  role: u.role,
  isActive: u.isActive,
  branchIds: u.branches.map((b) => b.branchId),
});

export function staffService(db: Db) {
  const repoFor = (ctx: AuthContext): StaffRepository =>
    staffRepository(db.forTenant(ctx.clinicId));

  async function assertBranches(repo: StaffRepository, ids: string[]): Promise<void> {
    if ((await repo.countBranches([...new Set(ids)])) !== new Set(ids).size) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Unknown branch', [
        { path: 'branchIds', message: 'contains a branch outside this clinic' },
      ]);
    }
  }

  return {
    async list(ctx: AuthContext, limit: number, cursor?: string) {
      const rows = await repoFor(ctx).list(limit, cursor);
      const page = rows.slice(0, limit);
      return {
        items: page.map(toDto),
        nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async get(ctx: AuthContext, id: string): Promise<StaffDto> {
      const user = await repoFor(ctx).get(id);
      if (!user) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
      return toDto(user);
    },

    async create(ctx: AuthContext, input: CreateStaffInput): Promise<StaffDto> {
      assertCanManageRole(ctx, input.role);
      if (input.role === 'DOCTOR' && !input.doctorProfile) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Doctor profile required', [
          { path: 'doctorProfile', message: 'required for role DOCTOR' },
        ]);
      }
      const repo = repoFor(ctx);
      await assertBranches(repo, input.branchIds);
      const passwordHash = await hashPassword(input.password);
      return repo.transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            fullName: input.fullName,
            phone: input.phone,
            login: input.login.toLowerCase(),
            passwordHash,
            role: input.role,
            mustChangePassword: true,
            // clinicId is stamped by the tenant extension
            clinicId: ctx.clinicId,
            branches: {
              create: [...new Set(input.branchIds)].map((branchId) => ({
                branchId,
                clinicId: ctx.clinicId,
              })),
            },
            ...(input.doctorProfile
              ? { doctorProfile: { create: { ...input.doctorProfile, clinicId: ctx.clinicId } } }
              : {}),
          },
          include: repo.include,
        });
        await recordAudit(tx, ctx, {
          action: 'staff.created',
          entityType: 'User',
          entityId: created.id,
          after: audited(created),
        });
        return toDto(created);
      });
    },

    async update(ctx: AuthContext, id: string, input: UpdateStaffInput): Promise<StaffDto> {
      const repo = repoFor(ctx);
      const existing = await repo.get(id);
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
      assertCanManageRole(ctx, existing.role);
      if (input.role) assertCanManageRole(ctx, input.role);
      if (input.role && input.role !== existing.role) assertNotSelf(ctx, id, 'change the role of');
      if (input.isActive === false) assertNotSelf(ctx, id, 'deactivate');
      if (input.branchIds) await assertBranches(repo, input.branchIds);

      return repo.transaction(async (tx) => {
        const res = await tx.user.updateMany({
          where: { id, version: input.version, deletedAt: null },
          data: {
            ...(input.fullName !== undefined && { fullName: input.fullName }),
            ...(input.phone !== undefined && { phone: input.phone }),
            ...(input.role !== undefined && { role: input.role }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
            version: { increment: 1 },
          },
        });
        if (res.count === 0) {
          throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
        }
        if (input.branchIds) {
          await tx.userBranch.deleteMany({ where: { userId: id } });
          await tx.userBranch.createMany({
            data: [...new Set(input.branchIds)].map((branchId) => ({
              userId: id,
              branchId,
              clinicId: ctx.clinicId,
            })),
          });
        }
        if (input.doctorProfile) {
          await tx.doctorProfile.upsert({
            where: { userId: id },
            create: { ...input.doctorProfile, userId: id, clinicId: ctx.clinicId },
            update: input.doctorProfile,
          });
        }
        if (input.isActive === false) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        const after = await tx.user.findFirstOrThrow({ where: { id }, include: repo.include });
        await recordAudit(tx, ctx, {
          action: input.isActive === false ? 'staff.deactivated' : 'staff.updated',
          entityType: 'User',
          entityId: id,
          before: audited(existing),
          after: audited(after),
        });
        return toDto(after);
      });
    },

    async resetPassword(ctx: AuthContext, id: string, newPassword: string): Promise<void> {
      const repo = repoFor(ctx);
      const existing = await repo.get(id);
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
      assertCanManageRole(ctx, existing.role);
      const passwordHash = await hashPassword(newPassword);
      await repo.transaction(async (tx) => {
        await tx.user.updateMany({
          where: { id },
          data: {
            passwordHash,
            mustChangePassword: true,
            failedLogins: 0,
            lockedUntil: null,
            version: { increment: 1 },
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordAudit(tx, ctx, {
          action: 'staff.password_reset',
          entityType: 'User',
          entityId: id,
        });
      });
    },
  };
}
