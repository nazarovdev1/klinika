import {
  createLabOrderSchema,
  enterResultsSchema,
  labOrderListSchema,
  labPdfQuerySchema,
  labTestInputSchema,
} from '@shifo/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import {
  authenticate,
  getAuth,
  requireAnyPermission,
  requirePermission,
} from '../../core/auth.middleware.js';
import type { PdfRenderer } from '../documents/pdf.js';
import type { LabService } from './lab.service.js';
import { renderLabHtml } from './lab.template.js';

const idParam = z.object({ id: z.uuid() });

export function labRouter(env: Env, service: LabService, renderer: PdfRenderer): Router {
  const router = Router();
  const viewers = [
    authenticate(env),
    requireAnyPermission('encounters:read', 'lab:write', 'lab:validate'),
  ];
  const order = [authenticate(env), requirePermission('lab:write')];
  const validate = [authenticate(env), requirePermission('lab:validate')];

  // test dictionary
  router.get(
    '/lab/tests',
    authenticate(env),
    requirePermission('catalog:read'),
    async (req, res) => {
      res.json({ items: await service.listTests(getAuth(req)) });
    },
  );
  router.post(
    '/lab/tests',
    authenticate(env),
    requirePermission('catalog:write'),
    async (req, res) => {
      res
        .status(201)
        .json(await service.createTest(getAuth(req), labTestInputSchema.parse(req.body)));
    },
  );
  router.put(
    '/lab/tests/:id',
    authenticate(env),
    requirePermission('catalog:write'),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      res.json(await service.updateTest(getAuth(req), id, labTestInputSchema.parse(req.body)));
    },
  );

  // orders
  router.get('/lab/orders', ...viewers, async (req, res) => {
    res.json(await service.listOrders(getAuth(req), labOrderListSchema.parse(req.query)));
  });
  router.post('/lab/orders', ...order, async (req, res) => {
    res
      .status(201)
      .json(await service.createOrder(getAuth(req), createLabOrderSchema.parse(req.body)));
  });
  router.get('/lab/orders/:id', ...viewers, async (req, res) => {
    res.json(await service.getOrder(getAuth(req), idParam.parse(req.params).id));
  });
  router.post('/lab/orders/:id/collect', ...order, async (req, res) => {
    res.json(await service.collect(getAuth(req), idParam.parse(req.params).id));
  });
  router.post('/lab/orders/:id/cancel', ...order, async (req, res) => {
    res.json(await service.cancel(getAuth(req), idParam.parse(req.params).id));
  });
  router.put('/lab/orders/:id/results', ...order, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await service.enterResults(getAuth(req), id, enterResultsSchema.parse(req.body)));
  });
  router.post('/lab/orders/:id/validate', ...validate, async (req, res) => {
    res.json(await service.validate(getAuth(req), idParam.parse(req.params).id));
  });

  router.get('/lab/orders/:id/pdf', ...viewers, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { lang } = labPdfQuerySchema.parse(req.query);
    const { order, patient, clinic, branch, validator } = await service.resultDocument(
      getAuth(req),
      id,
    );
    const html = renderLabHtml({
      lang,
      timeZone: branch.timezone,
      clinicName: clinic.name,
      patientName: [patient.lastName, patient.firstName, patient.middleName]
        .filter(Boolean)
        .join(' '),
      birthDate: patient.birthDate,
      barcode: order.barcode,
      validatedAt: order.validatedAt ?? new Date(),
      validatorName: validator.fullName,
      items: order.items.map((i) => ({
        name: i.testName,
        value: i.value,
        unit: i.unit,
        refLow: i.refLow,
        refHigh: i.refHigh,
        flag: i.flag,
      })),
    });
    const pdf = await renderer.render(html);
    res
      .status(200)
      .type('application/pdf')
      .setHeader('content-disposition', `inline; filename="lab-${id}.pdf"`)
      .send(pdf);
  });

  return router;
}
