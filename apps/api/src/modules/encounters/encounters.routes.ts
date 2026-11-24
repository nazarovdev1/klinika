import {
  addendumSchema,
  createEncounterSchema,
  encounterListSchema,
  icdSearchSchema,
  setDiagnosesSchema,
  setPrescriptionsSchema,
  textTemplateSchema,
  updateEncounterSchema,
  vitalsSchema,
} from '@shifo/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import type { EncountersService } from './encounters.service.js';

const idParam = z.object({ id: z.uuid() });
const signBody = z.object({ version: z.number().int() });

export function encountersRouter(env: Env, service: EncountersService): Router {
  const router = Router();
  const read = [authenticate(env), requirePermission('encounters:read')];
  const write = [authenticate(env), requirePermission('encounters:write')];
  const vitals = [authenticate(env), requirePermission('vitals:write')];

  router.get('/encounters', ...read, async (req, res) => {
    res.json(await service.list(getAuth(req), encounterListSchema.parse(req.query)));
  });
  router.post('/encounters', ...write, async (req, res) => {
    res.status(201).json(await service.create(getAuth(req), createEncounterSchema.parse(req.body)));
  });
  router.get('/encounters/:id', ...read, async (req, res) => {
    res.json(await service.get(getAuth(req), idParam.parse(req.params).id));
  });
  router.patch('/encounters/:id', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.update(getAuth(req), id, updateEncounterSchema.parse(req.body)));
  });
  router.put('/encounters/:id/vitals', ...vitals, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.setVitals(getAuth(req), id, vitalsSchema.parse(req.body)));
  });
  router.put('/encounters/:id/diagnoses', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.setDiagnoses(getAuth(req), id, setDiagnosesSchema.parse(req.body)));
  });
  router.put('/encounters/:id/prescriptions', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(
      await service.setPrescriptions(getAuth(req), id, setPrescriptionsSchema.parse(req.body)),
    );
  });
  router.post('/encounters/:id/sign', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.sign(getAuth(req), id, signBody.parse(req.body).version));
  });
  router.post('/encounters/:id/addenda', ...write, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res
      .status(201)
      .json(await service.addAddendum(getAuth(req), id, addendumSchema.parse(req.body)));
  });

  router.get('/icd10', ...read, async (req, res) => {
    const q = icdSearchSchema.parse(req.query);
    res.json({ items: await service.searchIcd(q.q, q.limit) });
  });

  router.get('/text-templates', ...read, async (req, res) => {
    const q = z.object({ specialty: z.string().optional() }).parse(req.query);
    res.json({ items: await service.listTemplates(getAuth(req), q.specialty) });
  });
  router.post('/text-templates', ...write, async (req, res) => {
    res
      .status(201)
      .json(await service.createTemplate(getAuth(req), textTemplateSchema.parse(req.body)));
  });
  router.delete('/text-templates/:id', ...write, async (req, res) => {
    await service.deleteTemplate(getAuth(req), idParam.parse(req.params).id);
    res.status(204).end();
  });
  return router;
}
