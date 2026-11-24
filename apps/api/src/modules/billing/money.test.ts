import { describe, expect, it } from 'vitest';
import {
  expectedCash,
  invoiceTotals,
  lineTotal,
  MoneyError,
  percentOf,
  statusFor,
} from './money.js';

describe('billing math (bigint)', () => {
  it('computes line totals exactly, including values beyond 2^53', () => {
    expect(lineTotal({ qty: 3, unitPrice: 150_000n, discount: 10_000n })).toBe(440_000n);
    expect(lineTotal({ qty: 2, unitPrice: 9_007_199_254_740_993n, discount: 0n })).toBe(
      18_014_398_509_481_986n,
    );
  });

  it('rejects invalid lines', () => {
    expect(() => lineTotal({ qty: 0, unitPrice: 1n, discount: 0n })).toThrow(MoneyError);
    expect(() => lineTotal({ qty: 1, unitPrice: 100n, discount: 101n })).toThrow(MoneyError);
    expect(() => lineTotal({ qty: 1, unitPrice: -1n, discount: 0n })).toThrow(MoneyError);
  });

  it('computes invoice totals with an invoice-level discount', () => {
    const t = invoiceTotals(
      [
        { qty: 1, unitPrice: 100_000n, discount: 0n },
        { qty: 2, unitPrice: 50_000n, discount: 20_000n },
      ],
      30_000n,
    );
    expect(t).toEqual({ subtotal: 180_000n, discount: 30_000n, total: 150_000n });
    expect(() => invoiceTotals([{ qty: 1, unitPrice: 10n, discount: 0n }], 11n)).toThrow(
      MoneyError,
    );
  });

  it('rounds percentages half up with no float drift', () => {
    expect(percentOf(100_000n, 1_000)).toBe(10_000n);
    expect(percentOf(1n, 5_000)).toBe(1n); // 0.5 -> 1
    expect(percentOf(333n, 1_000)).toBe(33n); // 33.3 -> 33
    expect(percentOf(335n, 1_000)).toBe(34n); // 33.5 -> 34
    expect(() => percentOf(1n, 10_001)).toThrow(MoneyError);
  });

  it('derives the invoice status from paid amounts', () => {
    expect(statusFor(100n, 0n)).toBe('ISSUED');
    expect(statusFor(100n, 40n)).toBe('PARTIAL');
    expect(statusFor(100n, 100n)).toBe('PAID');
    expect(() => statusFor(100n, 101n)).toThrow(MoneyError);
  });

  it('computes expected cash for a shift', () => {
    expect(expectedCash(50_000n, 300_000n, 20_000n)).toBe(330_000n);
  });
});
