import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '@shifo/db';
import type { Env } from '../../config/env.js';
import { recordAudit } from '../../core/audit.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { AppError } from '../../core/errors.js';

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED']).optional(),
  patientId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export function notificationsRouter(env: Env, db: Db): Router {
  const router = Router();

  router.get(
    '/notifications',
    authenticate(env),
    requirePermission('settings:manage'),
    async (req, res) => {
      const ctx = getAuth(req);
      const q = listQuery.parse(req.query);
      const rows = await db.forTenant(ctx.clinicId).notification.findMany({
        where: {
          ...(q.status && { status: q.status }),
          ...(q.patientId && { patientId: q.patientId }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, q.limit);
      res.json({
        items: page.map(({ params: _params, ...n }) => n), // params may carry names/times; keep them internal
        nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      });
    },
  );

  // Generates a one-time code; the patient sends `/start <code>` to the clinic bot to link Telegram.
  router.post(
    '/patients/:id/telegram-link',
    authenticate(env),
    requirePermission('patients:write'),
    async (req, res) => {
      const ctx = getAuth(req);
      const { id } = idParam.parse(req.params);
      const code = randomBytes(9).toString('base64url');
      await db.forTenant(ctx.clinicId).$transaction(async (tx) => {
        if (!(await tx.patient.findFirst({ where: { id, deletedAt: null } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Patient not found');
        }
        await tx.patientChannel.upsert({
          where: { patientId_channel: { patientId: id, channel: 'TELEGRAM' } },
          create: { clinicId: ctx.clinicId, patientId: id, channel: 'TELEGRAM', linkCode: code },
          update: { linkCode: code, externalId: null, linkedAt: null },
        });
        await recordAudit(tx, ctx, {
          action: 'patient.telegram_link_created',
          entityType: 'Patient',
          entityId: id,
        });
      });
      res.status(201).json({
        code,
        deepLink: env.TELEGRAM_BOT_USERNAME
          ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`
          : null,
      });
    },
  );

  return router;
}
