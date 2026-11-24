import type { Db } from '@shifo/db';

/** Global (non-tenant) reference data lookups. Lives in core because the data is shared by all clinics. */
export function searchIcd10(db: Db, q: string, limit: number) {
  return db.system().icd10Code.findMany({
    where: {
      OR: [
        { code: { startsWith: q.toUpperCase() } },
        { titleUz: { contains: q, mode: 'insensitive' } },
        { titleRu: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { code: 'asc' },
    take: limit,
    select: { code: true, titleUz: true, titleRu: true },
  });
}

export function icdTitles(db: Db, codes: string[]) {
  return db.system().icd10Code.findMany({
    where: { code: { in: codes } },
    select: { code: true, titleUz: true, titleRu: true },
  });
}
