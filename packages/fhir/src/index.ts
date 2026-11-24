/**
 * FHIR mappers for the UZ DHP integration.
 *
 * Pure functions: domain data in, FHIR resources out. No I/O, no logging (inputs contain PII).
 * TODO(external-spec): profile canonical URLs, required identifier systems, code systems and the FHIR
 * version are NOT confirmed (see docs/dhp-version.md). Everything marked TODO below is a placeholder
 * and must be replaced from the pinned IG before any real exchange. Mappers stay free of guessed URLs:
 * system URIs come from `FhirConfig`, which production must fill from the IG.
 */

export interface FhirConfig {
  /** TODO(external-spec): identifier system for PINFL. */
  pinflSystem: string;
  /** TODO(external-spec): identifier system for passports. */
  passportSystem: string;
  /** TODO(external-spec): ICD-10 code system URI required by the profiles. */
  icd10System: string;
  /** TODO(external-spec): profile canonical URLs per resource type (empty = no meta.profile). */
  profiles: Partial<Record<ResourceType, string>>;
}

export type ResourceType =
  'Patient' | 'Organization' | 'Location' | 'Encounter' | 'Condition' | 'Observation';

/** Neutral placeholders so the mock flow works; NOT real DHP values. */
export const MOCK_FHIR_CONFIG: FhirConfig = {
  pinflSystem: 'urn:shifo:mock:pinfl',
  passportSystem: 'urn:shifo:mock:passport',
  icd10System: 'http://hl7.org/fhir/sid/icd-10',
  profiles: {},
};

export interface FhirResource {
  resourceType: ResourceType | 'Bundle';
  id?: string;
  [key: string]: unknown;
}

const meta = (cfg: FhirConfig, t: ResourceType) =>
  cfg.profiles[t] ? { meta: { profile: [cfg.profiles[t]] } } : {};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export interface PatientInput {
  id: string;
  lastName: string;
  firstName: string;
  middleName?: string | null;
  birthDate: Date;
  sex: 'MALE' | 'FEMALE';
  phone: string;
  pinfl?: string | null;
  passport?: string | null;
  address?: string | null;
}

export function patientToFhir(p: PatientInput, cfg: FhirConfig): FhirResource {
  const identifier: object[] = [];
  if (p.pinfl) identifier.push({ system: cfg.pinflSystem, value: p.pinfl });
  if (p.passport) identifier.push({ system: cfg.passportSystem, value: p.passport });
  return {
    resourceType: 'Patient',
    id: p.id,
    ...meta(cfg, 'Patient'),
    identifier,
    name: [
      {
        use: 'official',
        family: p.lastName,
        given: [p.firstName, ...(p.middleName ? [p.middleName] : [])],
      },
    ],
    gender: p.sex === 'MALE' ? 'male' : 'female',
    birthDate: isoDate(p.birthDate),
    telecom: [{ system: 'phone', value: p.phone }],
    ...(p.address ? { address: [{ text: p.address }] } : {}),
  };
}

export interface EncounterInput {
  id: string;
  patientId: string;
  doctorId: string;
  /** Organization/Location ids assigned by DHP, if registered. */
  organizationRef?: string | null;
  locationRef?: string | null;
  startedAt: Date;
  signedAt: Date;
  diagnoses: { code: string; title: string; type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION' }[];
  vitals?: {
    temperature: number | null;
    systolic: number | null;
    diastolic: number | null;
    pulse: number | null;
    spo2: number | null;
  } | null;
}

/** Builds a transaction Bundle: Encounter + Conditions + vital-sign Observations (urn:uuid references). */
export function encounterBundle(e: EncounterInput, cfg: FhirConfig): FhirResource {
  const patientRef = { reference: `Patient/${e.patientId}` };
  const encRef = `urn:uuid:${e.id}`;
  const entries: { fullUrl: string; resource: FhirResource }[] = [];

  entries.push({
    fullUrl: encRef,
    resource: {
      resourceType: 'Encounter',
      ...meta(cfg, 'Encounter'),
      status: 'completed',
      subject: patientRef,
      actualPeriod: { start: e.startedAt.toISOString(), end: e.signedAt.toISOString() },
      ...(e.organizationRef ? { serviceProvider: { reference: e.organizationRef } } : {}),
      ...(e.locationRef ? { location: [{ location: { reference: e.locationRef } }] } : {}),
    },
  });

  e.diagnoses.forEach((d, i) => {
    entries.push({
      fullUrl: `urn:uuid:${e.id}-dx-${String(i)}`,
      resource: {
        resourceType: 'Condition',
        ...meta(cfg, 'Condition'),
        clinicalStatus: { coding: [{ code: 'active' }] },
        category: [
          {
            coding: [{ code: d.type === 'PRIMARY' ? 'encounter-diagnosis' : 'problem-list-item' }],
          },
        ],
        code: { coding: [{ system: cfg.icd10System, code: d.code, display: d.title }] },
        subject: patientRef,
        encounter: { reference: encRef },
      },
    });
  });

  const v = e.vitals;
  const obs = (code: string, display: string, value: number | null, unit: string, i: number) => {
    if (value == null) return;
    entries.push({
      fullUrl: `urn:uuid:${e.id}-obs-${String(i)}`,
      resource: {
        resourceType: 'Observation',
        ...meta(cfg, 'Observation'),
        status: 'final',
        category: [{ coding: [{ code: 'vital-signs' }] }],
        // LOINC codes are public and stable; the DHP profile requirements remain TODO(external-spec).
        code: { coding: [{ system: 'http://loinc.org', code, display }] },
        subject: patientRef,
        encounter: { reference: encRef },
        effectiveDateTime: e.startedAt.toISOString(),
        valueQuantity: { value, unit },
      },
    });
  };
  if (v) {
    obs('8310-5', 'Body temperature', v.temperature, 'Cel', 0);
    obs('8480-6', 'Systolic blood pressure', v.systolic, 'mm[Hg]', 1);
    obs('8462-4', 'Diastolic blood pressure', v.diastolic, 'mm[Hg]', 2);
    obs('8867-4', 'Heart rate', v.pulse, '/min', 3);
    obs('59408-5', 'Oxygen saturation', v.spo2, '%', 4);
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries.map((x) => ({
      fullUrl: x.fullUrl,
      resource: x.resource,
      request: { method: 'POST', url: x.resource.resourceType },
    })),
  };
}
