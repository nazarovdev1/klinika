import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'format: HH:mm');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format: YYYY-MM-DD');

export const scheduleInputSchema = z
  .object({
    branchId: z.uuid(),
    weekday: z.number().int().min(1).max(7),
    startTime: hhmm,
    endTime: hhmm,
    slotMinutes: z.number().int().min(5).max(240).optional(),
    validFrom: day,
    validTo: day.nullable().optional(),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

export const exceptionInputSchema = z
  .object({
    branchId: z.uuid(),
    date: day,
    type: z.enum(['DAY_OFF', 'CUSTOM_HOURS']),
    startTime: hhmm.optional(),
    endTime: hhmm.optional(),
    reason: z.string().max(200).optional(),
  })
  .refine((v) => v.type === 'DAY_OFF' || (v.startTime && v.endTime && v.startTime < v.endTime), {
    message: 'CUSTOM_HOURS needs startTime < endTime',
    path: ['startTime'],
  });

export const slotsQuerySchema = z.object({ date: day, branchId: z.uuid() });

export const APPOINTMENT_STATUSES = [
  'BOOKED',
  'CONFIRMED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export const createAppointmentSchema = z.object({
  branchId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid(),
  serviceId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  source: z.enum(['FRONT_DESK', 'PHONE', 'TELEGRAM']).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const updateAppointmentSchema = z.object({
  version: z.number().int(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  doctorId: z.uuid().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const setAppointmentStatusSchema = z.object({
  version: z.number().int(),
  status: appointmentStatusSchema,
});

export const appointmentQuerySchema = z.object({
  branchId: z.uuid().optional(),
  doctorId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

export const issueTicketSchema = z.object({
  branchId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid().nullable().optional(),
});

export const callNextSchema = z.object({
  branchId: z.uuid(),
  cabinet: z.string().max(20).optional(),
});

export const queueQuerySchema = z.object({ branchId: z.uuid() });
