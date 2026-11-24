import { z } from 'zod';

const money = z.string().regex(/^\d{1,15}$/, 'integer so’m as a string');

export const categoryInputSchema = z.object({
  nameUz: z.string().min(1).max(120),
  nameRu: z.string().min(1).max(120),
});

export const serviceInputSchema = z.object({
  code: z.string().min(1).max(40),
  nameUz: z.string().min(1).max(200),
  nameRu: z.string().min(1).max(200),
  categoryId: z.uuid().nullable().optional(),
  durationMin: z.number().int().min(5).max(480).optional(),
  isLab: z.boolean().optional(),
  isActive: z.boolean().optional(),
  dhpServiceCode: z.string().max(60).nullable().optional(),
});
export const serviceUpdateSchema = serviceInputSchema.partial();

export const setPriceSchema = z.object({
  branchId: z.uuid(),
  price: money,
  /** ISO timestamp; defaults to now. The previous open price is closed at this instant. */
  validFrom: z.iso.datetime().optional(),
});

export const serviceQuerySchema = z.object({
  branchId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});

export const doctorServicesSchema = z.object({ serviceIds: z.array(z.uuid()).max(500) });
