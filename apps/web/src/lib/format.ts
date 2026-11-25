/** 1234567 -> "1 234 567" from a bigint-safe decimal string (money is never a JS number). */
export function formatMoney(v: string | null | undefined): string {
  if (!v) return '0';
  const neg = v.startsWith('-');
  const digits = neg ? v.slice(1) : v;
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export const fmtDate = (iso: string | null | undefined, tz = 'Asia/Tashkent'): string =>
  iso
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: tz, dateStyle: 'short' }).format(new Date(iso))
    : '—';

export const fmtTime = (iso: string, tz = 'Asia/Tashkent'): string =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: tz, timeStyle: 'short' }).format(new Date(iso));

export const fmtDateTime = (iso: string | null | undefined, tz = 'Asia/Tashkent'): string =>
  iso
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(iso),
      )
    : '—';

/** Today as YYYY-MM-DD in the clinic time zone. */
export const today = (tz = 'Asia/Tashkent'): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

/** Parses a user-typed money amount ("150 000", "150000") to a decimal string, or null when invalid. */
export function parseMoney(input: string): string | null {
  const s = input.replace(/[\s_,]/g, '');
  return /^\d{1,15}$/.test(s) ? s.replace(/^0+(?=\d)/, '') : null;
}
