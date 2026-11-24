import { describe, expect, it } from 'vitest';
import { esc, renderEncounterHtml, type EncounterDoc } from '../encounter.template.js';

const doc = (lang: 'uz' | 'ru'): EncounterDoc => ({
  lang,
  timeZone: 'Asia/Tashkent',
  clinic: { name: 'Shifo <Klinika>', address: 'Toshkent', phone: '+998712000000' },
  patient: { fullName: 'Karimov Aziz', birthDate: new Date('1985-02-03T00:00:00Z') },
  doctor: { fullName: 'Dr. Ali', specialty: 'Terapevt' },
  signedAt: new Date('2030-03-12T05:00:00Z'),
  startedAt: new Date('2030-03-12T04:30:00Z'),
  complaints: 'Bosh og‘rig‘i\n3 kun',
  vitals: {
    temperature: 36.8,
    systolic: 120,
    diastolic: 80,
    pulse: 72,
    spo2: 98,
    weightKg: null,
    heightCm: null,
  },
  diagnoses: [{ code: 'J06.9', title: 'ARVI', type: 'PRIMARY' }],
  prescriptions: [
    {
      drugName: 'Paratsetamol',
      form: null,
      dosage: '500 mg',
      frequency: '3 mahal',
      durationDays: 5,
      instructions: null,
    },
  ],
  addenda: [],
  qrDataUrl: 'data:image/png;base64,AAAA',
  verifyUrl: 'https://example.test/verify/1',
});

describe('encounter template', () => {
  it('renders Uzbek labels and escapes user input', () => {
    const html = renderEncounterHtml(doc('uz'));
    expect(html).toContain('Tibbiy ko‘rik xulosasi');
    expect(html).toContain('Shikoyatlar');
    expect(html).toContain('Shifo &lt;Klinika&gt;');
    expect(html).toContain('03.02.1985');
    expect(html).toContain('J06.9');
  });

  it('renders Russian labels', () => {
    const html = renderEncounterHtml(doc('ru'));
    expect(html).toContain('Заключение по результатам приёма');
    expect(html).toContain('Жалобы');
    expect(html).toContain('lang="ru"');
  });

  it('escapes HTML', () => {
    expect(esc('<script>"x"&</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;');
  });
});
