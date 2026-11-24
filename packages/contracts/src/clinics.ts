import { z } from 'zod';

export const updateClinicSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  legalName: z.string().max(200).nullable().optional(),
  inn: z.string().max(20).nullable().optional(),
  licenseNumber: z.string().max(60).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const branchInputSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  phone: z.string().max(30).optional(),
});
export const branchUpdateSchema = branchInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
