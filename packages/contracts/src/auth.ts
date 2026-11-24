import { z } from 'zod';
import { roleSchema } from './permissions.js';

export const loginRequestSchema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'must contain a letter')
  .regex(/\d/, 'must contain a digit');

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const authUserSchema = z.object({
  id: z.uuid(),
  clinicId: z.uuid(),
  fullName: z.string(),
  login: z.string(),
  role: roleSchema,
  branchIds: z.array(z.uuid()),
  permissions: z.array(z.string()),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: authUserSchema,
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
