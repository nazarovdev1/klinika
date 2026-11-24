import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
import { createRlsPool } from './rls.js';
import { forTenant, type TenantClient } from './tenancy.js';

export { PrismaClient, Prisma } from './generated/client.js';
export type {
  Role,
  ClinicStatus,
  OutboxStatus,
  Sex,
  ConsentType,
  AppointmentStatus,
  AppointmentSource,
  QueueStatus,
  ExceptionType,
  EncounterStatus,
  DiagnosisType,
  DhpSyncStatus,
  InvoiceStatus,
  PaymentMethod,
  ShiftStatus,
  LabOrderStatus,
  LabFlag,
  NotificationChannel,
  NotificationStatus,
} from './generated/client.js';
export { forTenant, TENANT_MODELS, type TenantClient } from './tenancy.js';
export { rlsSql } from './rls.js';

export interface Db {
  /** Tenant-scoped client. The only client modules may use. */
  forTenant(clinicId: string): TenantClient;
  /** Unscoped client: core/, CLI, seeds and migrations only. */
  system(): PrismaClient;
  disconnect(): Promise<void>;
}

export interface DbOptions {
  /**
   * Row-level security mode. The tenant client then runs on a pool that stores the current clinic in the
   * session; `systemUrl` (owner/migrator role, exempt from RLS) is used for `system()`. `tenantRole` makes
   * the tenant pool `SET ROLE` to a restricted role (when the URL itself is not already that role).
   */
  rls?: { systemUrl?: string; tenantRole?: string };
}

// Concurrent writers (queue counter, exclusion constraint) wait on row locks; keep generous limits.
const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

export function createDb(connectionString: string, schema?: string, options: DbOptions = {}): Db {
  const adapterOptions = schema ? { schema } : undefined;
  const rls = options.rls;
  const tenantAdapter = rls
    ? new PrismaPg(createRlsPool(connectionString, rls.tenantRole), adapterOptions)
    : new PrismaPg({ connectionString }, adapterOptions);
  const tenantPrisma = new PrismaClient({ adapter: tenantAdapter, transactionOptions });
  const systemPrisma = rls
    ? new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: rls.systemUrl ?? connectionString },
          adapterOptions,
        ),
        transactionOptions,
      })
    : tenantPrisma;
  return {
    forTenant: (clinicId) => forTenant(tenantPrisma, clinicId),
    system: () => systemPrisma,
    disconnect: async () => {
      await tenantPrisma.$disconnect();
      if (systemPrisma !== tenantPrisma) await systemPrisma.$disconnect();
    },
  };
}
