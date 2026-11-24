import type { Prisma } from '@shifo/db';
import type { Pii } from '../../core/pii.js';

/** Turns a free-text search box value into a Prisma filter. Lookup keys first, names last. */
export function buildSearchWhere(raw: string | undefined, pii: Pii): Prisma.PatientWhereInput {
  const q = raw?.trim();
  if (!q) return {};
  const compact = q.replace(/[\s-]/g, '');

  if (/^\d{14}$/.test(compact)) return { pinflHash: pii.hash(compact) };
  if (/^[A-Za-z]{2}\d{7}$/.test(compact)) return { passportHash: pii.hash(compact.toUpperCase()) };

  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(q);
  if (dmy) return { birthDate: new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T00:00:00Z`) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return { birthDate: new Date(`${q}T00:00:00Z`) };

  if (/^\+?\d{4,13}$/.test(compact)) {
    return /^\+998\d{9}$/.test(compact)
      ? { OR: [{ phone: compact }, { phone2: compact }] }
      : { OR: [{ phone: { contains: compact } }, { phone2: { contains: compact } }] };
  }

  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: tokens.map((t) => ({
      OR: [
        { lastName: { startsWith: t, mode: 'insensitive' as const } },
        { firstName: { startsWith: t, mode: 'insensitive' as const } },
        { middleName: { startsWith: t, mode: 'insensitive' as const } },
      ],
    })),
  };
}
