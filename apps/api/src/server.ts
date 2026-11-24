import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './core/logger.js';

// Socket.IO is attached here in Phase 3.
export function start(): Server {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const server = createServer(createApp(env, logger));

  server.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, 'api listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
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
