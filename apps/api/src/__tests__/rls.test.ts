import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, rlsSql, type Db } from '@shifo/db';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createLogger } from '../core/logger.js';
import {
  hasDatabase,
  PASSWORD,
  root,
  seedClinic,
  testEnv,
  type SeededClinic,
} from '../test/harness.js';

/**
 * Proves row-level security independently of forTenant's WHERE injection:
 * the app role is a non-owner, so Postgres itself filters rows by `app.clinic_id`.
 */
describe.skipIf(!hasDatabase)('row-level security', () => {
  const url = process.env.DATABASE_URL ?? '';
  const suffix = randomBytes(5).toString('hex');
  const schema = `t_rls_${suffix}`;
  const role = `rls_app_${suffix}`;
  let db: Db;
  let a: SeededClinic;
  let b: SeededClinic;

  const withAdmin = async <T>(fn: (c: pg.Client) => Promise<T>): Promise<T> => {
    const c = new pg.Client({ connectionString: url });
    c.on('error', () => undefined);
    await c.connect();
    try {
      return await fn(c);
    } finally {
      await c.end().catch(() => undefined);
    }
  };

  beforeAll(async () => {
    await withAdmin(async (c) => {
      await c.query(`CREATE SCHEMA "${schema}"`);
      await c.query(`SET search_path TO "${schema}"`);
      const dir = resolve(root, 'packages/db/prisma/migrations');
      for (const name of readdirSync(dir).sort()) {
        const file = resolve(dir, name, 'migration.sql');
        if (existsSync(file)) await c.query(readFileSync(file, 'utf8'));
      }
      await c.query(rlsSql()); // owner stays exempt: this mirrors production (owner = migrator/system)
      await c.query(`CREATE ROLE "${role}" NOLOGIN`);
      await c.query(`GRANT "${role}" TO CURRENT_USER`);
      await c.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      await c.query(`GRANT ALL ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`);
    });
    db = createDb(url, schema, { rls: { tenantRole: role } });
    a = await seedClinic(db, 'a'); // seeding uses system(): owner role, exempt from RLS
    b = await seedClinic(db, 'b');
  }, 120_000);

  afterAll(async () => {
    await db.disconnect();
    await withAdmin(async (c) => {
      await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await c.query(`DROP ROLE IF EXISTS "${role}"`);
    });
  });

  /** Runs raw SQL as the restricted app role with the given clinic in the session. */
  const asApp = async (clinicId: string | null, sql: string, params: unknown[] = []) =>
    withAdmin(async (c) => {
      await c.query(`SET ROLE "${role}"`);
      await c.query(`SELECT set_config('app.clinic_id', $1, false)`, [clinicId ?? '']);
      return c.query(sql, params);
    });

  it('the database itself hides other clinics rows, even for hand-written SQL', async () => {
    const own = await asApp(a.clinicId, `SELECT "clinicId" FROM "${schema}"."User"`);
    expect(own.rowCount).toBeGreaterThan(0);
    expect(own.rows.every((r: { clinicId: string }) => r.clinicId === a.clinicId)).toBe(true);

    const none = await asApp(null, `SELECT 1 FROM "${schema}"."User"`);
    expect(none.rowCount).toBe(0); // no clinic in the session -> no rows

    const clinics = await asApp(a.clinicId, `SELECT id FROM "${schema}"."Clinic"`);
    expect(clinics.rows).toEqual([{ id: a.clinicId }]);
  });

  it('refuses writes into another clinic (WITH CHECK) and cannot touch its rows', async () => {
    await expect(
      asApp(
        a.clinicId,
        `INSERT INTO "${schema}"."Patient" (id, "clinicId", "lastName", "firstName", "birthDate", sex, phone, "updatedAt")
         VALUES (gen_random_uuid(), $1, 'X', 'Y', '2000-01-01', 'MALE', '+998900000000', now())`,
        [b.clinicId],
      ),
    ).rejects.toThrow(/row-level security/);
    const upd = await asApp(
      a.clinicId,
      `UPDATE "${schema}"."User" SET "fullName" = 'hacked' WHERE "clinicId" = $1`,
      [b.clinicId],
    );
    expect(upd.rowCount).toBe(0);
  });

  it('the application works end to end on the restricted role', async () => {
    const app = createApp(testEnv(), createLogger('silent'), db);
    const login = async (l: string) =>
      (
        (await request(app).post('/api/v1/auth/login').send({ login: l, password: PASSWORD }))
          .body as {
          accessToken: string;
        }
      ).accessToken;
    const ta = await login(a.users.REGISTRAR?.login ?? '');
    const tb = await login(b.users.REGISTRAR?.login ?? '');
    const created = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${ta}`)
      .send({
        lastName: 'RLS',
        firstName: 'Bemor',
        birthDate: '1991-02-03',
        sex: 'MALE',
        phone: '+998901112200',
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app)
      .get(`/api/v1/patients/${id}`)
      .set('Authorization', `Bearer ${ta}`)
      .expect(200);
    await request(app)
      .get(`/api/v1/patients/${id}`)
      .set('Authorization', `Bearer ${tb}`)
      .expect(404);
    const list = await request(app)
      .get('/api/v1/patients')
      .set('Authorization', `Bearer ${tb}`)
      .expect(200);
    expect((list.body as { items: unknown[] }).items).toEqual([]);
  });

  it('a forgotten WHERE would still not leak: raw queries on the tenant pool see only the current clinic', async () => {
    const rows = await db.forTenant(a.clinicId).$transaction(async (tx) => {
      return tx.$queryRawUnsafe<{ clinicId: string }[]>(
        `SELECT "clinicId" FROM "${schema}"."User"`,
      );
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.clinicId === a.clinicId)).toBe(true);
  });
});
