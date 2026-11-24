import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';

interface EncounterLike {
  doctorId: string;
  status: 'OPEN' | 'SIGNED' | 'CANCELLED';
}

/**
 * Record-level rules (on top of RBAC):
 * - OWNER/ADMIN/NURSE may read; a DOCTOR reads own encounters plus any SIGNED encounter of the clinic
 *   (read-only access to a patient's history).
 * - Only the attending doctor edits an encounter; signed encounters are immutable (corrections = addenda).
 */
export function assertCanRead(ctx: AuthContext, enc: EncounterLike): void {
  if (ctx.role === 'DOCTOR' && enc.doctorId !== ctx.userId && enc.status !== 'SIGNED') {
    throw new AppError(403, 'FORBIDDEN', 'You can only open your own unsigned encounters');
  }
}

export function assertAttending(ctx: AuthContext, enc: EncounterLike): void {
  if (ctx.userId !== enc.doctorId) {
    throw new AppError(403, 'FORBIDDEN', 'Only the attending doctor can change this encounter');
  }
}

export function assertOpen(enc: EncounterLike): void {
  if (enc.status !== 'OPEN') {
    throw new AppError(409, 'CONFLICT', 'The encounter is signed or closed and cannot be edited');
  }
}

/** Vitals may be entered by the attending doctor or by a nurse on an open encounter. */
export function assertCanRecordVitals(ctx: AuthContext, enc: EncounterLike): void {
  assertOpen(enc);
  if (ctx.role === 'NURSE') return;
  assertAttending(ctx, enc);
}
