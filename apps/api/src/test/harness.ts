import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb, type Db } from '@shifo/db';
import pg from 'pg';
import { createApp } from '../app.js';
import { parseEnv, type Env } from '../config/env.js';
import { createLogger } from '../core/logger.js';
import { hashPassword } from '../core/passwords.js';

const root = resolve(import.meta.dirname, '../../../..');
const envFile = resolve(root, '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const PASSWORD = 'Passw0rd-test-1';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://unused',
    REDIS_URL: 'redis://unused',
    JWT_ACCESS_SECRET: 'x'.repeat(40),
    PII_KEYS: 'k1:' + Buffer.alloc(32, 7).toString('base64'),
    PII_ACTIVE_KEY_ID: 'k1',
    PII_HMAC_KEY: Buffer.alloc(48, 9).toString('base64'),
    LOG_LEVEL: 'silent',
    LOGIN_RATE_LIMIT: '1000',
    ...overrides,
  });
}

/**
 * Creates an isolated schema in the configured Postgres, applies the Prisma migrations to it,
 * and returns a Db bound to that schema. Dropped on cleanup.
 */
export async function createTestDb(): Promise<{ db: Db; cleanup: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for integration tests');
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  const dir = resolve(root, 'packages/db/prisma/migrations');
  for (const name of readdirSync(dir).sort()) {
    const file = resolve(dir, name, 'migration.sql');
    if (existsSync(file)) await admin.query(readFileSync(file, 'utf8'));
  }
  admin.on('error', () => undefined);
  await admin.end().catch(() => undefined); // the remote server drops long-idle connections; reconnect to clean up
  const db = createDb(url, schema);
  return {
    db,
    cleanup: async () => {
      await db.disconnect();
      for (let attempt = 1; attempt <= 4; attempt++) {
        const c = new pg.Client({ connectionString: url });
        c.on('error', () => undefined);
        try {
          await c.connect();
          await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          return;
        } catch (err) {
          if (attempt === 4) throw err;
        } finally {
          await c.end().catch(() => undefined);
        }
      }
    },
  };
}

export function buildApp(db: Db, overrides: Record<string, string> = {}) {
  const env = testEnv(overrides);
  return { app: createApp(env, createLogger('silent'), db), env };
}

let cachedHash: Promise<string> | undefined;

export interface SeededClinic {
  clinicId: string;
  branchId: string;
  users: Record<string, { id: string; login: string }>;
}

/** Creates a clinic with one branch and one user per role (password = PASSWORD, no forced change). */
export async function seedClinic(db: Db, label: string): Promise<SeededClinic> {
  cachedHash ??= hashPassword(PASSWORD);
  const passwordHash = await cachedHash;
  const prisma = db.system();
  const clinic = await prisma.clinic.create({ data: { name: `Clinic ${label}` } });
  const branch = await prisma.branch.create({
    data: { clinicId: clinic.id, name: `Main ${label}` },
  });
  const users: SeededClinic['users'] = {};
  let i = 0;
  for (const role of [
    'OWNER',
    'ADMIN',
    'REGISTRAR',
    'DOCTOR',
    'NURSE',
    'CASHIER',
    'LAB',
  ] as const) {
    const login = `${role.toLowerCase()}.${label}`;
    const user = await prisma.user.create({
      data: {
        clinicId: clinic.id,
        fullName: `${role} ${label}`,
        phone: `+99890000000${i++}`,
        login,
        passwordHash,
        role,
        mustChangePassword: false,
        branches: { create: { branchId: branch.id, clinicId: clinic.id } },
      },
    });
    users[role] = { id: user.id, login };
  }
  return { clinicId: clinic.id, branchId: branch.id, users };
}
