import type { Db, TenantClient } from '@shifo/db';
import type { z } from 'zod';
import type {
  addendumSchema,
  createEncounterSchema,
  encounterListSchema,
  setDiagnosesSchema,
  setPrescriptionsSchema,
  textTemplateSchema,
  updateEncounterSchema,
  vitalsSchema,
} from '@shifo/contracts';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { patientNames } from '../../core/patient-names.js';
import { searchIcd10 } from '../../core/reference.js';
import {
  assertAttending,
  assertCanRead,
  assertCanRecordVitals,
  assertOpen,
} from './encounters.policy.js';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];
type Create = z.infer<typeof createEncounterSchema>;
type Update = z.infer<typeof updateEncounterSchema>;
type Vitals = z.infer<typeof vitalsSchema>;
type Diagnoses = z.infer<typeof setDiagnosesSchema>;
type Prescriptions = z.infer<typeof setPrescriptionsSchema>;
type ListQuery = z.infer<typeof encounterListSchema>;
type Template = z.infer<typeof textTemplateSchema>;

const include = {
  vitals: { orderBy: { recordedAt: 'desc' as const }, take: 1 },
  diagnoses: { orderBy: { createdAt: 'asc' as const } },
  prescriptions: { orderBy: { createdAt: 'asc' as const } },
  addenda: { orderBy: { createdAt: 'asc' as const } },
};

type Loaded = NonNullable<Awaited<ReturnType<TenantClient['encounter']['findFirst']>>> & {
  vitals: { id: string }[];
};

function dto(e: {
  id: string;
  branchId: string;
  patientId: string;
  doctorId: string;
  appointmentId: string | null;
  status: string;
  startedAt: Date;
  signedAt: Date | null;
  complaints: string | null;
  anamnesis: string | null;
  objectiveStatus: string | null;
  conclusion: string | null;
  recommendations: string | null;
  version: number;
  vitals?: object[];
  diagnoses?: object[];
  prescriptions?: object[];
  addenda?: object[];
}) {
  return {
    ...e,
    startedAt: e.startedAt.toISOString(),
    signedAt: e.signedAt?.toISOString() ?? null,
    vitals: e.vitals?.[0] ?? null,
  };
}

export function encountersService(db: Db) {
  const tenant = (ctx: AuthContext) => db.forTenant(ctx.clinicId);

  async function load(tx: Pick<Tx, 'encounter'>, id: string) {
    const enc = await tx.encounter.findFirst({ where: { id } });
    if (!enc) throw new AppError(404, 'NOT_FOUND', 'Encounter not found');
    return enc;
  }
  const full = (tx: Pick<Tx, 'encounter'>, id: string) =>
    tx.encounter.findFirstOrThrow({ where: { id }, include });

  /** Bumps the version with an optimistic check (when given) and returns the new row. */
  async function touch(tx: Tx, id: string, version?: number, data: object = {}) {
    const res = await tx.encounter.updateMany({
      where: { id, status: 'OPEN', ...(version !== undefined && { version }) },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
    }
  }

  return {
    async create(ctx: AuthContext, input: Create) {
      return tenant(ctx).$transaction(async (tx) => {
        if (!(await tx.patient.findFirst({ where: { id: input.patientId, deletedAt: null } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Patient not found');
        }
        if (!(await tx.branch.findFirst({ where: { id: input.branchId } }))) {
          throw new AppError(404, 'NOT_FOUND', 'Branch not found');
        }
        if (input.appointmentId) {
          const appt = await tx.appointment.findFirst({ where: { id: input.appointmentId } });
          if (!appt || appt.patientId !== input.patientId || appt.doctorId !== ctx.userId) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Appointment does not match', [
              { path: 'appointmentId', message: 'must be your appointment for this patient' },
            ]);
          }
          const existing = await tx.encounter.findFirst({
            where: { appointmentId: input.appointmentId, status: { not: 'CANCELLED' } },
          });
          if (existing) return dto({ ...existing }); // idempotent: re-opening returns the same visit
        }
        const created = await tx.encounter.create({
          data: {
            clinicId: ctx.clinicId,
            branchId: input.branchId,
            patientId: input.patientId,
            doctorId: ctx.userId,
            appointmentId: input.appointmentId ?? null,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'encounter.created',
          entityType: 'Encounter',
          entityId: created.id,
          after: { patientId: created.patientId },
        });
        return dto(created);
      });
    },

    async get(ctx: AuthContext, id: string) {
      const t = tenant(ctx);
      const enc = await t.encounter.findFirst({ where: { id }, include });
      if (!enc) throw new AppError(404, 'NOT_FOUND', 'Encounter not found');
      assertCanRead(ctx, enc);
      await t.$transaction((tx) =>
        recordAudit(tx, ctx, { action: 'encounter.viewed', entityType: 'Encounter', entityId: id }),
      );
      return dto(enc);
    },

    async list(ctx: AuthContext, q: ListQuery) {
      const rows = await tenant(ctx).encounter.findMany({
        where: {
          ...(q.patientId && { patientId: q.patientId }),
          ...(q.status && { status: q.status }),
          ...(q.from && { startedAt: { gte: new Date(q.from) } }),
          ...(q.to && { startedAt: { lt: new Date(q.to) } }),
          // A doctor lists own encounters; others' history is limited to signed ones.
          ...(ctx.role === 'DOCTOR'
            ? q.mine
              ? { doctorId: ctx.userId }
              : { OR: [{ doctorId: ctx.userId }, { status: 'SIGNED' as const }] }
            : {}),
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, q.limit);
      const names = await patientNames(
        tenant(ctx),
        page.map((r) => r.patientId),
      );
      return {
        items: page.map((r) => ({ ...dto(r), patientName: names.get(r.patientId) ?? null })),
        nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async update(ctx: AuthContext, id: string, input: Update) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertAttending(ctx, enc);
        assertOpen(enc);
        const { version, ...fields } = input;
        await touch(tx, id, version, fields);
        await recordAudit(tx, ctx, {
          action: 'encounter.updated',
          entityType: 'Encounter',
          entityId: id,
          after: { fields: Object.keys(fields) }, // never the clinical text itself
        });
        return dto(await full(tx, id));
      });
    },

    async setVitals(ctx: AuthContext, id: string, v: Vitals) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertCanRecordVitals(ctx, enc);
        await tx.vitals.create({
          data: { clinicId: ctx.clinicId, encounterId: id, recordedByUserId: ctx.userId, ...v },
        });
        await touch(tx, id);
        await recordAudit(tx, ctx, {
          action: 'encounter.vitals_recorded',
          entityType: 'Encounter',
          entityId: id,
        });
        return dto(await full(tx, id));
      });
    },

    async setDiagnoses(ctx: AuthContext, id: string, input: Diagnoses) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertAttending(ctx, enc);
        assertOpen(enc);
        const codes = [...new Set(input.items.map((d) => d.icd10Code))];
        const known = await tx.icd10Code.findMany({ where: { code: { in: codes } } });
        const byCode = new Map(known.map((k) => [k.code, k]));
        const unknown = codes.filter((c) => !byCode.has(c));
        if (unknown.length > 0) {
          throw new AppError(
            422,
            'VALIDATION_ERROR',
            'Unknown ICD-10 code',
            unknown.map((c) => ({ path: 'icd10Code', message: c })),
          );
        }
        if (input.items.filter((d) => d.type === 'PRIMARY').length > 1) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Only one primary diagnosis', [
            { path: 'items', message: 'at most one PRIMARY diagnosis' },
          ]);
        }
        await tx.diagnosis.deleteMany({ where: { encounterId: id } });
        await tx.diagnosis.createMany({
          data: input.items.map((d) => ({
            clinicId: ctx.clinicId,
            encounterId: id,
            icd10Code: d.icd10Code,
            title: byCode.get(d.icd10Code)?.titleUz ?? d.icd10Code,
            type: d.type,
            note: d.note ?? null,
          })),
        });
        await touch(tx, id);
        await recordAudit(tx, ctx, {
          action: 'encounter.diagnoses_set',
          entityType: 'Encounter',
          entityId: id,
          after: { count: input.items.length },
        });
        return dto(await full(tx, id));
      });
    },

    async setPrescriptions(ctx: AuthContext, id: string, input: Prescriptions) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertAttending(ctx, enc);
        assertOpen(enc);
        await tx.prescription.deleteMany({ where: { encounterId: id } });
        await tx.prescription.createMany({
          data: input.items.map((p) => ({
            clinicId: ctx.clinicId,
            encounterId: id,
            drugName: p.drugName,
            form: p.form ?? null,
            dosage: p.dosage ?? null,
            frequency: p.frequency ?? null,
            durationDays: p.durationDays ?? null,
            instructions: p.instructions ?? null,
          })),
        });
        await touch(tx, id);
        await recordAudit(tx, ctx, {
          action: 'encounter.prescriptions_set',
          entityType: 'Encounter',
          entityId: id,
          after: { count: input.items.length },
        });
        return dto(await full(tx, id));
      });
    },

    /** Signs the encounter: immutable from now on. Emits `encounter.signed` through the outbox. */
    async sign(ctx: AuthContext, id: string, version: number) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertAttending(ctx, enc);
        assertOpen(enc);
        const primary = await tx.diagnosis.count({ where: { encounterId: id, type: 'PRIMARY' } });
        if (primary === 0) {
          throw new AppError(422, 'VALIDATION_ERROR', 'A primary diagnosis is required to sign', [
            { path: 'diagnoses', message: 'add a PRIMARY diagnosis' },
          ]);
        }
        await touch(tx, id, version, { status: 'SIGNED', signedAt: new Date() });
        if (enc.appointmentId) {
          await tx.appointment.updateMany({
            where: { id: enc.appointmentId, status: { in: ['ARRIVED', 'IN_PROGRESS'] } },
            data: { status: 'COMPLETED', version: { increment: 1 } },
          });
        }
        await tx.outboxEvent.create({
          data: {
            clinicId: ctx.clinicId,
            type: 'encounter.signed',
            payload: { encounterId: id, patientId: enc.patientId },
          },
        });
        await recordAudit(tx, ctx, {
          action: 'encounter.signed',
          entityType: 'Encounter',
          entityId: id,
        });
        return dto(await full(tx, id));
      });
    },

    /** Corrections to a signed encounter are addenda, never edits. */
    async addAddendum(ctx: AuthContext, id: string, input: z.infer<typeof addendumSchema>) {
      return tenant(ctx).$transaction(async (tx) => {
        const enc = await load(tx, id);
        assertAttending(ctx, enc);
        if (enc.status !== 'SIGNED') {
          throw new AppError(409, 'CONFLICT', 'Addenda can only be added to signed encounters');
        }
        await tx.encounterAddendum.create({
          data: {
            clinicId: ctx.clinicId,
            encounterId: id,
            authorUserId: ctx.userId,
            text: input.text,
          },
        });
        await tx.outboxEvent.create({
          data: {
            clinicId: ctx.clinicId,
            type: 'encounter.addendum_added',
            payload: { encounterId: id },
          },
        });
        await recordAudit(tx, ctx, {
          action: 'encounter.addendum_added',
          entityType: 'Encounter',
          entityId: id,
        });
        return dto(await full(tx, id));
      });
    },

    // ---- ICD-10 and text templates --------------------------------------------------------------
    searchIcd: (q: string, limit: number) => searchIcd10(db, q, limit),

    listTemplates: (ctx: AuthContext, specialty?: string) =>
      tenant(ctx).textTemplate.findMany({
        where: specialty ? { specialty } : {},
        orderBy: [{ specialty: 'asc' }, { title: 'asc' }],
      }),

    async createTemplate(ctx: AuthContext, input: Template) {
      return tenant(ctx).$transaction(async (tx) => {
        const t = await tx.textTemplate.create({
          data: { ...input, clinicId: ctx.clinicId, createdByUserId: ctx.userId },
        });
        await recordAudit(tx, ctx, {
          action: 'template.created',
          entityType: 'TextTemplate',
          entityId: t.id,
        });
        return t;
      });
    },

    async deleteTemplate(ctx: AuthContext, id: string) {
      const res = await tenant(ctx).textTemplate.deleteMany({ where: { id } });
      if (res.count === 0) throw new AppError(404, 'NOT_FOUND', 'Template not found');
    },
  };
}
export type EncountersService = ReturnType<typeof encountersService>;
export type { Loaded };
