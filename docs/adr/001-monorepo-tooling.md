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

## Phase 5 (DHP integration)

- **Worker design:** the outbox dispatcher (`apps/api/src/core/outbox.ts`) polls the `OutboxEvent` table with lease-based claiming (safe for several workers) and exponential backoff (30 s … 1 h, DEAD after `DHP_MAX_ATTEMPTS`). The process entry is `apps/api/src/worker.ts` (`pnpm --filter @shifo/api worker`). BullMQ/Redis is deferred to Phase 8 (delayed reminders/SMS); `apps/worker` keeps the BullMQ skeleton until then. Deviation from the brief ("outbox → BullMQ"): it keeps the guarantee testable without Redis.
- **Consent gate:** `encounter.signed` is pushed to DHP only with an active `DHP_SHARING` consent; otherwise the `DhpSyncRecord` is SKIPPED and nothing leaves the system.
- **FHIR:** all mapping lives in `packages/fhir` (pure functions). Profile URLs, identifier systems and the FHIR version are `TODO(external-spec)`; `MOCK_FHIR_CONFIG` carries neutral placeholders. `HttpDhpClient` sends no auth until the IG is read; `DHP_MODE=mock` is the default.
- Admin UI at `/integration` (status, counts, failed/dead records with retry, organization id).

## Phase 6-8 (Billing, Lab, Notifications)

- **Money:** BigInt in the DB and in all math (`modules/billing/money.ts`); strings on the wire. Percent discounts use basis points with half-up rounding. Catalog prices are resolved server-side, never trusted from the client.
- **Payments:** idempotent per `Idempotency-Key` (unique per clinic); invoices are protected from overpayment with a compare-and-set on `version` and a bounded retry. Cash requires an open shift in the invoice branch. Void is allowed only for unpaid invoices. Invoice numbers are assigned at issue time from an atomic sequence (gap-free). Click/Payme/Uzum and fiscal receipts are explicit stubs (`NOT_IMPLEMENTED`, TODO(external-spec)).
- **Lab:** results are entered by LAB/OWNER/ADMIN only; validation is four-eyes (validator must differ from the entering user) unless the clinic sets `settings.labSelfValidation`. Reference ranges are snapshotted on the order item. The result PDF exists only after validation. `lab.validated` goes through the outbox.
- **Notifications:** messages carry logistics only (no diagnoses, test names or values). SMS needs a granted SMS consent; Telegram needs the patient to link the bot with a one-time code. Reminders (24 h / 2 h) are created by a scanner, are idempotent via `dedupeKey` (includes the start time, so a reschedule creates new ones), are re-validated at send time, and are deferred outside 08:00-21:00 local time. Eskiz is a stub (TODO(external-spec)); `SMS_MODE=mock` is the default.
- **Test harness:** the remote DB drops idle connections, so the admin connection is closed after setup and cleanup reconnects with retries.

## Phase 9-10 and the staff UI

- **Reports** are computed in the API from payments/refunds/encounters/appointments (JS aggregation, range limited to 366 days) and exported as CSV with formula-injection protection and a UTF-8 BOM. Revenue by doctor attributes a payment to the doctor of the invoice's encounter.
- **Hardening:** append-only `AuditLog` trigger; row-level security as defense in depth (`DB_RLS=on`, restricted `shifo_app` role, `system()` on the owner role; tables are not FORCEd so the owner/migrator keeps access); Caddy security headers and automatic TLS; nightly `pg_dump` with verification and a documented restore drill; Socket.IO Redis adapter behind `REALTIME_REDIS=on`.
- **Docker/Compose** files are written but were **not run** (the Docker daemon could not be started on the development machine); the CI `docker-build` job is the first real verification.
- **Web UI:** session restored from the httpOnly refresh cookie (access token in memory only), permission-aware navigation, mutation responses update the cache (fewer round trips). The calendar books/reschedules through the slot picker; drag-and-drop rescheduling is not implemented.
- **E2E:** Playwright runs the real API + a separate production build (`.next-e2e`, so it never clashes with `next dev`) on an isolated schema that is seeded and dropped per run. Ports are configurable (`E2E_API_PORT`, `E2E_WEB_PORT`); on Windows 3920-4019 can be reserved by the OS.
