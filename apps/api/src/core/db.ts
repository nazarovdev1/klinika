import { createDb, type Db } from '@shifo/db';
import type { Env } from '../config/env.js';

/**
 * Builds the database handle from the environment. With DB_RLS=on the tenant client runs on the restricted
 * role from DATABASE_URL (subject to row-level security) and `system()` uses DATABASE_SYSTEM_URL (the
 * owner/migrator role, exempt from RLS).
 */
export function dbFromEnv(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_SYSTEM_URL' | 'DB_RLS' | 'DATABASE_SCHEMA'>,
): Db {
  if (env.DB_RLS === 'on') {
    return createDb(env.DATABASE_URL, env.DATABASE_SCHEMA, {
      rls: { systemUrl: env.DATABASE_SYSTEM_URL ?? env.DATABASE_URL },
    });
  }
  return createDb(env.DATABASE_URL, env.DATABASE_SCHEMA);
}
