import { z } from 'zod';

const text = (max = 5000) => z.string().max(max).nullable().optional();

export const createEncounterSchema = z.object({
  patientId: z.uuid(),
  branchId: z.uuid(),
  appointmentId: z.uuid().nullable().optional(),
});

export const updateEncounterSchema = z.object({
  version: z.number().int(),
  complaints: text(),
  anamnesis: text(),
  objectiveStatus: text(),
  conclusion: text(),
  recommendations: text(),
});

export const vitalsSchema = z.object({
  temperature: z.number().min(30).max(45).nullable().optional(),
  systolic: z.number().int().min(40).max(300).nullable().optional(),
  diastolic: z.number().int().min(20).max(200).nullable().optional(),
  pulse: z.number().int().min(20).max(300).nullable().optional(),
  respRate: z.number().int().min(4).max(80).nullable().optional(),
  spo2: z.number().int().min(30).max(100).nullable().optional(),
  weightKg: z.number().min(0.3).max(500).nullable().optional(),
  heightCm: z.number().min(20).max(260).nullable().optional(),
});
export type VitalsInput = z.infer<typeof vitalsSchema>;

export const diagnosisInputSchema = z.object({
  icd10Code: z.string().regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, 'ICD-10 code, e.g. J06.9'),
  type: z.enum(['PRIMARY', 'SECONDARY', 'COMPLICATION']),
  note: z.string().max(500).nullable().optional(),
});
export const setDiagnosesSchema = z.object({ items: z.array(diagnosisInputSchema).max(30) });

export const prescriptionInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  form: z.string().max(60).nullable().optional(),
  dosage: z.string().max(100).nullable().optional(),
  frequency: z.string().max(100).nullable().optional(),
  durationDays: z.number().int().min(1).max(365).nullable().optional(),
  instructions: z.string().max(500).nullable().optional(),
});
export const setPrescriptionsSchema = z.object({ items: z.array(prescriptionInputSchema).max(40) });

export const addendumSchema = z.object({ text: z.string().trim().min(1).max(5000) });

export const encounterListSchema = z.object({
  patientId: z.uuid().optional(),
  mine: z.coerce.boolean().optional(),
  status: z.enum(['OPEN', 'SIGNED', 'CANCELLED']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const icdSearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export const textTemplateSchema = z.object({
  specialty: z.string().min(1).max(100),
  title: z.string().min(1).max(120),
  field: z.enum(['complaints', 'anamnesis', 'objectiveStatus', 'conclusion', 'recommendations']),
  body: z.string().min(1).max(5000),
});

export const pdfQuerySchema = z.object({ lang: z.enum(['uz', 'ru']).default('uz') });
