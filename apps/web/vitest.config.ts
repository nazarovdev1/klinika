import { defineConfig } from 'vitest/config';

// e2e/ is Playwright's territory (pnpm e2e).
export default defineConfig({ test: { exclude: ['e2e/**', 'node_modules/**', '.next*/**'] } });
