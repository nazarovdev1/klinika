# Shifo — clinic management SaaS for Uzbekistan (MVP)

Multi-tenant clinic management: patients, scheduling and live queue, encounters (ICD-10, vitals,
prescriptions, signed visit PDF), DHP/FHIR sync, billing (invoices, idempotent payments, refunds, cash shifts),
laboratory, SMS/Telegram notifications, reports with CSV export. Uzbek (default) and Russian UI.

Stack: TypeScript (strict), Node 22, pnpm + Turborepo, Express 5, Zod + OpenAPI 3.1 (`/api/docs`), PostgreSQL 16 +
Prisma 7, Socket.IO, Next.js 15 + React 19 + TanStack Query + Tailwind v4 + next-intl, Playwright (PDF + E2E).

```
apps/api      Express modular monolith (modules/*, core/*), CLI, outbox worker
apps/web      Next.js staff UI + public queue screen
apps/worker   BullMQ skeleton (deferred, see docs/adr)
packages/contracts   Zod schemas, error codes, RBAC permissions (shared by api and web)
packages/db          Prisma schema/migrations, tenant-scoping client, RLS support
packages/fhir        FHIR mappers for the DHP integration
infra/        Dockerfiles, compose, Caddy, backup/restore scripts, k6, DB roles + RLS
docs/         runbook, ADRs, RBAC matrix, DHP spec notes
```

## Quick start

```bash
cp .env.example .env            # fill JWT_ACCESS_SECRET, PII_KEYS, PII_HMAC_KEY (generators are in the file)
pnpm install
pnpm --filter @shifo/db exec prisma migrate deploy
pnpm --filter @shifo/api cli create-clinic --name "My Clinic" --owner-login owner --owner-phone +998901234567
pnpm db:seed                    # optional: synthetic demo clinic (8 doctors, 60 services, 3 months of data)
pnpm dev                        # api + web (+ worker with `pnpm --filter @shifo/api worker`)
```

Demo logins after `pnpm db:seed`: `sd.owner`, `sd.registrar`, `sd.doctor1` … `sd.cashier`, `sd.lab` — password `Demo-12345`
(synthetic data only).

## Checks

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @shifo/web e2e:build && pnpm --filter @shifo/web e2e     # Playwright, isolated DB schema
```

Integration tests create and drop an isolated Postgres schema per suite (`DATABASE_URL` required; suites skip
without it). PDF tests need Chromium: `pnpm --filter @shifo/api exec playwright install chromium`.

## Rules the code enforces

- Tenant isolation: every query goes through `forTenant(clinicId)`; optional Postgres row-level security behind it.
- RBAC from one table (`docs/rbac-matrix.md`), audit trail written in the same transaction and append-only in the DB.
- Money is BigInt everywhere and a string on the wire. PINFL/passport are AES-256-GCM encrypted and never logged.
- Nothing about external systems is invented: DHP auth/profiles, Eskiz, Click/Payme/Uzum and fiscal receipts are
  explicit `TODO(external-spec)` stubs (see `docs/dhp-version.md`).

Operations (deploy, backups and restore drill, RLS switch, incidents): `docs/runbook.md`.
