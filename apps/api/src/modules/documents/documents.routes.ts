import { pdfQuerySchema } from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import type { Pii } from '../../core/pii.js';
import { verifyEncounter } from '../../core/verify.js';
import type { DocumentsService } from './documents.service.js';

const idParam = z.object({ id: z.uuid() });

export function documentsRouter(env: Env, db: Db, pii: Pii, service: DocumentsService): Router {
  const router = Router();

  router.get(
    '/encounters/:id/pdf',
    authenticate(env),
    requirePermission('encounters:read'),
    async (req, res) => {
      const { id } = idParam.parse(req.params);
      const { lang } = pdfQuerySchema.parse(req.query);
      const pdf = await service.encounterPdf(getAuth(req), id, lang);
      res
        .status(200)
        .type('application/pdf')
        .setHeader('content-disposition', `inline; filename="visit-${id}.pdf"`)
        .send(pdf);
    },
  );

  // Public: verifies a printed summary via the QR code. No patient data.
  router.get('/verify/encounter/:id/:sig', async (req, res) => {
    const p = z.object({ id: z.uuid(), sig: z.string().min(8).max(64) }).parse(req.params);
    res.json(await verifyEncounter(db, pii, p.id, p.sig));
  });
  return router;
}
