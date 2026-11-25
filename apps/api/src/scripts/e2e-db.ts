import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb } from '@shifo/db';
import pg from 'pg';
import { parseEnv } from '../config/env.js';
import { createPii } from '../core/pii.js';
import { seedDemo } from '../seed/demo.js';

/**
 * E2E database lifecycle: `setup <schema>` creates an isolated schema, applies the migrations and seeds a small
 * demo clinic; `teardown <schema>` drops it. Used by apps/web/e2e (Playwright) so runs never touch real data.
 */
const [cmd, schema] = process.argv.slice(2);
if (!cmd || !schema || !/^[a-z0-9_]+$/.test(schema)) {
  console.error('usage: e2e-db <setup|teardown> <schema>');
  process.exit(2);
}
const env = parseEnv();
const url = env.DATABASE_URL;

async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  c.on('error', () => undefined);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

if (cmd === 'setup') {
  await withClient(async (c) => {
    await c.query(`CREATE SCHEMA "${schema}"`);
    await c.query(`SET search_path TO "${schema}"`);
    const dir = resolve(import.meta.dirname, '../../../../packages/db/prisma/migrations');
    for (const name of readdirSync(dir).sort()) {
      const file = resolve(dir, name, 'migration.sql');
      if (existsSync(file)) await c.query(readFileSync(file, 'utf8'));
    }
  });
  const db = createDb(url, schema);
  try {
    await seedDemo(db, createPii(env), {
      clinicName: 'E2E Klinika',
      password: 'E2e-pass-12345',
      patients: 30,
      months: 1,
      loginPrefix: 'e2e',
    });
  } finally {
    await db.disconnect();
  }
  console.log(`e2e schema ready: ${schema}`);
} else if (cmd === 'teardown') {
  await withClient((c) => c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  console.log(`e2e schema dropped: ${schema}`);
}
