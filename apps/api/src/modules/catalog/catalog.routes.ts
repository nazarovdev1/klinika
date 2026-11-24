import {
  categoryInputSchema,
  doctorServicesSchema,
  serviceInputSchema,
  serviceQuerySchema,
  serviceUpdateSchema,
  setPriceSchema,
} from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { catalogService } from './catalog.service.js';

const idParam = z.object({ id: z.uuid() });

export function catalogRouter(env: Env, db: Db): Router {
  const router = Router();
  const service = catalogService(db);
  const read = [authenticate(env), requirePermission('catalog:read')];
  const write = [authenticate(env), requirePermission('catalog:write')];

  router.get('/categories', ...read, async (req, res) => {
    res.json({ items: await service.listCategories(getAuth(req)), nextCursor: null });
  });
  router.post('/categories', ...write, async (req, res) => {
    res
      .status(201)
      .json(await service.createCategory(getAuth(req), categoryInputSchema.parse(req.body)));
  });

  router.get('/services', ...read, async (req, res) => {
    res.json(await service.listServices(getAuth(req), serviceQuerySchema.parse(req.query)));
  });
  router.post('/services', ...write, async (req, res) => {
    res
      .status(201)
      .json(await service.createService(getAuth(req), serviceInputSchema.parse(req.body)));
  });
  router.patch('/services/:id', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.updateService(getAuth(req), id, serviceUpdateSchema.parse(req.body)));
  });
  router.delete('/services/:id', ...write, async (req, res) => {
    await service.deleteService(getAuth(req), idParam.parse(req.params).id);
    res.status(204).end();
  });
  router.get('/services/:id/prices', ...read, async (req, res) => {
    res.json({ items: await service.listPrices(getAuth(req), idParam.parse(req.params).id) });
  });
  router.post('/services/:id/prices', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.status(201).json(await service.setPrice(getAuth(req), id, setPriceSchema.parse(req.body)));
  });

  router.get('/doctors/:id/services', ...read, async (req, res) => {
    res.json({
      serviceIds: await service.doctorServices(getAuth(req), idParam.parse(req.params).id),
    });
  });
  router.put('/doctors/:id/services', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = doctorServicesSchema.parse(req.body);
    res.json({ serviceIds: await service.setDoctorServices(getAuth(req), id, body.serviceIds) });
  });
  return router;
}
