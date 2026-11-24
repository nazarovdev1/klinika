export type Lang = 'uz' | 'ru';

export const TEMPLATES = [
  'appointment.reminder_24h',
  'appointment.reminder_2h',
  'lab.ready',
] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

type Params = Record<string, string>;

const T: Record<TemplateKey, Record<Lang, (p: Params) => string>> = {
  'appointment.reminder_24h': {
    uz: (p) =>
      `Eslatma: ertaga, ${p.date ?? ''} soat ${p.time ?? ''} da ${p.clinic ?? ''} klinikasida qabulingiz bor.`,
    ru: (p) =>
      `Напоминание: завтра, ${p.date ?? ''} в ${p.time ?? ''} у вас приём в клинике ${p.clinic ?? ''}.`,
  },
  'appointment.reminder_2h': {
    uz: (p) =>
      `Eslatma: bugun soat ${p.time ?? ''} da ${p.clinic ?? ''} klinikasida qabulingiz bor.`,
    ru: (p) => `Напоминание: сегодня в ${p.time ?? ''} у вас приём в клинике ${p.clinic ?? ''}.`,
  },
  'lab.ready': {
    uz: (p) => `${p.clinic ?? ''}: tahlil natijalaringiz tayyor. Klinikaga murojaat qiling.`,
    ru: (p) => `${p.clinic ?? ''}: результаты ваших анализов готовы. Обратитесь в клинику.`,
  },
};

/** Messages never contain diagnoses, test names or results: only logistics. */
export function renderMessage(key: TemplateKey, lang: Lang, params: Params): string {
  return T[key][lang](params);
}

export const isTemplateKey = (k: string): k is TemplateKey =>
  (TEMPLATES as readonly string[]).includes(k);
