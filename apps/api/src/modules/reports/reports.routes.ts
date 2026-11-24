import { reportNameSchema, reportQuerySchema } from '@shifo/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { authenticate, getAuth, requirePermission } from '../../core/auth.middleware.js';
import { toCsv } from './csv.js';
import type { ReportsService } from './reports.service.js';

export function reportsRouter(env: Env, service: ReportsService): Router {
  const router = Router();
  router.get(
    '/reports/:name',
    authenticate(env),
    requirePermission('reports:read'),
    async (req, res) => {
      const { name } = z.object({ name: reportNameSchema }).parse(req.params);
      const q = reportQuerySchema.parse(req.query);
      const result = await service.run(getAuth(req), name, q);
      if (q.format === 'csv') {
        res
          .status(200)
          .type('text/csv; charset=utf-8')
          .setHeader('content-disposition', `attachment; filename="${name}-${q.from}_${q.to}.csv"`)
          .send(toCsv(result.columns, result.rows));
        return;
      }
      res.json(result);
    },
  );
  return router;
}
