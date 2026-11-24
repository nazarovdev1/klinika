import type { Db } from '@shifo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordAudit } from '../core/audit.js';
import { createTestDb, hasDatabase, seedClinic, type SeededClinic } from '../test/harness.js';

describe.skipIf(!hasDatabase)('database hardening', () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let a: SeededClinic;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
    a = await seedClinic(db, 'a');
    await db
      .forTenant(a.clinicId)
      .$transaction((tx) =>
        recordAudit(
          tx,
          { clinicId: a.clinicId, userId: a.users.OWNER?.id ?? '', requestId: 'r1' },
          { action: 'test.event', entityType: 'Test', entityId: a.clinicId },
        ),
      );
  }, 120_000);
  afterAll(async () => {
    await cleanup();
  });

  it('the audit trail is append-only: UPDATE and DELETE are rejected by the database', async () => {
    const t = db.forTenant(a.clinicId);
    expect(await t.auditLog.count({ where: { action: 'test.event' } })).toBe(1);
    await expect(
      t.auditLog.updateMany({ where: { action: 'test.event' }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(t.auditLog.deleteMany({ where: { action: 'test.event' } })).rejects.toThrow(
      /append-only/,
    );
    expect(await t.auditLog.count({ where: { action: 'test.event' } })).toBe(1);
  });
});
