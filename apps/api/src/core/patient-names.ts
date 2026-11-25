import type { TenantClient } from '@shifo/db';

/** Display names for lists (calendar, queue). Names only: no contact or identity data. */
export async function patientNames(
  t: Pick<TenantClient, 'patient'>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await t.patient.findMany({
    where: { id: { in: unique } },
    select: { id: true, lastName: true, firstName: true, middleName: true },
  });
  return new Map(
    rows.map((p) => [p.id, [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ')]),
  );
}
