# DHP (Digital Healthcare Platform) — pinned specification versions

> The IGs are CI builds and change regularly. All FHIR logic lives in `packages/fhir` and
> `apps/api/src/modules/integrations/dhp` only. Re-check this file whenever the mappers change.

| Guide                             | Version (CI build) | URL                                                                 | Checked    |
| --------------------------------- | ------------------ | ------------------------------------------------------------------- | ---------- |
| UZ DHP Integrations IG            | 0.13.1             | https://build.fhir.org/ig/uzinfocom-org/digital-health-integration/ | 2026-11-24 |
| UZ DHP Core profiles IG (UZ Core) | 0.13.0             | https://build.fhir.org/ig/uzinfocom-org/digital-health-ig/          | 2026-11-24 |

Version history: https://dhp.uz/fhir/integrations/history.html , https://dhp.uz/fhir/core/history.html

## Not yet confirmed (TODO(external-spec))

Phase 0 only read the version stubs on build.fhir.org (the pages are redirect files).
Before Phase 5 the following must be read from the real IG content and recorded here:

- FHIR version of the IGs (brief says R5), build date / commit
- Authentication mechanism and base URLs (sandbox + production), certificates
- ICD-10 code system / ValueSet required by the profiles
- Consent profile rules for `DHP_SHARING`
- Exact profile list for Patient, Organization, Location, Encounter, Condition, Observation, ServiceRequest
