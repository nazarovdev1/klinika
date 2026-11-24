import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '@shifo/db';
import type { Env } from '../../config/env.js';
import { recordAudit } from '../../core/audit.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { AppError } from '../../core/errors.js';
import type { DhpClient } from './dhp.client.js';

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});
const settingsBody = z.object({
  dhpOrganizationId: z.string().trim().min(1).max(100).nullable(),
});

export function integrationsRouter(env: Env, db: Db, client: DhpClient): Router {
  const router = Router();
  const guard = [authenticate(env), requirePermission('settings:manage')];

  router.get('/integrations/dhp/status', ...guard, async (req, res) => {
    const ctx = getAuth(req);
    const t = db.forTenant(ctx.clinicId);
    const [clinic, groups, reachable] = await Promise.all([
      t.clinic.findFirstOrThrow({ where: {} }),
      t.dhpSyncRecord.groupBy({ by: ['status'], where: {}, _count: { _all: true } }),
      client.ping(),
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
    res.json({
      mode: env.DHP_MODE,
      reachable,
      dhpOrganizationId: clinic.dhpOrganizationId,
      counts: { PENDING: 0, SENT: 0, FAILED: 0, DEAD: 0, SKIPPED: 0, ...counts },
    });
  });

  router.put('/integrations/dhp/settings', ...guard, async (req, res) => {
    const ctx = getAuth(req);
    const body = settingsBody.parse(req.body);
    await db.forTenant(ctx.clinicId).$transaction(async (tx) => {
      await tx.clinic.updateMany({
        where: {},
        data: { dhpOrganizationId: body.dhpOrganizationId },
      });
      await recordAudit(tx, ctx, {
        action: 'integration.dhp_settings_changed',
        entityType: 'Clinic',
        entityId: ctx.clinicId,
      });
    });
    res.json({ dhpOrganizationId: body.dhpOrganizationId });
  });

  router.get('/integrations/dhp/records', ...guard, async (req, res) => {
    const ctx = getAuth(req);
    const q = listQuery.parse(req.query);
    const rows = await db.forTenant(ctx.clinicId).dhpSyncRecord.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    res.json({
      items: page,
      nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
    });
  });

  // Re-queues a FAILED/DEAD record: the outbox event is reset and picked up by the worker.
  router.post('/integrations/dhp/records/:id/retry', ...guard, async (req, res) => {
    const ctx = getAuth(req);
    const { id } = idParam.parse(req.params);
    await db.forTenant(ctx.clinicId).$transaction(async (tx) => {
      const rec = await tx.dhpSyncRecord.findFirst({ where: { id } });
      if (!rec) throw new AppError(404, 'NOT_FOUND', 'Record not found');
      if (rec.status !== 'FAILED' && rec.status !== 'DEAD') {
        throw new AppError(409, 'CONFLICT', 'Only failed records can be retried');
      }
      await tx.outboxEvent.updateMany({
        where: { id: rec.outboxEventId },
        data: { status: 'PENDING', attempts: 0, lastError: null, availableAt: new Date() },
      });
      await tx.dhpSyncRecord.updateMany({
        where: { id },
        data: { status: 'PENDING', attempts: 0 },
      });
      await recordAudit(tx, ctx, {
        action: 'integration.dhp_retry',
        entityType: 'DhpSyncRecord',
        entityId: id,
      });
    });
    res.status(202).json({ queued: true });
  });

  return router;
}
