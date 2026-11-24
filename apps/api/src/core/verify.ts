import type { Db } from '@shifo/db';
import { AppError } from './errors.js';
import type { Pii } from './pii.js';

const sig = (pii: Pii, encounterId: string): string =>
  pii.hash(`encounter:${encounterId}`).slice(0, 24);

/** URL embedded in the visit summary QR code. */
export function verificationUrl(webOrigin: string, pii: Pii, encounterId: string): string {
  return `${webOrigin}/api/v1/verify/encounter/${encounterId}/${sig(pii, encounterId)}`;
}

/**
 * Public verification of a printed visit summary. Returns no patient data: only that a signed encounter
 * exists, which clinic and doctor signed it and when.
 */
export async function verifyEncounter(db: Db, pii: Pii, encounterId: string, signature: string) {
  if (signature !== sig(pii, encounterId))
    throw new AppError(404, 'NOT_FOUND', 'Document not found');
  const prisma = db.system();
  const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (enc?.status !== 'SIGNED') throw new AppError(404, 'NOT_FOUND', 'Document not found');
  const [clinic, doctor] = await Promise.all([
    prisma.clinic.findUniqueOrThrow({ where: { id: enc.clinicId } }),
    prisma.user.findUniqueOrThrow({ where: { id: enc.doctorId } }),
  ]);
  return {
    valid: true,
    clinic: clinic.name,
    doctor: doctor.fullName,
    signedAt: enc.signedAt?.toISOString() ?? null,
  };
}
