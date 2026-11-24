/** Pure billing math on bigint. No floating point anywhere. */

export interface LineAmounts {
  qty: number;
  unitPrice: bigint;
  discount: bigint;
}

export class MoneyError extends Error {}

export function lineTotal(l: LineAmounts): bigint {
  if (!Number.isInteger(l.qty) || l.qty < 1) throw new MoneyError('qty must be a positive integer');
  if (l.unitPrice < 0n || l.discount < 0n) throw new MoneyError('amounts must not be negative');
  const gross = BigInt(l.qty) * l.unitPrice;
  if (l.discount > gross) throw new MoneyError('line discount exceeds the line amount');
  return gross - l.discount;
}

export function invoiceTotals(lines: LineAmounts[], invoiceDiscount: bigint) {
  if (invoiceDiscount < 0n) throw new MoneyError('amounts must not be negative');
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0n);
  if (invoiceDiscount > subtotal) throw new MoneyError('discount exceeds the invoice subtotal');
  return { subtotal, discount: invoiceDiscount, total: subtotal - invoiceDiscount };
}

/** Percentage discount in basis points (100 bp = 1 %), rounded half up. */
export function percentOf(amount: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError('basis points must be an integer within 0..10000');
  }
  return (amount * BigInt(basisPoints) + 5_000n) / 10_000n;
}

export type PayableStatus = 'ISSUED' | 'PARTIAL' | 'PAID';

/** Status of an issued invoice from its total and net paid amount. */
export function statusFor(total: bigint, paid: bigint): PayableStatus {
  if (paid < 0n || paid > total) throw new MoneyError('paid amount out of range');
  if (paid === 0n) return 'ISSUED';
  return paid === total ? 'PAID' : 'PARTIAL';
}

export function expectedCash(openingFloat: bigint, cashIn: bigint, cashRefunded: bigint): bigint {
  return openingFloat + cashIn - cashRefunded;
}
