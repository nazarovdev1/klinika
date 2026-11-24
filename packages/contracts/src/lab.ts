import { z } from 'zod';

const num = z.number().finite();

export const labTestInputSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    nameUz: z.string().trim().min(1).max(160),
    nameRu: z.string().trim().min(1).max(160),
    serviceId: z.uuid().nullable().optional(),
    unit: z.string().max(30).nullable().optional(),
    refLow: num.nullable().optional(),
    refHigh: num.nullable().optional(),
    criticalLow: num.nullable().optional(),
    criticalHigh: num.nullable().optional(),
    isNumeric: z.boolean().default(true),
  })
  .refine((t) => t.refLow == null || t.refHigh == null || t.refLow <= t.refHigh, {
    message: 'refLow must not exceed refHigh',
    path: ['refLow'],
  });

export const createLabOrderSchema = z.object({
  patientId: z.uuid(),
  branchId: z.uuid(),
  encounterId: z.uuid().nullable().optional(),
  testIds: z.array(z.uuid()).min(1).max(40),
});

export const enterResultsSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        value: z.string().trim().min(1).max(200),
        note: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const labOrderListSchema = z.object({
  patientId: z.uuid().optional(),
  status: z.enum(['ORDERED', 'COLLECTED', 'RESULTED', 'VALIDATED', 'CANCELLED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const labPdfQuerySchema = z.object({ lang: z.enum(['uz', 'ru']).default('uz') });
