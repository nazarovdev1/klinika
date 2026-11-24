import type {
  ConsentTypeValue,
  CreatePatientInput,
  PatientDto,
  UpdatePatientInput,
} from '@shifo/contracts';
import type { Db } from '@shifo/db';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import type { Pii } from '../../core/pii.js';
import { patientsRepository, type PatientsRepository } from './patients.repository.js';
import { buildSearchWhere } from './patients.search.js';

interface PatientRow {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  birthDate: Date;
  sex: PatientDto['sex'];
  phone: string;
  phone2: string | null;
  address: string | null;
  pinflEnc: string | null;
  passportEnc: string | null;
  notes: string | null;
  bloodGroup: string | null;
  allergiesText: string | null;
  version: number;
}

const maskPinfl = (v: string): string => `${'•'.repeat(10)}${v.slice(-4)}`;
const maskPassport = (v: string): string => `${v.slice(0, 2)}•••${v.slice(-2)}`;
const toDate = (v: string): Date => new Date(`${v}T00:00:00Z`);

export function patientsService(db: Db, pii: Pii) {
  const repoFor = (ctx: AuthContext): PatientsRepository =>
    patientsRepository(db.forTenant(ctx.clinicId));

  function toDto(p: PatientRow, full: boolean): PatientDto {
    const pinfl = p.pinflEnc ? pii.decrypt(p.pinflEnc) : null;
    const passport = p.passportEnc ? pii.decrypt(p.passportEnc) : null;
    return {
      id: p.id,
      lastName: p.lastName,
      firstName: p.firstName,
      middleName: p.middleName,
      birthDate: p.birthDate.toISOString().slice(0, 10),
      sex: p.sex,
      phone: p.phone,
      phone2: p.phone2,
      address: p.address,
      pinfl: pinfl && !full ? maskPinfl(pinfl) : pinfl,
      passport: passport && !full ? maskPassport(passport) : passport,
      notes: full ? p.notes : null,
      bloodGroup: p.bloodGroup,
      allergiesText: full ? p.allergiesText : null,
      version: p.version,
    };
  }

  /** Audit payloads never contain PINFL/passport in clear. */
  const audited = (p: PatientRow) => ({
    lastName: p.lastName,
    firstName: p.firstName,
    birthDate: p.birthDate.toISOString().slice(0, 10),
    sex: p.sex,
    hasPinfl: Boolean(p.pinflEnc),
    hasPassport: Boolean(p.passportEnc),
  });

  function duplicate(ids: string[], detail: string, hard: boolean): AppError {
    const err = new AppError(
      409,
      'DUPLICATE_PATIENT',
      detail,
      ids.map((id) => ({
        path: hard ? 'pinfl' : 'duplicate',
        message: id,
      })),
    );
    return err;
  }

  return {
    async search(ctx: AuthContext, q: string | undefined, limit: number, cursor?: string) {
      const rows = await repoFor(ctx).search(buildSearchWhere(q, pii), limit, cursor);
      const page = rows.slice(0, limit);
      return {
        items: page.map((p) => toDto(p, false)),
        nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async get(ctx: AuthContext, id: string): Promise<PatientDto> {
      const repo = repoFor(ctx);
      const patient = await repo.get(id);
      if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      // Reading a medical record is itself audited.
      await repo.transaction((tx) =>
        recordAudit(tx, ctx, { action: 'patient.viewed', entityType: 'Patient', entityId: id }),
      );
      return toDto(patient, true);
    },

    async create(ctx: AuthContext, input: CreatePatientInput): Promise<PatientDto> {
      const repo = repoFor(ctx);
      const pinflHash = input.pinfl ? pii.hash(input.pinfl) : null;
      if (pinflHash) {
        const existing = await repo.findByPinflHash(pinflHash);
        if (existing)
          throw duplicate([existing.id], 'A patient with this PINFL already exists', true);
      }
      const birthDate = toDate(input.birthDate);
      if (!input.confirmDuplicate) {
        const similar = await repo.findSoftDuplicates({
          lastName: input.lastName,
          firstName: input.firstName,
          birthDate,
          phone: input.phone,
        });
        if (similar.length > 0) {
          throw duplicate(
            similar.map((s) => s.id),
            'A patient with the same name, birth date and phone exists; resend with confirmDuplicate=true',
            false,
          );
        }
      }
      return repo.transaction(async (tx) => {
        const created = await tx.patient.create({
          data: {
            clinicId: ctx.clinicId,
            lastName: input.lastName,
            firstName: input.firstName,
            middleName: input.middleName ?? null,
            birthDate,
            sex: input.sex,
            phone: input.phone,
            phone2: input.phone2 ?? null,
            address: input.address ?? null,
            pinflEnc: input.pinfl ? pii.encrypt(input.pinfl) : null,
            pinflHash,
            passportEnc: input.passport ? pii.encrypt(input.passport) : null,
            passportHash: input.passport ? pii.hash(input.passport) : null,
            notes: input.notes ?? null,
            bloodGroup: input.bloodGroup ?? null,
            allergiesText: input.allergiesText ?? null,
          },
        });
        await recordAudit(tx, ctx, {
          action: 'patient.created',
          entityType: 'Patient',
          entityId: created.id,
          after: audited(created),
        });
        // TODO(phase-5): emit patient.created to the outbox for DHP sync.
        return toDto(created, true);
      });
    },

    async update(ctx: AuthContext, id: string, input: UpdatePatientInput): Promise<PatientDto> {
      const repo = repoFor(ctx);
      const before = await repo.get(id);
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      const { version, pinfl, passport, birthDate, ...rest } = input;

      let pinflHash: string | null | undefined;
      if (pinfl !== undefined) {
        pinflHash = pinfl ? pii.hash(pinfl) : null;
        if (pinflHash) {
          const other = await repo.findByPinflHash(pinflHash);
          if (other && other.id !== id) {
            throw duplicate([other.id], 'A patient with this PINFL already exists', true);
          }
        }
      }
      return repo.transaction(async (tx) => {
        const res = await tx.patient.updateMany({
          where: { id, version, deletedAt: null },
          data: {
            ...rest,
            ...(birthDate !== undefined && { birthDate: toDate(birthDate) }),
            ...(pinfl !== undefined && {
              pinflEnc: pinfl ? pii.encrypt(pinfl) : null,
              pinflHash,
            }),
            ...(passport !== undefined && {
              passportEnc: passport ? pii.encrypt(passport) : null,
              passportHash: passport ? pii.hash(passport) : null,
            }),
            version: { increment: 1 },
          },
        });
        if (res.count === 0) {
          throw new AppError(409, 'CONFLICT', 'The record was modified by someone else');
        }
        const after = await tx.patient.findFirstOrThrow({ where: { id } });
        await recordAudit(tx, ctx, {
          action: 'patient.updated',
          entityType: 'Patient',
          entityId: id,
          before: audited(before),
          after: audited(after),
        });
        return toDto(after, true);
      });
    },

    async remove(ctx: AuthContext, id: string): Promise<void> {
      const repo = repoFor(ctx);
      const before = await repo.get(id);
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      await repo.transaction(async (tx) => {
        await tx.patient.updateMany({
          where: { id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await recordAudit(tx, ctx, {
          action: 'patient.deleted',
          entityType: 'Patient',
          entityId: id,
          before: audited(before),
        });
      });
    },

    async listConsents(ctx: AuthContext, patientId: string) {
      const repo = repoFor(ctx);
      if (!(await repo.get(patientId))) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      return (await repo.consents(patientId)).map((c) => ({
        id: c.id,
        type: c.type,
        granted: c.granted,
        grantedAt: c.grantedAt.toISOString(),
        revokedAt: c.revokedAt?.toISOString() ?? null,
        documentUrl: c.documentUrl,
      }));
    },

    /** Grants or revokes a consent. History is kept: revoking closes the active row. */
    async setConsent(
      ctx: AuthContext,
      patientId: string,
      type: ConsentTypeValue,
      granted: boolean,
      documentUrl?: string,
    ): Promise<void> {
      const repo = repoFor(ctx);
      if (!(await repo.get(patientId))) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      await repo.transaction(async (tx) => {
        const active = await tx.patientConsent.findFirst({
          where: { patientId, type, granted: true, revokedAt: null },
        });
        if (granted && !active) {
          await tx.patientConsent.create({
            data: {
              clinicId: ctx.clinicId,
              patientId,
              type,
              granted: true,
              recordedByUserId: ctx.userId,
              documentUrl: documentUrl ?? null,
            },
          });
        } else if (!granted && active) {
          await tx.patientConsent.updateMany({
            where: { id: active.id },
            data: { revokedAt: new Date(), recordedByUserId: ctx.userId },
          });
        } else {
          return; // nothing changed
        }
        await recordAudit(tx, ctx, {
          action: granted ? 'consent.granted' : 'consent.revoked',
          entityType: 'Patient',
          entityId: patientId,
          after: { type },
        });
      });
    },
  };
}
