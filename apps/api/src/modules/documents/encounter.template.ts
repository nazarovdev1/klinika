export type Lang = 'uz' | 'ru';

const L = {
  uz: {
    title: 'Tibbiy ko‘rik xulosasi',
    patient: 'Bemor',
    birthDate: 'Tug‘ilgan sana',
    doctor: 'Shifokor',
    date: 'Sana',
    complaints: 'Shikoyatlar',
    anamnesis: 'Anamnez',
    objective: 'Ob’ektiv holat',
    vitals: 'Hayotiy ko‘rsatkichlar',
    diagnoses: 'Tashxislar',
    primary: 'Asosiy',
    secondary: 'Qo‘shimcha',
    complication: 'Asorat',
    prescriptions: 'Dori-darmonlar',
    conclusion: 'Xulosa',
    recommendations: 'Tavsiyalar',
    addenda: 'Qo‘shimchalar',
    verify: 'Hujjatni tekshirish',
    temp: 'Harorat',
    bp: 'Qon bosimi',
    pulse: 'Puls',
    spo2: 'SpO₂',
    weight: 'Vazn',
    height: 'Bo‘y',
    days: 'kun',
  },
  ru: {
    title: 'Заключение по результатам приёма',
    patient: 'Пациент',
    birthDate: 'Дата рождения',
    doctor: 'Врач',
    date: 'Дата',
    complaints: 'Жалобы',
    anamnesis: 'Анамнез',
    objective: 'Объективный статус',
    vitals: 'Витальные показатели',
    diagnoses: 'Диагнозы',
    primary: 'Основной',
    secondary: 'Сопутствующий',
    complication: 'Осложнение',
    prescriptions: 'Назначения',
    conclusion: 'Заключение',
    recommendations: 'Рекомендации',
    addenda: 'Дополнения',
    verify: 'Проверка документа',
    temp: 'Температура',
    bp: 'Давление',
    pulse: 'Пульс',
    spo2: 'SpO₂',
    weight: 'Вес',
    height: 'Рост',
    days: 'дн.',
  },
} as const;

export const esc = (v: string | number | null | undefined): string =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const ddmmyyyy = (d: Date, tz: string): string =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

export interface EncounterDoc {
  lang: Lang;
  timeZone: string;
  clinic: {
    name: string;
    address?: string | null;
    phone?: string | null;
    licenseNumber?: string | null;
  };
  patient: { fullName: string; birthDate: Date };
  doctor: { fullName: string; specialty?: string | null };
  signedAt: Date | null;
  startedAt: Date;
  complaints?: string | null;
  anamnesis?: string | null;
  objectiveStatus?: string | null;
  conclusion?: string | null;
  recommendations?: string | null;
  vitals?: {
    temperature: number | null;
    systolic: number | null;
    diastolic: number | null;
    pulse: number | null;
    spo2: number | null;
    weightKg: number | null;
    heightCm: number | null;
  } | null;
  diagnoses: { code: string; title: string; type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION' }[];
  prescriptions: {
    drugName: string;
    form: string | null;
    dosage: string | null;
    frequency: string | null;
    durationDays: number | null;
    instructions: string | null;
  }[];
  addenda: { text: string; createdAt: Date }[];
  qrDataUrl: string;
  verifyUrl: string;
}

/** Self-contained HTML (inline CSS, no external requests) for the visit summary. */
export function renderEncounterHtml(d: EncounterDoc): string {
  const t = L[d.lang];
  const section = (title: string, body: string | null | undefined): string =>
    body?.trim()
      ? `<section><h2>${esc(title)}</h2><p>${esc(body).replaceAll('\n', '<br>')}</p></section>`
      : '';
  const v = d.vitals;
  const vitals = v
    ? [
        v.temperature != null && `${t.temp}: ${v.temperature} °C`,
        v.systolic != null && v.diastolic != null && `${t.bp}: ${v.systolic}/${v.diastolic}`,
        v.pulse != null && `${t.pulse}: ${v.pulse}`,
        v.spo2 != null && `${t.spo2}: ${v.spo2}%`,
        v.weightKg != null && `${t.weight}: ${v.weightKg} kg`,
        v.heightCm != null && `${t.height}: ${v.heightCm} cm`,
      ].filter((x): x is string => typeof x === 'string')
    : [];
  const typeLabel = { PRIMARY: t.primary, SECONDARY: t.secondary, COMPLICATION: t.complication };

  return `<!doctype html>
<html lang="${d.lang}"><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;color:#111;line-height:1.4}
  header{border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:12px}
  header h1{margin:0;font-size:16pt} header p{margin:2px 0;color:#444;font-size:10pt}
  h2{font-size:12pt;margin:14px 0 4px;color:#0f766e}
  table{border-collapse:collapse;width:100%} td,th{border:1px solid #bbb;padding:4px 6px;text-align:left;font-size:11pt}
  .meta td{border:none;padding:2px 8px 2px 0}
  footer{margin-top:24px;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:#555}
  footer img{width:90px;height:90px}
</style></head><body>
<header>
  <h1>${esc(d.clinic.name)}</h1>
  <p>${esc([d.clinic.address, d.clinic.phone, d.clinic.licenseNumber && `Lic. ${d.clinic.licenseNumber}`].filter(Boolean).join(' · '))}</p>
</header>
<h2 style="font-size:14pt;color:#111">${esc(t.title)}</h2>
<table class="meta">
  <tr><td><b>${esc(t.patient)}:</b> ${esc(d.patient.fullName)}</td><td><b>${esc(t.birthDate)}:</b> ${esc(ddmmyyyy(d.patient.birthDate, 'UTC'))}</td></tr>
  <tr><td><b>${esc(t.doctor)}:</b> ${esc(d.doctor.fullName)}${d.doctor.specialty ? ` (${esc(d.doctor.specialty)})` : ''}</td><td><b>${esc(t.date)}:</b> ${esc(ddmmyyyy(d.signedAt ?? d.startedAt, d.timeZone))}</td></tr>
</table>
${section(t.complaints, d.complaints)}${section(t.anamnesis, d.anamnesis)}${section(t.objective, d.objectiveStatus)}
${vitals.length ? `<section><h2>${esc(t.vitals)}</h2><p>${vitals.map((x) => esc(x)).join(' &nbsp;|&nbsp; ')}</p></section>` : ''}
${
  d.diagnoses.length
    ? `<section><h2>${esc(t.diagnoses)}</h2><table>${d.diagnoses
        .map(
          (x) =>
            `<tr><td style="width:70px"><b>${esc(x.code)}</b></td><td>${esc(x.title)}</td><td style="width:110px">${esc(typeLabel[x.type])}</td></tr>`,
        )
        .join('')}</table></section>`
    : ''
}
${
  d.prescriptions.length
    ? `<section><h2>${esc(t.prescriptions)}</h2><table>${d.prescriptions
        .map(
          (p) =>
            `<tr><td><b>${esc(p.drugName)}</b>${p.form ? ` (${esc(p.form)})` : ''}</td><td>${esc([p.dosage, p.frequency, p.durationDays != null && `${p.durationDays} ${t.days}`].filter(Boolean).join(', '))}</td><td>${esc(p.instructions)}</td></tr>`,
        )
        .join('')}</table></section>`
    : ''
}
${section(t.conclusion, d.conclusion)}${section(t.recommendations, d.recommendations)}
${
  d.addenda.length
    ? `<section><h2>${esc(t.addenda)}</h2>${d.addenda
        .map((a) => `<p><i>${esc(ddmmyyyy(a.createdAt, d.timeZone))}</i> — ${esc(a.text)}</p>`)
        .join('')}</section>`
    : ''
}
<footer>
  <div>${esc(t.verify)}:<br>${esc(d.verifyUrl)}</div>
  <img alt="QR" src="${d.qrDataUrl}">
</footer>
</body></html>`;
}
