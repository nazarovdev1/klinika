import { esc, type Lang } from '../documents/encounter.template.js';

const L = {
  uz: {
    title: 'Laboratoriya tahlili natijalari',
    patient: 'Bemor',
    birthDate: 'Tug‘ilgan sana',
    barcode: 'Shtrix-kod',
    date: 'Sana',
    test: 'Tahlil',
    result: 'Natija',
    unit: 'Birlik',
    ref: 'Me’yor',
    validated: 'Tasdiqladi',
    flags: { NORMAL: '', LOW: '↓', HIGH: '↑', CRITICAL_LOW: '↓↓', CRITICAL_HIGH: '↑↑' },
  },
  ru: {
    title: 'Результаты лабораторных исследований',
    patient: 'Пациент',
    birthDate: 'Дата рождения',
    barcode: 'Штрихкод',
    date: 'Дата',
    test: 'Исследование',
    result: 'Результат',
    unit: 'Ед.',
    ref: 'Норма',
    validated: 'Подтвердил',
    flags: { NORMAL: '', LOW: '↓', HIGH: '↑', CRITICAL_LOW: '↓↓', CRITICAL_HIGH: '↑↑' },
  },
} as const;

export interface LabDoc {
  lang: Lang;
  timeZone: string;
  clinicName: string;
  patientName: string;
  birthDate: Date;
  barcode: string;
  validatedAt: Date;
  validatorName: string;
  items: {
    name: string;
    value: string | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    flag: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | null;
  }[];
}

const range = (lo: number | null, hi: number | null): string =>
  lo != null && hi != null
    ? `${String(lo)} – ${String(hi)}`
    : lo != null
      ? `≥ ${String(lo)}`
      : hi != null
        ? `≤ ${String(hi)}`
        : '';

export function renderLabHtml(d: LabDoc): string {
  const t = L[d.lang];
  const fmt = (x: Date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: d.timeZone, dateStyle: 'short' }).format(x);
  return `<!doctype html><html lang="${d.lang}"><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
 body{font-family:Arial,sans-serif;font-size:11pt;color:#111}
 h1{font-size:15pt;margin:0} header{border-bottom:2px solid #0f766e;padding-bottom:6px;margin-bottom:10px}
 table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}
 .abn{font-weight:bold;color:#b91c1c}
</style></head><body>
<header><h1>${esc(d.clinicName)}</h1><div>${esc(t.title)}</div></header>
<p><b>${esc(t.patient)}:</b> ${esc(d.patientName)} &nbsp; <b>${esc(t.birthDate)}:</b> ${esc(fmt(d.birthDate))}<br>
<b>${esc(t.barcode)}:</b> ${esc(d.barcode)} &nbsp; <b>${esc(t.date)}:</b> ${esc(fmt(d.validatedAt))}</p>
<table><tr><th>${esc(t.test)}</th><th>${esc(t.result)}</th><th>${esc(t.unit)}</th><th>${esc(t.ref)}</th></tr>
${d.items
  .map((i) => {
    const abnormal = i.flag !== null && i.flag !== 'NORMAL';
    const mark = i.flag ? t.flags[i.flag] : '';
    return `<tr><td>${esc(i.name)}</td><td class="${abnormal ? 'abn' : ''}">${esc(i.value)} ${esc(mark)}</td><td>${esc(i.unit)}</td><td>${esc(range(i.refLow, i.refHigh))}</td></tr>`;
  })
  .join('')}
</table>
<p style="margin-top:16px">${esc(t.validated)}: ${esc(d.validatorName)}</p>
</body></html>`;
}
