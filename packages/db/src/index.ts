import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';
import { forTenant, type TenantClient } from './tenancy.js';

export { PrismaClient, Prisma } from './generated/client.js';
export type { Role, ClinicStatus, OutboxStatus, Sex, ConsentType, AppointmentStatus, AppointmentSource, QueueStatus, ExceptionType, EncounterStatus, DiagnosisType } from './generated/client.js';
export { forTenant, TENANT_MODELS, type TenantClient } from './tenancy.js';

export interface Db {
  /** Tenant-scoped client. The only client modules may use. */
  forTenant(clinicId: string): TenantClient;
  /** Unscoped client: core/, CLI, seeds and migrations only. */
  system(): PrismaClient;
  disconnect(): Promise<void>;
}

export function createDb(connectionString: string, schema?: string): Db {
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  const prisma = new PrismaClient({
    adapter,
    // Concurrent writers (queue counter, exclusion constraint) wait on row locks; keep generous limits.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
  return {
    forTenant: (clinicId) => forTenant(prisma, clinicId),
    system: () => prisma,
    disconnect: () => prisma.$disconnect(),
  };
}
