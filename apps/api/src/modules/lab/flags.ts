export type Flag = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH';

export interface Ranges {
  refLow: number | null;
  refHigh: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

/** Parses a lab-entered number; accepts a decimal comma ("5,4"). Returns null when not numeric. */
export function parseNumeric(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Critical bounds win over the reference range; missing bounds are open. */
export function flagFor(value: number, r: Ranges): Flag {
  if (r.criticalLow != null && value < r.criticalLow) return 'CRITICAL_LOW';
  if (r.criticalHigh != null && value > r.criticalHigh) return 'CRITICAL_HIGH';
  if (r.refLow != null && value < r.refLow) return 'LOW';
  if (r.refHigh != null && value > r.refHigh) return 'HIGH';
  return 'NORMAL';
}
