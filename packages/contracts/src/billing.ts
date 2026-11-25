import { z } from 'zod';

/** Money is an integer amount in tiyin-free UZS "so'm" units, always a decimal string on the wire (BigInt in DB). */
export const moneySchema = z
  .string()
  .regex(/^\d{1,15}$/, 'non-negative integer amount as a string');
export const positiveMoneySchema = moneySchema.refine(
  (v) => BigInt(v) > 0n,
  'must be greater than 0',
);

export const PAYMENT_METHODS = ['CASH', 'CARD', 'CLICK', 'PAYME', 'UZUM'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const invoiceLineInputSchema = z
  .object({
    /** Catalog service: the price is taken from the catalog, never from the client. */
    serviceId: z.uuid().optional(),
    /** Custom line (no service): description + unitPrice required. */
    description: z.string().trim().min(1).max(200).optional(),
    unitPrice: moneySchema.optional(),
    qty: z.number().int().min(1).max(1000).default(1),
    discount: moneySchema.default('0'),
  })
  .refine((l) => l.serviceId ?? (l.description && l.unitPrice !== undefined), {
    message: 'serviceId or (description and unitPrice) is required',
  });

export const createInvoiceSchema = z.object({
  patientId: z.uuid(),
  branchId: z.uuid(),
  encounterId: z.uuid().nullable().optional(),
  lines: z.array(invoiceLineInputSchema).min(1).max(50),
  discount: moneySchema.default('0'),
});

export const replaceInvoiceLinesSchema = z.object({
  version: z.number().int(),
  lines: z.array(invoiceLineInputSchema).min(1).max(50),
  discount: moneySchema.default('0'),
});

export const invoiceListSchema = z.object({
  patientId: z.uuid().optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOID']).optional(),
  /** Only invoices still awaiting money (ISSUED or PARTIAL). */
  due: z.literal('1').optional(),
  /** Invoice number fragment or patient name. */
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export const createPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: positiveMoneySchema,
});

export const createRefundSchema = z.object({
  amount: positiveMoneySchema,
  reason: z.string().trim().min(3).max(300),
});

export const openShiftSchema = z.object({
  branchId: z.uuid(),
  openingFloat: moneySchema.default('0'),
});
export const closeShiftSchema = z.object({ countedCash: moneySchema });

export const receiptQuerySchema = z.object({ lang: z.enum(['uz', 'ru']).default('uz') });
