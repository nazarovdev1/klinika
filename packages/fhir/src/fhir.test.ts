import { describe, expect, it } from 'vitest';
import { encounterBundle, MOCK_FHIR_CONFIG, patientToFhir } from './index.js';

describe('fhir mappers', () => {
  it('maps a patient with identifiers', () => {
    const r = patientToFhir(
      {
        id: 'p1',
        lastName: 'Test',
        firstName: 'Ali',
        middleName: 'Valiyevich',
        birthDate: new Date('1990-05-01T00:00:00Z'),
        sex: 'MALE',
        phone: '+998900000000',
        pinfl: '12345678901234',
      },
      MOCK_FHIR_CONFIG,
    );
    expect(r).toMatchObject({
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1990-05-01',
      identifier: [{ value: '12345678901234' }],
    });
    expect((r.name as { given: string[] }[])[0]?.given).toEqual(['Ali', 'Valiyevich']);
  });

  it('builds an encounter bundle with conditions and observations', () => {
    const b = encounterBundle(
      {
        id: 'e1',
        patientId: 'p1',
        doctorId: 'd1',
        startedAt: new Date('2030-01-01T05:00:00Z'),
        signedAt: new Date('2030-01-01T05:30:00Z'),
        diagnoses: [{ code: 'J06.9', title: 'ARVI', type: 'PRIMARY' }],
        vitals: { temperature: 36.6, systolic: 120, diastolic: 80, pulse: null, spo2: 98 },
      },
      MOCK_FHIR_CONFIG,
    );
    const types = (b.entry as { resource: { resourceType: string } }[]).map(
      (x) => x.resource.resourceType,
    );
    expect(types).toEqual([
      'Encounter',
      'Condition',
      'Observation',
      'Observation',
      'Observation',
      'Observation',
    ]);
    expect(b.type).toBe('transaction');
  });

  it('adds meta.profile only when configured', () => {
    const cfg = { ...MOCK_FHIR_CONFIG, profiles: { Patient: 'urn:test:profile' } };
    const r = patientToFhir(
      {
        id: 'p',
        lastName: 'A',
        firstName: 'B',
        birthDate: new Date('2000-01-01T00:00:00Z'),
        sex: 'FEMALE',
        phone: '1',
      },
      cfg,
    );
    expect(r.meta).toEqual({ profile: ['urn:test:profile'] });
  });
});
