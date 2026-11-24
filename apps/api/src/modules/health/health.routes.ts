import type { HealthResponse } from '@shifo/contracts';
import { Router } from 'express';

const VERSION = process.env.npm_package_version ?? '0.0.0';

export function healthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'api',
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      // DB / Redis checks are added when those dependencies arrive (Phase 1).
      checks: {},
    };
    res.json(body);
  });
  return router;
}
