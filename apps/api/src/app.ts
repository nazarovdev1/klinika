import type { Db } from '@shifo/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createErrorHandler, notFoundHandler } from './core/errors.js';
import { buildOpenApiDocument } from './core/openapi.js';
import { noopRealtime, type Realtime } from './core/realtime.js';
import { createPii } from './core/pii.js';
import { requestId } from './core/request-id.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { clinicsRouter } from './modules/clinics/clinics.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { buildQueueService, queueRouter } from './modules/queue/queue.routes.js';
import { schedulingService } from './modules/scheduling/scheduling.service.js';
import { schedulingRouter } from './modules/scheduling/scheduling.routes.js';
import { patientsRouter } from './modules/patients/patients.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';

export function createApp(
  env: Env,
  logger: Logger,
  db: Db,
  realtime: Realtime = noopRealtime,
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId }));
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const openApi = buildOpenApiDocument();
  app.get('/api/docs', (_req, res) => {
    res.json(openApi);
  });

  app.use('/api/v1', healthRouter());
  app.use('/api/v1/auth', authRouter(env, db));
  app.use('/api/v1/staff', staffRouter(env, db));
  app.use('/api/v1/patients', patientsRouter(env, db, createPii(env)));
  app.use('/api/v1', clinicsRouter(env, db));
  app.use('/api/v1', catalogRouter(env, db));
  const queue = buildQueueService(db, realtime);
  app.use('/api/v1', schedulingRouter(env, schedulingService(db, realtime, queue)));
  app.use('/api/v1', queueRouter(env, db, queue));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
