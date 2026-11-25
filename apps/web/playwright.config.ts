import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the real API + web build on an isolated Postgres schema (created and seeded by
 * e2e/global-setup.ts, dropped by e2e/global-teardown.ts). Needs DATABASE_URL (root .env) and a built web app.
 *   pnpm --filter @shifo/web build && pnpm --filter @shifo/web e2e
 */
try {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
} catch {
  /* env may already be provided by the shell/CI */
}
const API_PORT = process.env.E2E_API_PORT ?? '4200';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3000';
const schema = (process.env.E2E_SCHEMA ??= `e2e_${randomBytes(5).toString('hex')}`);

const apiEnv = {
  ...process.env,
  NODE_ENV: 'development',
  API_PORT,
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
  DATABASE_SCHEMA: schema,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  LOGIN_RATE_LIMIT: '1000',
  LOG_LEVEL: process.env.E2E_LOG ?? 'warn',
} as Record<string, string>;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1, // the remote dev database occasionally stalls a request
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL: `http://localhost:${WEB_PORT}`, headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm --filter @shifo/api exec tsx src/index.ts',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/uz/login`,
      env: { ...apiEnv, PORT: WEB_PORT, NEXT_DIST_DIR: '.next-e2e' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
