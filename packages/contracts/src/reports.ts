import { z } from 'zod';

export const REPORT_NAMES = [
  'revenue',
  'revenue-by-doctor',
  'services',
  'visits',
  'appointments',
  'debts',
  'cash-shifts',
] as const;
export const reportNameSchema = z.enum(REPORT_NAMES);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const reportQuerySchema = z
  .object({
    from: day,
    to: day,
    branchId: z.uuid().optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 366, {
    message: 'range is limited to 366 days',
    path: ['to'],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
