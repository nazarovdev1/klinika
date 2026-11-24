import type { AuthContext } from './context.js';

interface AuditWriter {
  auditLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Call inside the same transaction as the change. Append-only. */
export async function recordAudit(
  tx: AuditWriter,
  ctx: Pick<AuthContext, 'clinicId' | 'userId' | 'ip' | 'userAgent' | 'requestId'>,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    },
  });
}
