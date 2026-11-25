import { execFileSync } from 'node:child_process';

export default function globalTeardown(): void {
  const schema = process.env.E2E_SCHEMA ?? '';
  execFileSync(
    'pnpm',
    ['--filter', '@shifo/api', 'exec', 'tsx', 'src/scripts/e2e-db.ts', 'teardown', schema],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        WEB_ORIGIN: `http://localhost:${process.env.E2E_WEB_PORT ?? '3000'}`,
      },
    },
  );
}
