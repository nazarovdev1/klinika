import { esc, type Lang } from '../documents/encounter.template.js';

const L = {
  uz: {
    title: 'To‘lov kvitansiyasi',
    invoice: 'Hisob-faktura',
    date: 'Sana',
    cashier: 'Kassir',
    method: 'To‘lov usuli',
    total: 'Jami',
    paid: 'To‘landi',
    balance: 'Qoldiq',
    currency: 'so‘m',
    notFiscal: 'Fiskal chek emas',
  },
  ru: {
    title: 'Квитанция об оплате',
    invoice: 'Счёт',
    date: 'Дата',
    cashier: 'Кассир',
    method: 'Способ оплаты',
    total: 'Итого',
    paid: 'Оплачено',
    balance: 'Остаток',
    currency: 'сум',
    notFiscal: 'Не является фискальным чеком',
  },
} as const;

/** 12 345 678 — grouped with spaces, from a bigint string (no float formatting). */
export const formatMoney = (v: bigint): string =>
  v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export interface ReceiptDoc {
  lang: Lang;
  timeZone: string;
  clinicName: string;
  invoiceNumber: string;
  cashierName: string;
  method: string;
  paidAt: Date;
  lines: { description: string; qty: number; total: bigint }[];
  total: bigint;
  amount: bigint;
  balance: bigint;
}

/**
 * Receipt for an 80 mm thermal printer (render with width 80 mm).
 * TODO(external-spec): fiscal receipt data (OFD / fiscal sign / QR) is not part of this document yet.
 */
export function renderReceiptHtml(d: ReceiptDoc): string {
  const t = L[d.lang];
  const when = new Intl.DateTimeFormat('ru-RU', {
    timeZone: d.timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d.paidAt);
  return `<!doctype html><html lang="${d.lang}"><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:9pt;width:72mm;margin:0;color:#000}
  h1{font-size:11pt;text-align:center;margin:0 0 2mm} .c{text-align:center}
  table{width:100%;border-collapse:collapse} td{padding:1px 0;vertical-align:top} td.r{text-align:right;white-space:nowrap}
  hr{border:0;border-top:1px dashed #000;margin:2mm 0}
</style></head><body>
<h1>${esc(d.clinicName)}</h1>
<p class="c">${esc(t.title)}</p>
<p>${esc(t.invoice)}: <b>${esc(d.invoiceNumber)}</b><br>${esc(t.date)}: ${esc(when)}<br>${esc(t.cashier)}: ${esc(d.cashierName)}<br>${esc(t.method)}: ${esc(d.method)}</p>
<hr>
<table>${d.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.description)} × ${String(l.qty)}</td><td class="r">${esc(formatMoney(l.total))}</td></tr>`,
    )
    .join('')}</table>
<hr>
<table>
<tr><td>${esc(t.total)}</td><td class="r">${esc(formatMoney(d.total))} ${esc(t.currency)}</td></tr>
<tr><td><b>${esc(t.paid)}</b></td><td class="r"><b>${esc(formatMoney(d.amount))} ${esc(t.currency)}</b></td></tr>
<tr><td>${esc(t.balance)}</td><td class="r">${esc(formatMoney(d.balance))} ${esc(t.currency)}</td></tr>
</table>
<hr><p class="c" style="font-size:7pt">${esc(t.notFiscal)}</p>
</body></html>`;
}
