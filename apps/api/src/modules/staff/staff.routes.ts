import {
  createStaffSchema,
  listQuerySchema,
  resetPasswordSchema,
  updateStaffSchema,
} from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { staffService } from './staff.service.js';

const idParam = z.object({ id: z.uuid() });

export function staffRouter(env: Env, db: Db): Router {
  const router = Router();
  const service = staffService(db);
  router.use(authenticate(env), requirePermission('staff:manage'));

  router.get('/', async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    res.json(await service.list(getAuth(req), q.limit, q.cursor));
  });
  router.get('/:id', async (req, res) => {
    res.json(await service.get(getAuth(req), idParam.parse(req.params).id));
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await service.create(getAuth(req), createStaffSchema.parse(req.body)));
  });
  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.update(getAuth(req), id, updateStaffSchema.parse(req.body)));
  });
  router.post('/:id/reset-password', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await service.resetPassword(getAuth(req), id, resetPasswordSchema.parse(req.body).newPassword);
    res.status(204).end();
  });
  return router;
}
