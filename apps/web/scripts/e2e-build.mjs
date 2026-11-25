// Builds the web app for E2E into .next-e2e (separate from `next dev`'s .next), pointing the /api proxy at
// the E2E API port. Usage: pnpm --filter @shifo/web e2e:build
import { spawnSync } from 'node:child_process';
import { env, exit } from 'node:process';

const apiPort = env.E2E_API_PORT ?? '4200';
const result = spawnSync('pnpm', ['exec', 'next', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...env, NEXT_DIST_DIR: '.next-e2e', API_INTERNAL_URL: `http://localhost:${apiPort}` },
});
exit(result.status ?? 1);
