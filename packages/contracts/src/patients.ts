import { z } from 'zod';
import { uzPhoneSchema } from './staff.js';

export const pinflSchema = z.string().regex(/^\d{14}$/, 'PINFL must be 14 digits');
export const passportSchema = z.string().regex(/^[A-Z]{2}\d{7}$/, 'format: AA1234567');

export const SEXES = ['MALE', 'FEMALE'] as const;
export const sexSchema = z.enum(SEXES);
export const CONSENT_TYPES = ['DATA_PROCESSING', 'DHP_SHARING', 'SMS'] as const;
export const consentTypeSchema = z.enum(CONSENT_TYPES);
export type ConsentTypeValue = z.infer<typeof consentTypeSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'format: YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) <= new Date(), 'invalid date');

const patientFields = {
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).nullable().optional(),
  birthDate: isoDate,
  sex: sexSchema,
  phone: uzPhoneSchema,
  phone2: uzPhoneSchema.nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  pinfl: pinflSchema.nullable().optional(),
  passport: passportSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  bloodGroup: z.enum(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']).nullable().optional(),
  allergiesText: z.string().max(1000).nullable().optional(),
};

export const createPatientSchema = z.object({
  ...patientFields,
  /** Set to true after the registrar reviewed a (name + birthDate + phone) duplicate warning. */
  confirmDuplicate: z.boolean().optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({ version: z.number().int() })
  .extend(z.object(patientFields).partial().shape);
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientSearchSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const setConsentSchema = z.object({
  granted: z.boolean(),
  documentUrl: z.string().max(500).optional(),
});

export const patientDtoSchema = z.object({
  id: z.uuid(),
  lastName: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  birthDate: z.string(),
  sex: sexSchema,
  phone: z.string(),
  phone2: z.string().nullable(),
  address: z.string().nullable(),
  pinfl: z.string().nullable(),
  passport: z.string().nullable(),
  notes: z.string().nullable(),
  bloodGroup: z.string().nullable(),
  allergiesText: z.string().nullable(),
  version: z.number().int(),
});
export type PatientDto = z.infer<typeof patientDtoSchema>;
