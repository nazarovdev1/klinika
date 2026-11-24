import type { Db } from '@shifo/db';
import QRCode from 'qrcode';
import type { Env } from '../../config/env.js';
import { recordAudit } from '../../core/audit.js';
import type { AuthContext } from '../../core/context.js';
import { AppError } from '../../core/errors.js';
import { icdTitles } from '../../core/reference.js';
import { verificationUrl } from '../../core/verify.js';
import type { Pii } from '../../core/pii.js';
import { assertCanRead } from '../encounters/encounters.policy.js';
import { renderEncounterHtml, type Lang } from './encounter.template.js';
import type { PdfRenderer } from './pdf.js';

export function documentsService(db: Db, env: Env, pii: Pii, renderer: PdfRenderer) {
  async function encounterHtml(ctx: AuthContext, id: string, lang: Lang): Promise<string> {
    const t = db.forTenant(ctx.clinicId);
    const enc = await t.encounter.findFirst({
      where: { id },
      include: {
        vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
        diagnoses: { orderBy: { createdAt: 'asc' } },
        prescriptions: { orderBy: { createdAt: 'asc' } },
        addenda: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!enc) throw new AppError(404, 'NOT_FOUND', 'Encounter not found');
    assertCanRead(ctx, enc);
    if (enc.status !== 'SIGNED') {
      throw new AppError(409, 'CONFLICT', 'The visit summary is available after signing');
    }
    const [clinic, patient, doctor, branch] = await Promise.all([
      t.clinic.findFirstOrThrow({ where: {} }),
      t.patient.findFirstOrThrow({ where: { id: enc.patientId } }),
      t.user.findFirstOrThrow({ where: { id: enc.doctorId }, include: { doctorProfile: true } }),
      t.branch.findFirstOrThrow({ where: { id: enc.branchId } }),
    ]);
    const titles = new Map(
      (
        await icdTitles(
          db,
          enc.diagnoses.map((d) => d.icd10Code),
        )
      ).map((x) => [x.code, x]),
    );
    const verifyUrl = verificationUrl(env.WEB_ORIGIN, pii, enc.id);
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 180 });
    await t.$transaction((tx) =>
      recordAudit(tx, ctx, {
        action: 'encounter.pdf_generated',
        entityType: 'Encounter',
        entityId: id,
      }),
    );
    return renderEncounterHtml({
      lang,
      timeZone: branch.timezone,
      clinic: {
        name: clinic.name,
        address: branch.address ?? clinic.address,
        phone: branch.phone ?? clinic.phone,
        licenseNumber: clinic.licenseNumber,
      },
      patient: {
        fullName: [patient.lastName, patient.firstName, patient.middleName]
          .filter(Boolean)
          .join(' '),
        birthDate: patient.birthDate,
      },
      doctor: { fullName: doctor.fullName, specialty: doctor.doctorProfile?.specialty },
      signedAt: enc.signedAt,
      startedAt: enc.startedAt,
      complaints: enc.complaints,
      anamnesis: enc.anamnesis,
      objectiveStatus: enc.objectiveStatus,
      conclusion: enc.conclusion,
      recommendations: enc.recommendations,
      vitals: enc.vitals[0] ?? null,
      diagnoses: enc.diagnoses.map((d) => ({
        code: d.icd10Code,
        title:
          (lang === 'ru' ? titles.get(d.icd10Code)?.titleRu : titles.get(d.icd10Code)?.titleUz) ??
          d.title,
        type: d.type,
      })),
      prescriptions: enc.prescriptions,
      addenda: enc.addenda,
      qrDataUrl,
      verifyUrl,
    });
  }

  return {
    encounterHtml,
    async encounterPdf(ctx: AuthContext, id: string, lang: Lang): Promise<Buffer> {
      return renderer.render(await encounterHtml(ctx, id, lang));
    },
  };
}
export type DocumentsService = ReturnType<typeof documentsService>;
