import { branchInputSchema, branchUpdateSchema, updateClinicSchema } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { clinicsService } from './clinics.service.js';

const idParam = z.object({ id: z.uuid() });

export function clinicsRouter(env: Env, db: Db): Router {
  const router = Router();
  const service = clinicsService(db);
  const auth = authenticate(env);

  router.get('/clinic', auth, async (req, res) => {
    res.json(await service.getClinic(getAuth(req)));
  });
  router.patch('/clinic', auth, requirePermission('settings:manage'), async (req, res) => {
    res.json(await service.updateClinic(getAuth(req), updateClinicSchema.parse(req.body)));
  });
  router.get('/branches', auth, async (req, res) => {
    res.json({ items: await service.listBranches(getAuth(req)), nextCursor: null });
  });
  router.post('/branches', auth, requirePermission('settings:manage'), async (req, res) => {
    res
      .status(201)
      .json(await service.createBranch(getAuth(req), branchInputSchema.parse(req.body)));
  });
  router.patch('/branches/:id', auth, requirePermission('settings:manage'), async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.updateBranch(getAuth(req), id, branchUpdateSchema.parse(req.body)));
  });
  return router;
}
