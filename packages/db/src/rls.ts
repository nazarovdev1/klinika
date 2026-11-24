import pg from 'pg';
import { clinicStore } from './rls-store.js';
import { TENANT_MODELS } from './tenancy.js';

/**
 * Row-level security support (defense in depth behind `forTenant`).
 *
 * The tenant client runs on a pool where every checkout first stores the current clinic in the session
 * (`set_config('app.clinic_id', ...)`). `forTenant` publishes the clinic id through this store; RLS
 * policies (see `rlsSql`) compare each row's `clinicId` with that setting. When no clinic is set the
 * setting is empty and the policies match nothing.
 */
const SET_CLINIC = `select set_config('app.clinic_id', $1, false)`;

export function createRlsPool(connectionString: string, tenantRole?: string): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  if (tenantRole) {
    // Used by tests (and as an alternative to a dedicated login role): drop to a non-owner role.
    pool.on('connect', (client) => {
      client.query(`SET ROLE "${tenantRole.replaceAll('"', '')}"`).catch(() => undefined);
    });
  }
  const connect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>;
  const patchedConnect = async (): Promise<pg.PoolClient> => {
    const client = await connect();
    try {
      await client.query(SET_CLINIC, [clinicStore.getStore() ?? '']);
    } catch (err) {
      client.release(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    return client;
  };
  // The adapter uses the promise forms of pool.connect() and pool.query().
  (pool as unknown as { connect: unknown }).connect = patchedConnect;
  (pool as unknown as { query: unknown }).query = async (...args: unknown[]) => {
    const client = await patchedConnect();
    try {
      return await (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
    } finally {
      client.release();
    }
  };
  return pool;
}

const q = (s: string): string => `"${s}"`;

/**
 * SQL that enables RLS on every tenant table and on Clinic. Apply it as the table owner. Tables are NOT
 * forced, so the owner/migrator role (used by `system()` and migrations) keeps full access, while the
 * restricted application role is filtered by the policies.
 * `force` is for tests, which run both clients as the same owner role.
 */
export function rlsSql(opts: { force?: boolean } = {}): string {
  const cond = `"clinicId" = nullif(current_setting('app.clinic_id', true), '')::uuid`;
  const out: string[] = [];
  const one = (table: string, column: string) => {
    out.push(`ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY;`);
    if (opts.force) out.push(`ALTER TABLE ${q(table)} FORCE ROW LEVEL SECURITY;`);
    out.push(`DROP POLICY IF EXISTS tenant_isolation ON ${q(table)};`);
    const c = cond.replace('"clinicId"', q(column));
    out.push(`CREATE POLICY tenant_isolation ON ${q(table)} USING (${c}) WITH CHECK (${c});`);
  };
  for (const m of TENANT_MODELS) one(m, 'clinicId');
  one('Clinic', 'id');
  return out.join('\n') + '\n';
}
