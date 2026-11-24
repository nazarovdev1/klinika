import type { TenantClient } from '@shifo/db';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

const include = { branches: { select: { branchId: true } }, doctorProfile: true } as const;

/** All Prisma access for staff. Receives only a tenant-scoped client. */
export function staffRepository(db: TenantClient) {
  return {
    transaction: <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => db.$transaction(fn),
    list: (limit: number, cursor?: string) =>
      db.user.findMany({
        where: { deletedAt: null },
        include,
        orderBy: { id: 'asc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    get: (id: string) => db.user.findFirst({ where: { id, deletedAt: null }, include }),
    countBranches: (ids: string[]) => db.branch.count({ where: { id: { in: ids } } }),
    include,
  };
}
export type StaffRepository = ReturnType<typeof staffRepository>;
export type StaffTx = Tx;
