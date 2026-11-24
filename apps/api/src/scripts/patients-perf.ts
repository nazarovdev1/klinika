// Seeds N synthetic patients into an isolated schema and measures search latency.
// Run: pnpm --filter @shifo/api exec tsx src/scripts/patients-perf.ts [count]
import { performance } from 'node:perf_hooks';
import { createPii } from '../core/pii.js';
import { seedPatients } from '../seed/patients.js';
import { buildApp, createTestDb, seedClinic, testEnv } from '../test/harness.js';
import { patientsService } from '../modules/patients/patients.service.js';
import type { AuthContext } from '../core/context.js';

const count = Number(process.argv[2] ?? 100_000);
const { db, cleanup } = await createTestDb();
try {
  buildApp(db);
  const pii = createPii(testEnv());
  const clinic = await seedClinic(db, 'perf');
  const t0 = performance.now();
  await seedPatients(db, pii, clinic.clinicId, count);
  console.log(`seeded ${count} patients in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

  const sample = await db.system().patient.findMany({ take: 1, skip: Math.floor(count / 2) });
  const p = sample[0];
  if (!p) throw new Error('no sample');
  const pinfl = pii.decrypt(p.pinflEnc ?? '');
  const ctx: AuthContext = {
    userId: clinic.users.REGISTRAR?.id ?? '',
    clinicId: clinic.clinicId,
    branchIds: [clinic.branchId],
    role: 'REGISTRAR',
    permissions: ['patients:read'],
    mustChangePassword: false,
    requestId: 'perf',
  };
  const svc = patientsService(db, pii);
  const rtt: number[] = [];
  for (let i = 0; i < 15; i++) {
    const s0 = performance.now();
    await db.system().$queryRaw`SELECT 1`;
    rtt.push(performance.now() - s0);
  }
  rtt.sort((a, b) => a - b);
  console.log(`network round trip (SELECT 1): median ${rtt[7]?.toFixed(0)} ms`);
  const queries: Record<string, string> = {
    pinfl,
    passport: pii.decrypt(p.passportEnc ?? ''),
    phone: p.phone,
    'phone suffix': p.phone.slice(-6),
    birthDate: p.birthDate.toISOString().slice(0, 10),
    'name prefix': `${p.lastName.slice(0, 4)} ${p.firstName.slice(0, 2)}`,
  };
  for (const [label, q] of Object.entries(queries)) {
    await svc.search(ctx, q, 25); // warm up
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const s = performance.now();
      await svc.search(ctx, q, 25);
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    console.log(
      `${label.padEnd(13)} median ${times[7]?.toFixed(0)} ms  max ${times[14]?.toFixed(0)} ms`,
    );
  }
} finally {
  await cleanup();
}
