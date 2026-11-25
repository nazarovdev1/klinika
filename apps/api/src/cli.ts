import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { dbFromEnv } from './core/db.js';
import { parseEnv } from './config/env.js';
import { hashPassword } from './core/passwords.js';
import { createPii } from './core/pii.js';
import { seedDemo } from './seed/demo.js';

/** Platform super-admin CLI: pnpm --filter @shifo/api cli create-clinic --name ... */
async function createClinic(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string' },
      'owner-name': { type: 'string' },
      'owner-login': { type: 'string' },
      'owner-phone': { type: 'string' },
      password: { type: 'string' },
      'branch-name': { type: 'string', default: 'Asosiy filial' },
    },
  });
  const name = values.name;
  const login = values['owner-login'];
  const phone = values['owner-phone'];
  if (!name || !login || !phone || !/^\+998\d{9}$/.test(phone)) {
    throw new Error(
      'Usage: create-clinic --name <clinic> --owner-login <login> --owner-phone +998XXXXXXXXX [--owner-name <name>] [--password <pw>] [--branch-name <name>]',
    );
  }
  const generated = !values.password;
  const password = values.password ?? randomBytes(9).toString('base64url') + '1';
  const passwordHash = await hashPassword(password);
  const db = dbFromEnv(parseEnv());
  try {
    const result = await db.system().$transaction(
      async (tx) => {
        const clinic = await tx.clinic.create({ data: { name } });
        const branch = await tx.branch.create({
          data: { clinicId: clinic.id, name: values['branch-name'] },
        });
        const owner = await tx.user.create({
          data: {
            clinicId: clinic.id,
            fullName: values['owner-name'] ?? 'Owner',
            phone,
            login: login.toLowerCase(),
            passwordHash,
            role: 'OWNER',
            mustChangePassword: true,
            branches: { create: { branchId: branch.id, clinicId: clinic.id } },
          },
        });
        await tx.auditLog.create({
          data: {
            clinicId: clinic.id,
            action: 'clinic.created',
            entityType: 'Clinic',
            entityId: clinic.id,
          },
        });
        return { clinic, branch, owner };
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    console.log(`Clinic created: ${result.clinic.id}`);
    console.log(`Branch: ${result.branch.id}`);
    console.log(`Owner login: ${result.owner.login}`);
    if (generated) console.log(`Temporary password (shown once): ${password}`);
    console.log('The owner must change the password on first login.');
  } finally {
    await db.disconnect();
  }
}

/** Synthetic demo dataset: pnpm db:seed [--name 'Shifo Demo'] [--password ...] [--patients 400] [--months 3] */
async function seedDemoCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string', default: 'Shifo Demo' },
      password: { type: 'string', default: 'Demo-12345' },
      patients: { type: 'string', default: '400' },
      months: { type: 'string', default: '3' },
      prefix: { type: 'string', default: 'sd' },
    },
  });
  const env = parseEnv();
  const db = dbFromEnv(env);
  try {
    const out = await seedDemo(db, createPii(env), {
      clinicName: values.name,
      password: values.password,
      patients: Number(values.patients),
      months: Number(values.months),
      loginPrefix: values.prefix,
    });
    console.log(`Demo clinic: ${out.clinicId}`);
    console.log(`Logins: ${out.logins.join(', ')}`);
    console.log(
      `Password for all: ${values.password} (synthetic data only - never use in production)`,
    );
  } finally {
    await db.disconnect();
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'create-clinic') {
  createClinic(rest).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else if (command === 'seed-demo') {
  seedDemoCommand(rest).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  console.error('Commands: create-clinic, seed-demo');
  process.exit(1);
}
