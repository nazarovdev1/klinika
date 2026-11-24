import { describe, expect, it } from 'vitest';
import { flagFor, parseNumeric } from './flags.js';

const hb = { refLow: 120, refHigh: 160, criticalLow: 70, criticalHigh: 200 };

describe('lab flags', () => {
  it('classifies against reference and critical ranges', () => {
    expect(flagFor(140, hb)).toBe('NORMAL');
    expect(flagFor(120, hb)).toBe('NORMAL'); // bounds are inclusive
    expect(flagFor(119.9, hb)).toBe('LOW');
    expect(flagFor(160.1, hb)).toBe('HIGH');
    expect(flagFor(69, hb)).toBe('CRITICAL_LOW');
    expect(flagFor(201, hb)).toBe('CRITICAL_HIGH');
  });

  it('handles open-ended ranges', () => {
    expect(flagFor(5, { refLow: null, refHigh: 10 })).toBe('NORMAL');
    expect(flagFor(11, { refLow: null, refHigh: 10 })).toBe('HIGH');
    expect(flagFor(-1, { refLow: 0, refHigh: null })).toBe('LOW');
    expect(flagFor(1, { refLow: null, refHigh: null })).toBe('NORMAL');
  });

  it('parses decimal commas and rejects text', () => {
    expect(parseNumeric('5,4')).toBe(5.4);
    expect(parseNumeric(' -2 ')).toBe(-2);
    expect(parseNumeric('abc')).toBeNull();
    expect(parseNumeric('1e5')).toBeNull();
    expect(parseNumeric('')).toBeNull();
  });
});
