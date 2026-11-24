import { randomUUID } from 'node:crypto';
import { permissionsFor, type AuthUser, type Role, type TokenResponse } from '@shifo/contracts';
import type { Env } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import { hashPassword, verifyPassword } from '../../core/passwords.js';
import { hashToken, newRefreshToken, signAccessToken } from '../../core/tokens.js';
import type { AuthRepository } from './auth.repository.js';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

interface UserRow {
  id: string;
  clinicId: string;
  fullName: string;
  login: string;
  role: Role;
  mustChangePassword: boolean;
  branches: { branchId: string }[];
}

const toAuthUser = (u: UserRow): AuthUser => ({
  id: u.id,
  clinicId: u.clinicId,
  fullName: u.fullName,
  login: u.login,
  role: u.role,
  branchIds: u.branches.map((b) => b.branchId),
  permissions: [...permissionsFor(u.role)],
  mustChangePassword: u.mustChangePassword,
});

// Used to equalize timing when the login does not exist.
let dummyHash: Promise<string> | undefined;

export function authService(repo: AuthRepository, env: Env) {
  async function issue(
    user: UserRow,
    meta: ClientMeta,
    familyId: string = randomUUID(),
  ): Promise<{ response: TokenResponse; refreshToken: string; refreshId: string }> {
    const refreshToken = newRefreshToken();
    const row = await repo.createRefreshToken({
      clinicId: user.clinicId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const accessToken = await signAccessToken(
      {
        sub: user.id,
        clinicId: user.clinicId,
        role: user.role,
        branchIds: user.branches.map((b) => b.branchId),
        mcp: user.mustChangePassword,
      },
      env.JWT_ACCESS_SECRET,
      env.ACCESS_TTL_SECONDS,
    );
    return {
      response: { accessToken, expiresIn: env.ACCESS_TTL_SECONDS, user: toAuthUser(user) },
      refreshToken,
      refreshId: row.id,
    };
  }

  return {
    async login(login: string, password: string, meta: ClientMeta) {
      const user = await repo.findUserByLogin(login);
      if (!user || user.deletedAt || !user.isActive) {
        dummyHash ??= hashPassword('dummy-password-for-timing');
        await verifyPassword(await dummyHash, password);
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid login or password');
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AppError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked');
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        const failures = user.failedLogins + 1;
        const lock =
          failures >= env.LOGIN_MAX_FAILURES
            ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000)
            : null;
        await repo.recordFailure(user.id, lock ? 0 : failures, lock);
        await repo.audit({
          clinicId: user.clinicId,
          userId: user.id,
          action: lock ? 'auth.locked' : 'auth.login_failed',
          entityType: 'User',
          entityId: user.id,
          ...meta,
        });
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid login or password');
      }
      await repo.recordSuccess(user.id);
      await repo.audit({
        clinicId: user.clinicId,
        userId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        ...meta,
      });
      return issue(user, meta);
    },

    async refresh(rawToken: string | undefined, meta: ClientMeta) {
      if (!rawToken) throw new AppError(401, 'UNAUTHENTICATED', 'Missing refresh token');
      const stored = await repo.findRefreshToken(hashToken(rawToken));
      if (!stored) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid refresh token');
      if (stored.revokedAt) {
        // Reuse of a rotated token: assume theft, revoke the whole family.
        await repo.revokeFamily(stored.familyId);
        await repo.audit({
          clinicId: stored.clinicId,
          userId: stored.userId,
          action: 'auth.refresh_reuse_detected',
          entityType: 'User',
          entityId: stored.userId,
          ...meta,
        });
        throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token reuse detected');
      }
      if (stored.expiresAt < new Date()) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token expired');
      }
      const user = await repo.findUserById(stored.userId);
      if (!user || user.deletedAt || !user.isActive) {
        await repo.revokeFamily(stored.familyId);
        throw new AppError(401, 'UNAUTHENTICATED', 'User is not active');
      }
      const next = await issue(user, meta, stored.familyId);
      if (!(await repo.consumeRefreshToken(stored.id, next.refreshId))) {
        // Lost a rotation race: treat as reuse.
        await repo.revokeFamily(stored.familyId);
        throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token reuse detected');
      }
      return next;
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const stored = await repo.findRefreshToken(hashToken(rawToken));
      if (stored) await repo.revokeFamily(stored.familyId);
    },

    async changePassword(
      userId: string,
      currentPassword: string,
      newPassword: string,
      meta: ClientMeta,
    ) {
      const user = await repo.findUserById(userId);
      if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Current password is incorrect');
      }
      if (await verifyPassword(user.passwordHash, newPassword)) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'New password must differ from the current one',
          [{ path: 'newPassword', message: 'must differ from the current password' }],
        );
      }
      const updated = await repo.changePassword(user.id, await hashPassword(newPassword));
      await repo.revokeAllForUser(user.id);
      await repo.audit({
        clinicId: user.clinicId,
        userId: user.id,
        action: 'auth.password_changed',
        entityType: 'User',
        entityId: user.id,
        ...meta,
      });
      return issue({ ...user, mustChangePassword: updated.mustChangePassword }, meta);
    },

    async me(userId: string): Promise<AuthUser> {
      const user = await repo.findUserById(userId);
      if (!user || user.deletedAt || !user.isActive) {
        throw new AppError(401, 'UNAUTHENTICATED', 'User is not active');
      }
      return toAuthUser(user);
    },
  };
}
export type AuthService = ReturnType<typeof authService>;
