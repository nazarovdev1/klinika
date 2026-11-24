import type { Role } from '@shifo/contracts';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';

/** Only an OWNER may create, modify or deactivate OWNER accounts; ADMIN may not touch them. */
export function assertCanManageRole(ctx: AuthContext, targetRole: Role): void {
  if (targetRole === 'OWNER' && ctx.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only an owner can manage owner accounts');
  }
}

export function assertNotSelf(ctx: AuthContext, targetId: string, what: string): void {
  if (ctx.userId === targetId) {
    throw new AppError(403, 'FORBIDDEN', `You cannot ${what} your own account`);
  }
}
