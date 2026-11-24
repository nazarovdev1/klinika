import { createServer, type Server } from 'node:http';
import { createDb } from '@shifo/db';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createSocketRealtime } from './core/realtime.js';
import { createLogger } from './core/logger.js';

export function start(): Server {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const db = createDb(env.DATABASE_URL);
  const server = createServer();
  const { realtime } = createSocketRealtime(server, env, db);
  server.on('request', createApp(env, logger, db, realtime));

  server.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, 'api listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void db.disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  return server;
}
