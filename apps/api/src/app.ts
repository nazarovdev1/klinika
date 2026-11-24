import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Env } from './config/env.js';
import { createErrorHandler, notFoundHandler } from './core/errors.js';
import { requestId } from './core/request-id.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp(env: Env, logger: Logger): Express {
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

  app.use('/api/v1', healthRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
