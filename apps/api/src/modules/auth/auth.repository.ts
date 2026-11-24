import type { Db } from '@shifo/db';

// Auth is the one module allowed to use the unscoped client: login/refresh happen before
// the tenant is known (login is globally unique).
export function authRepository(db: Db) {
  const prisma = db.system();
  return {
    findUserByLogin: (login: string) =>
      prisma.user.findUnique({
        where: { login },
        include: { branches: { select: { branchId: true } } },
      }),
    findUserById: (id: string) =>
      prisma.user.findUnique({
        where: { id },
        include: { branches: { select: { branchId: true } } },
      }),
    recordFailure: (id: string, failedLogins: number, lockedUntil: Date | null) =>
      prisma.user.update({ where: { id }, data: { failedLogins, lockedUntil } }),
    recordSuccess: (id: string) =>
      prisma.user.update({
        where: { id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
    findRefreshToken: (tokenHash: string) =>
      prisma.refreshToken.findUnique({ where: { tokenHash } }),
    createRefreshToken: (data: {
      clinicId: string;
      userId: string;
      tokenHash: string;
      familyId: string;
      expiresAt: Date;
      ip?: string;
      userAgent?: string;
    }) => prisma.refreshToken.create({ data }),
    /** Atomically marks the token as used; returns false if somebody else already did. */
    async consumeRefreshToken(id: string, replacedById: string): Promise<boolean> {
      const res = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById },
      });
      return res.count === 1;
    },
    revokeFamily: (familyId: string) =>
      prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    revokeAllForUser: (userId: string) =>
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    changePassword: (id: string, passwordHash: string) =>
      prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: false, version: { increment: 1 } },
      }),
    audit: (data: {
      clinicId: string;
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      ip?: string;
      userAgent?: string;
      requestId?: string;
    }) => prisma.auditLog.create({ data }),
  };
}
export type AuthRepository = ReturnType<typeof authRepository>;
