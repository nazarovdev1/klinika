import { callNextSchema, issueTicketSchema, queueQuerySchema } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import type { Realtime } from '../../core/realtime.js';
import { screenView } from '../../core/screen.js';
import { queueService, type QueueService } from './queue.service.js';

const idParam = z.object({ id: z.uuid() });
const statusBody = z.object({ status: z.enum(['IN_SERVICE', 'DONE', 'SKIPPED']) });

export function queueRouter(env: Env, db: Db, service: QueueService): Router {
  const router = Router();
  const manage = [authenticate(env), requirePermission('queue:manage')];

  router.get('/queue', ...manage, async (req, res) => {
    res.json(await service.list(getAuth(req), queueQuerySchema.parse(req.query).branchId));
  });
  router.post('/queue/tickets', ...manage, async (req, res) => {
    res
      .status(201)
      .json(await service.issueTicket(getAuth(req), issueTicketSchema.parse(req.body)));
  });
  router.post('/queue/call-next', ...manage, async (req, res) => {
    const body = callNextSchema.parse(req.body);
    res.json(await service.callNext(getAuth(req), body.branchId, body.cabinet));
  });
  router.patch('/queue/tickets/:id', ...manage, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.setStatus(getAuth(req), id, statusBody.parse(req.body).status));
  });
  router.post(
    '/branches/:id/screen-token',
    authenticate(env),
    requirePermission('settings:manage'),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      res.json(await service.regenerateScreenToken(getAuth(req), id));
    },
  );

  // Public: no auth, read-only, addressed by the revocable token.
  router.get('/screen/:token', async (req, res) => {
    const { token } = z.object({ token: z.string().min(16).max(128) }).parse(req.params);
    res.json(await screenView(db, token));
  });
  return router;
}

export const buildQueueService = (db: Db, realtime: Realtime): QueueService =>
  queueService(db, realtime);
