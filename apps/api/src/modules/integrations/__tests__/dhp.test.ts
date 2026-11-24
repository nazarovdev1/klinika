import type { Db } from '@shifo/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { createLogger } from '../../../core/logger.js';
import { dispatchOutbox } from '../../../core/outbox.js';
import { createPii } from '../../../core/pii.js';
import {
  createTestDb,
  hasDatabase,
  PASSWORD,
  seedClinic,
  testEnv,
  type SeededClinic,
} from '../../../test/harness.js';
import { MockDhpClient } from '../dhp.client.js';
import { encounterSignedHandler } from '../dhp.sync.js';

const logger = createLogger('silent');

describe('outbox backoff', () => {
  it('grows exponentially and is capped', async () => {
    const { backoffMs } = await import('../../../core/outbox.js');
    expect([1, 2, 3].map(backoffMs)).toEqual([30_000, 60_000, 120_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe.skipIf(!hasDatabase)('DHP sync', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let app: ReturnType<typeof createApp>;
  let a: SeededClinic;
  let b: SeededClinic;
  let ownerToken = '';
  let ownerB = '';
  const client = new MockDhpClient();
  const env = testEnv();
  const pii = createPii(env);
  const handler = () => encounterSignedHandler(db, pii, client);

  async function signedEncounter(
    consent: boolean | null,
  ): Promise<{ outboxId: string; encId: string }> {
    const t = db.forTenant(a.clinicId);
    const patient = await t.patient.create({
      data: {
        clinicId: a.clinicId,
        lastName: 'Sinov',
        firstName: 'Bemor',
        birthDate: new Date('1990-01-01'),
        sex: 'FEMALE',
        phone: '+998901234567',
        pinflEnc: pii.encrypt('12345678901234'),
        pinflHash: pii.hash('12345678901234' + String(Math.random())),
      },
    });
    if (consent !== null) {
      await t.patientConsent.create({
        data: {
          clinicId: a.clinicId,
          patientId: patient.id,
          type: 'DHP_SHARING',
          granted: consent,
        },
      });
    }
    const enc = await t.encounter.create({
      data: {
        clinicId: a.clinicId,
        branchId: a.branchId,
        patientId: patient.id,
        doctorId: a.users.DOCTOR?.id ?? '',
        status: 'SIGNED',
        signedAt: new Date(),
        diagnoses: {
          create: [{ clinicId: a.clinicId, icd10Code: 'J06.9', title: 'ARVI', type: 'PRIMARY' }],
        },
      },
    });
    const ev = await t.outboxEvent.create({
      data: { clinicId: a.clinicId, type: 'encounter.signed', payload: { encounterId: enc.id } },
    });
    return { outboxId: ev.id, encId: enc.id };
  }

  const run = (maxAttempts = 3) => dispatchOutbox(db, [handler()], logger, { maxAttempts });

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    app = createApp(env, logger, db, undefined, undefined, client);
    a = await seedClinic(db, 'a');
    b = await seedClinic(db, 'b');
    const login = async (l: string) =>
      (
        (await request(app).post('/api/v1/auth/login').send({ login: l, password: PASSWORD }))
          .body as {
          accessToken: string;
        }
      ).accessToken;
    ownerToken = await login(a.users.OWNER?.login ?? '');
    ownerB = await login(b.users.OWNER?.login ?? '');
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  it('skips (sends nothing) without a DHP_SHARING consent', async () => {
    const { outboxId } = await signedEncounter(null);
    const before = client.sent.length;
    await run();
    expect(client.sent.length).toBe(before);
    const rec = await db
      .forTenant(a.clinicId)
      .dhpSyncRecord.findFirstOrThrow({ where: { outboxEventId: outboxId } });
    expect(rec.status).toBe('SKIPPED');
  });

  it('skips when consent was refused', async () => {
    const { outboxId } = await signedEncounter(false);
    await run();
    const rec = await db
      .forTenant(a.clinicId)
      .dhpSyncRecord.findFirstOrThrow({ where: { outboxEventId: outboxId } });
    expect(rec.status).toBe('SKIPPED');
  });

  it('sends a bundle with patient, encounter and condition when consent is granted', async () => {
    const { outboxId, encId } = await signedEncounter(true);
    const before = client.sent.length;
    await run();
    expect(client.sent.length).toBe(before + 1);
    const bundle = client.sent.at(-1) as unknown as {
      entry: { resource: { resourceType: string } }[];
    };
    expect(bundle.entry.map((e) => e.resource.resourceType)).toEqual([
      'Patient',
      'Encounter',
      'Condition',
    ]);
    const t = db.forTenant(a.clinicId);
    const rec = await t.dhpSyncRecord.findFirstOrThrow({ where: { outboxEventId: outboxId } });
    expect(rec.status).toBe('SENT');
    expect(rec.remoteId).toMatch(/^mock-/);
    expect((await t.encounter.findFirstOrThrow({ where: { id: encId } })).dhpSyncStatus).toBe(
      'SENT',
    );
    expect((await t.outboxEvent.findFirstOrThrow({ where: { id: outboxId } })).status).toBe(
      'DISPATCHED',
    );
    // idempotent: a second dispatch does not resend
    await run();
    expect(client.sent.length).toBe(before + 1);
  });

  it('retries failures, goes DEAD at the limit, and a manual retry from the admin API succeeds', async () => {
    const { outboxId } = await signedEncounter(true);
    const t = db.forTenant(a.clinicId);
    client.failNext = 99;
    for (let i = 0; i < 3; i++) {
      await run(3);
      // fast-forward the backoff
      await t.outboxEvent.updateMany({
        where: { id: outboxId },
        data: { availableAt: new Date(0) },
      });
    }
    const dead = await t.dhpSyncRecord.findFirstOrThrow({ where: { outboxEventId: outboxId } });
    expect(dead.status).toBe('DEAD');
    expect(dead.lastError).toContain('mock DHP unavailable');
    expect((await t.outboxEvent.findFirstOrThrow({ where: { id: outboxId } })).status).toBe('DEAD');

    client.failNext = 0;
    await request(app)
      .post(`/api/v1/integrations/dhp/records/${dead.id}/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(202);
    await run(3);
    expect((await t.dhpSyncRecord.findFirstOrThrow({ where: { id: dead.id } })).status).toBe(
      'SENT',
    );
    // cannot retry a record that was sent
    await request(app)
      .post(`/api/v1/integrations/dhp/records/${dead.id}/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
  });

  it('exposes status, records and settings to the clinic admin only, per tenant', async () => {
    const status = await request(app)
      .get('/api/v1/integrations/dhp/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(status.body).toMatchObject({ mode: 'mock', reachable: true });
    expect((status.body as { counts: { SENT: number } }).counts.SENT).toBeGreaterThanOrEqual(2);

    const list = await request(app)
      .get('/api/v1/integrations/dhp/records')
      .query({ status: 'SKIPPED' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((list.body as { items: unknown[] }).items).toHaveLength(2);

    const other = await request(app)
      .get('/api/v1/integrations/dhp/records')
      .set('Authorization', `Bearer ${ownerB}`)
      .expect(200);
    expect((other.body as { items: unknown[] }).items).toEqual([]);

    await request(app)
      .put('/api/v1/integrations/dhp/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ dhpOrganizationId: 'org-123' })
      .expect(200);

    const doctor = (
      (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ login: a.users.DOCTOR?.login, password: PASSWORD })
      ).body as { accessToken: string }
    ).accessToken;
    await request(app)
      .get('/api/v1/integrations/dhp/status')
      .set('Authorization', `Bearer ${doctor}`)
      .expect(403);
  });
});
