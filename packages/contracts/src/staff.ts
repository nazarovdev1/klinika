import { z } from 'zod';
import { passwordSchema } from './auth.js';
import { roleSchema } from './permissions.js';

export const uzPhoneSchema = z.string().regex(/^\+998\d{9}$/, 'format: +998XXXXXXXXX');

export const doctorProfileInputSchema = z.object({
  specialty: z.string().min(1).max(100),
  cabinet: z.string().max(20).optional(),
  licenseNumber: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  defaultSlotMinutes: z.number().int().min(5).max(240).optional(),
});

export const createStaffSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: uzPhoneSchema,
  login: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9._-]+$/i),
  password: passwordSchema,
  role: roleSchema,
  branchIds: z.array(z.uuid()).min(1),
  doctorProfile: doctorProfileInputSchema.optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  version: z.number().int(),
  fullName: z.string().min(2).max(120).optional(),
  phone: uzPhoneSchema.optional(),
  role: roleSchema.optional(),
  branchIds: z.array(z.uuid()).min(1).optional(),
  isActive: z.boolean().optional(),
  doctorProfile: doctorProfileInputSchema.optional(),
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const staffDtoSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  phone: z.string(),
  login: z.string(),
  role: roleSchema,
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  branchIds: z.array(z.uuid()),
  version: z.number().int(),
  lastLoginAt: z.string().nullable(),
});
export type StaffDto = z.infer<typeof staffDtoSchema>;
