import { defineConfig } from 'vitest/config';

// Integration tests talk to a remote Postgres, so allow generous timeouts.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 120_000 },
});
