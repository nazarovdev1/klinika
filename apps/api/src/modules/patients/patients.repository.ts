import type { Prisma, TenantClient } from '@shifo/db';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

/** All Prisma access for patients. Receives only a tenant-scoped client. */
export function patientsRepository(db: TenantClient) {
  return {
    transaction: <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => db.$transaction(fn),
    get: (id: string) => db.patient.findFirst({ where: { id, deletedAt: null } }),
    search: (where: Prisma.PatientWhereInput, limit: number, cursor?: string) =>
      db.patient.findMany({
        where: { ...where, deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    findByPinflHash: (pinflHash: string) => db.patient.findFirst({ where: { pinflHash } }),
    findSoftDuplicates: (p: {
      lastName: string;
      firstName: string;
      birthDate: Date;
      phone: string;
    }) =>
      db.patient.findMany({
        where: {
          deletedAt: null,
          lastName: { equals: p.lastName, mode: 'insensitive' },
          firstName: { equals: p.firstName, mode: 'insensitive' },
          birthDate: p.birthDate,
          phone: p.phone,
        },
        select: { id: true },
        take: 5,
      }),
    consents: (patientId: string) =>
      db.patientConsent.findMany({ where: { patientId }, orderBy: { grantedAt: 'asc' } }),
  };
}
export type PatientsRepository = ReturnType<typeof patientsRepository>;
export type PatientsTx = Tx;
