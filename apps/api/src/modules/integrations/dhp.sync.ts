import { encounterBundle, MOCK_FHIR_CONFIG, patientToFhir, type FhirConfig } from '@shifo/fhir';
import type { Db } from '@shifo/db';
import type { OutboxEventRow, OutboxHandler } from '../../core/outbox.js';
import type { Pii } from '../../core/pii.js';
import type { DhpClient } from './dhp.client.js';

/**
 * Pushes a signed encounter to DHP.
 * - Requires an active DHP_SHARING consent; otherwise the record is SKIPPED (nothing leaves the system).
 * - Failures throw so the outbox retries with backoff; the record mirrors the state for the admin UI.
 * Never logs patient data.
 */
export function encounterSignedHandler(
  db: Db,
  pii: Pii,
  client: DhpClient,
  cfg: FhirConfig = MOCK_FHIR_CONFIG,
): OutboxHandler {
  async function upsertRecord(
    ev: OutboxEventRow,
    entityId: string,
    data: {
      status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD' | 'SKIPPED';
      lastError?: string | null;
      remoteId?: string;
    },
  ): Promise<void> {
    const t = db.forTenant(ev.clinicId);
    const common = {
      status: data.status,
      attempts: ev.attempts,
      lastError: data.lastError ?? null,
      ...(data.remoteId ? { remoteId: data.remoteId } : {}),
      ...(data.status === 'SENT' ? { syncedAt: new Date() } : {}),
    };
    await t.dhpSyncRecord.upsert({
      where: { outboxEventId: ev.id },
      create: {
        clinicId: ev.clinicId,
        outboxEventId: ev.id,
        entityType: 'Encounter',
        entityId,
        ...common,
      },
      update: common,
    });
  }

  const entityIdOf = (ev: OutboxEventRow): string =>
    (ev.payload as { encounterId: string }).encounterId;

  return {
    type: 'encounter.signed',

    async handle(ev) {
      const encounterId = entityIdOf(ev);
      const t = db.forTenant(ev.clinicId);
      try {
        const enc = await t.encounter.findFirst({
          where: { id: encounterId },
          include: { vitals: { orderBy: { recordedAt: 'desc' }, take: 1 }, diagnoses: true },
        });
        if (enc?.status !== 'SIGNED' || !enc.signedAt)
          throw new Error('encounter not signed or missing');
        const patient = await t.patient.findFirstOrThrow({ where: { id: enc.patientId } });

        const consent = await t.patientConsent.findFirst({
          where: { patientId: patient.id, type: 'DHP_SHARING' },
          orderBy: { grantedAt: 'desc' },
        });
        if (!consent?.granted || consent.revokedAt) {
          await upsertRecord(ev, encounterId, {
            status: 'SKIPPED',
            lastError: 'no DHP_SHARING consent',
          });
          return;
        }

        const [clinic, branch] = await Promise.all([
          t.clinic.findFirstOrThrow({ where: {} }),
          t.branch.findFirstOrThrow({ where: { id: enc.branchId } }),
        ]);
        const bundle = encounterBundle(
          {
            id: enc.id,
            patientId: patient.dhpPatientId ?? patient.id,
            doctorId: enc.doctorId,
            organizationRef: clinic.dhpOrganizationId
              ? `Organization/${clinic.dhpOrganizationId}`
              : null,
            locationRef: branch.dhpLocationId ? `Location/${branch.dhpLocationId}` : null,
            startedAt: enc.startedAt,
            signedAt: enc.signedAt,
            diagnoses: enc.diagnoses.map((d) => ({
              code: d.icd10Code,
              title: d.title,
              type: d.type,
            })),
            vitals: enc.vitals[0] ?? null,
          },
          cfg,
        );
        // The Patient resource travels in the same bundle so DHP can match/create it.
        const patientResource = patientToFhir(
          {
            id: patient.dhpPatientId ?? patient.id,
            lastName: patient.lastName,
            firstName: patient.firstName,
            middleName: patient.middleName,
            birthDate: patient.birthDate,
            sex: patient.sex,
            phone: patient.phone,
            pinfl: patient.pinflEnc ? pii.decrypt(patient.pinflEnc) : null,
            passport: patient.passportEnc ? pii.decrypt(patient.passportEnc) : null,
            address: patient.address,
          },
          cfg,
        );
        const entries = (bundle.entry ?? []) as unknown[];
        bundle.entry = [
          {
            fullUrl: `Patient/${patientResource.id ?? ''}`,
            resource: patientResource,
            request: { method: 'PUT', url: `Patient/${patientResource.id ?? ''}` },
          },
          ...entries,
        ];

        const { remoteId } = await client.sendBundle(bundle);
        await t.encounter.updateMany({
          where: { id: encounterId },
          data: { dhpEncounterId: remoteId, dhpSyncStatus: 'SENT' },
        });
        await upsertRecord(ev, encounterId, { status: 'SENT', remoteId });
      } catch (err) {
        await upsertRecord(ev, encounterId, {
          status: 'FAILED',
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        });
        throw err;
      }
    },

    async onDead(ev, error) {
      await upsertRecord(ev, entityIdOf(ev), { status: 'DEAD', lastError: error });
      await db
        .forTenant(ev.clinicId)
        .encounter.updateMany({ where: { id: entityIdOf(ev) }, data: { dhpSyncStatus: 'DEAD' } });
    },
  };
}
