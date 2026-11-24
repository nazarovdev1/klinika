import {
  consentTypeSchema,
  createPatientSchema,
  patientSearchSchema,
  setConsentSchema,
  updatePatientSchema,
} from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import type { Pii } from '../../core/pii.js';
import { patientsService } from './patients.service.js';

const idParam = z.object({ id: z.uuid() });
const consentParams = z.object({ id: z.uuid(), type: consentTypeSchema });

export function patientsRouter(env: Env, db: Db, pii: Pii): Router {
  const router = Router();
  const service = patientsService(db, pii);
  const read = [authenticate(env), requirePermission('patients:read')];
  const write = [authenticate(env), requirePermission('patients:write')];

  router.get('/', ...read, async (req, res) => {
    const q = patientSearchSchema.parse(req.query);
    res.json(await service.search(getAuth(req), q.q, q.limit, q.cursor));
  });
  router.get('/:id', ...read, async (req, res) => {
    res.json(await service.get(getAuth(req), idParam.parse(req.params).id));
  });
  router.post('/', ...write, async (req, res) => {
    res.status(201).json(await service.create(getAuth(req), createPatientSchema.parse(req.body)));
  });
  router.patch('/:id', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.update(getAuth(req), id, updatePatientSchema.parse(req.body)));
  });
  router.delete('/:id', ...write, async (req, res) => {
    await service.remove(getAuth(req), idParam.parse(req.params).id);
    res.status(204).end();
  });
  router.get('/:id/consents', ...read, async (req, res) => {
    res.json({ items: await service.listConsents(getAuth(req), idParam.parse(req.params).id) });
  });
  router.put('/:id/consents/:type', ...write, async (req, res) => {
    const { id, type } = consentParams.parse(req.params);
    const body = setConsentSchema.parse(req.body);
    await service.setConsent(getAuth(req), id, type, body.granted, body.documentUrl);
    res.json({ items: await service.listConsents(getAuth(req), id) });
  });
  return router;
}
