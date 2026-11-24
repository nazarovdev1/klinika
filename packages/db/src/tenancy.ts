import { clinicStore } from './rls-store.js';
import type { PrismaClient } from './generated/client.js';

/** Models that carry clinicId. Clinic itself is scoped by its own id. */
export const TENANT_MODELS = [
  'Branch',
  'User',
  'UserBranch',
  'DoctorProfile',
  'RefreshToken',
  'AuditLog',
  'OutboxEvent',
  'IdempotencyKey',
  'NumberSequence',
  'Patient',
  'PatientConsent',
  'ServiceCategory',
  'Service',
  'ServicePrice',
  'DoctorService',
  'DoctorSchedule',
  'ScheduleException',
  'Appointment',
  'QueueTicket',
  'Encounter',
  'Vitals',
  'Diagnosis',
  'Prescription',
  'EncounterAddendum',
  'Attachment',
  'TextTemplate',
  'DhpSyncRecord',
  'Invoice',
  'InvoiceLine',
  'CashShift',
  'Payment',
  'Refund',
  'LabTest',
  'LabOrder',
  'LabOrderItem',
  'PatientChannel',
  'Notification',
] as const;

const TENANT_SET = new Set<string>(TENANT_MODELS);

type Args = Record<string, unknown>;

const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

function scopeWhere(a: Args, clinicId: string): Record<string, unknown> {
  const where = (a.where ?? {}) as Record<string, unknown>;
  return { ...a, where: { ...where, clinicId } };
}

function stampData(data: unknown, clinicId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => stampData(d, clinicId));
  return { ...(data as Record<string, unknown>), clinicId };
}

/**
 * Returns a client whose every query on a tenant model is restricted to `clinicId`.
 * All tenant data access goes through this single place (RLS-ready, see brief 4.1).
 */
export function forTenant(prisma: PrismaClient, clinicId: string) {
  if (!clinicId) throw new Error('forTenant requires a clinicId');
  const extended = prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query: rawQuery }) {
          const inner = rawQuery as (a: unknown) => Promise<unknown>;
          // publish the clinic for row-level security (no-op unless the pool is an RLS pool)
          const query = (a: unknown): Promise<unknown> =>
            clinicStore.run(clinicId, async () => await inner(a)); // Prisma promises are lazy: run inside the store;
          const a = args as unknown as Record<string, unknown>;
          if (model === 'Clinic') {
            if (WHERE_OPS.has(operation)) {
              const where = (a.where ?? {}) as Record<string, unknown>;
              return query({ ...a, where: { ...where, id: clinicId } });
            }
            throw new Error(`Operation ${operation} on Clinic is not allowed on a tenant client`);
          }
          if (!TENANT_SET.has(model)) return query(args);
          if (WHERE_OPS.has(operation)) return query(scopeWhere(a, clinicId));
          if (operation === 'create') return query({ ...a, data: stampData(a.data, clinicId) });
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            return query({ ...a, data: stampData(a.data, clinicId) });
          }
          if (operation === 'upsert') {
            return query({
              ...a,
              where: { ...(a.where as object), clinicId },
              create: stampData(a.create, clinicId),
            });
          }
          throw new Error(`Operation ${operation} on ${model} is not supported on a tenant client`);
        },
      },
    },
  });
  // Interactive transactions check a connection out before any query runs: publish the clinic there too.
  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (...a: unknown[]) =>
          clinicStore.run(clinicId, () =>
            (target.$transaction as (...x: unknown[]) => unknown).apply(target, a),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export type TenantClient = ReturnType<typeof forTenant>;
