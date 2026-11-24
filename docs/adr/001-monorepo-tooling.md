# ADR 001 — Monorepo tooling and Phase 0 deviations

Status: accepted (2026-11-24)

## Decisions

- **pnpm 12 + Turborepo.** pnpm 12.18 is what is installed on the dev machine; versions are pinned exactly.
- **TypeScript 6.0.3, not 7.x.** `typescript-eslint` 8.73 supports `<6.1.0`; TS 7 makes linting fail.
  Revisit when typescript-eslint supports it.
- **Prisma / `packages/db` deferred to Phase 1.** Phase 0 has no database access; `/health` has no DB check yet.
- **Web routing.** The brief's `(auth)/login` and `(app)/[locale]` groups are placed under `[locale]`
  (`app/[locale]/(auth)/login`, `app/[locale]/(app)`) so next-intl handles every staff page uniformly.
  `screen/[token]` stays public and locale-less (excluded in the middleware matcher).
- **next-intl `requestLocale` / `setRequestLocale`** are marked deprecated in favour of `next/root-params`,
  which Next 15 does not provide. Lint exceptions are annotated in place.
- **shadcn/ui** is set up manually (`components.json`, `cn`, `Button`) rather than via the interactive CLI;
  components are added with the CLI from Phase 1 on.
- **Docker** was not available on the dev machine in Phase 0; Dockerfiles and compose files are unverified
  locally. CI runs `docker compose config`; a first real `compose up` is still to be done.

## Phase 1 decisions

- **Prisma 7** with the `prisma-client` generator (output `packages/db/src/generated`, git-ignored, generated on build)
  and `@prisma/adapter-pg`. The datasource URL lives in `prisma.config.ts`.
- **Tests use real Postgres without Docker**: each suite creates an isolated schema (`t_<random>`) in the database
  from `DATABASE_URL`, applies the migrations and drops it afterwards (`apps/api/src/test/harness.ts`).
  Testcontainers (brief section 9) is replaced until Docker is available; CI provides a Postgres service.
  Suites skip when `DATABASE_URL` is unset.
- **Auth module may use the unscoped client** (`db.system()`): login/refresh occur before the tenant is known.
  An ESLint rule forbids `.system()` in every other module.
- **OpenAPI** is served as JSON at `GET /api/docs` and currently describes health, auth and staff.

## Phase 2 decisions

- **PINFL / passport**: AES-256-GCM (`<keyId>.<iv>.<tag>.<ct>`), keys from `PII_KEYS`, active key `PII_ACTIVE_KEY_ID`
  (rotation = add a key and switch the active id; old ciphertexts stay readable). Exact-match search and
  uniqueness use an HMAC-SHA256 column (`PII_HMAC_KEY`). Audit payloads only record `hasPinfl`/`hasPassport`.
- **Patient search**: key lookups (PINFL/passport hash, phone, birth date) use btree indexes; name and
  partial-phone search use `pg_trgm` GIN indexes (`public.gin_trgm_ops`, created in the migration).
- **Duplicates**: same PINFL -> hard `409 DUPLICATE_PATIENT`; same (name, birthDate, phone) -> `409` until the client
  resends with `confirmDuplicate=true`.
- **Web API access** goes through a Next.js rewrite (`/api/*` -> `API_INTERNAL_URL`) so the SameSite=Strict
  refresh cookie is same-origin.

## Phase 3 decisions

- **Double booking**: the exclusion constraint uses `tsrange("startsAt","endsAt")` (not `tstzrange`): Prisma stores
  UTC `timestamp` columns and `tstzrange(timestamp, timestamp)` is not IMMUTABLE. All instants are UTC, so the
  semantics are identical. The constraint is created in raw SQL in the `*_scheduling` migration (`btree_gist`).
- **doctorId** in schedules/appointments/tickets is the doctor's `User.id` (role DOCTOR), not `DoctorProfile.id`.
- **Queue numbers**: atomic `NumberSequence` upsert (`key='queue'`, per branch per local day).
- **Prisma interactive transactions** default to 10 s max wait / 30 s timeout (`createDb`), because concurrent writers
  wait on row locks and the dev database is remote (~230 ms RTT).
- **Public screen**: `GET /api/v1/screen/:token` and the `/screen` Socket.IO namespace are addressed by the revocable
  branch screen token (lives in `core/screen.ts`: the token identifies the tenant). No patient data is exposed.
- Socket.IO Redis adapter is deferred to Phase 10 (needs Redis; marked TODO in `core/realtime.ts`).
- Appointment status changes do not yet cancel/reschedule reminders: marked `TODO(phase-8)`.
- The calendar UI (drag to reschedule) is not built yet; the API supports reschedule with conflict check.

## Phase 4 (Encounters)

- ICD-10 ships as a **starter set** (~100 outpatient codes, uz/ru) in `seed/icd10.ts`; the official edition/ValueSet is TODO(external-spec).
- New permission `vitals:write` (DOCTOR, NURSE) so nurses can record vitals without clinical write access.
- Doctors read their own encounters plus any SIGNED one (read-only history); only the attending doctor edits. Signed encounters are immutable (409); corrections are addenda.
- Audit payloads never contain clinical text. PDFs are rendered by Playwright Chromium with network blocked; the QR links to a public, signature-checked verify endpoint that returns no patient data.
- Deferred: Attachment upload endpoints (model exists), doctor "Today" web screen.
