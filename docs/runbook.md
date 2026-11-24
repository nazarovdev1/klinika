# Runbook

## Processes

| Process | Command (compose service)                     | Notes                                                              |
| ------- | --------------------------------------------- | ------------------------------------------------------------------ |
| API     | `node dist/index.js` (`api`)                  | Express + Socket.IO, port 4000                                     |
| Worker  | `node dist/worker.js` (`worker`)              | outbox → DHP, reminders, SMS/Telegram. Safe to run several copies. |
| Web     | `node apps/web/server.js` (`web`)             | Next.js standalone, proxies `/api/*` to the API                    |
| Migrate | `prisma migrate deploy` (`migrate`, one-shot) | Runs before api/worker start                                       |
| Caddy   | `caddy` (`caddy`)                             | TLS termination + reverse proxy                                    |
| Backup  | `backup.sh` loop (`backup`)                   | Nightly `pg_dump`, 14 days kept                                    |

## Local development

1. `cp .env.example .env`; fill `JWT_ACCESS_SECRET`, `PII_KEYS`, `PII_HMAC_KEY` (generator commands are in the file).
2. `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d postgres redis mailpit mock-dhp`
3. `pnpm install && pnpm --filter @shifo/db exec prisma migrate deploy && pnpm dev`
4. First clinic: `pnpm --filter @shifo/api cli create-clinic ...` (prints a temporary owner password).
5. Worker (optional locally): `pnpm --filter @shifo/api worker`.

Tests need `DATABASE_URL` (each suite creates and drops its own schema, so a shared database is safe).
Chromium for PDF tests: `pnpm --filter @shifo/api exec playwright install chromium` (PDF tests skip without it).

## Production deploy (single host, Docker Compose)

1. Provision a host with a public IP and a DNS A record for the domain.
2. Create `.env` next to `infra/docker-compose.yml` (see `.env.example`): strong `POSTGRES_PASSWORD`,
   `JWT_ACCESS_SECRET`, fresh `PII_KEYS`/`PII_HMAC_KEY` (**back these up separately: losing them makes PINFL/passport
   unrecoverable**), `WEB_ORIGIN=https://<domain>`, `SITE_ADDRESS=<domain>`, `COOKIE_SECURE=true`.
3. `docker compose -f infra/docker-compose.yml up -d --build`. Caddy obtains the certificate automatically
   (ports 80/443 must be reachable).
4. Create the first clinic with the CLI (`docker compose exec api node dist/cli.js create-clinic ...`).
5. Smoke test: `GET https://<domain>/api/v1/health` returns `{status:"ok"}`; log in; open `/ru/patients`.

### Hardening switch: row-level security

1. Create the roles with `infra/db/roles.sql` (owner for migrations/`system()`, restricted `shifo_app` for tenant queries).
2. Run migrations as the owner, then `psql -f infra/db/rls.sql` as the owner (idempotent; regenerate with
   `pnpm --filter @shifo/db rls:generate` when tenant tables are added).
3. Set `DATABASE_URL` to the `shifo_app` URL, `DATABASE_SYSTEM_URL` to the owner URL, `DB_RLS=on`, restart api and worker.

`forTenant` remains the primary guard (it injects `clinicId`); RLS means a forgotten filter still returns no foreign rows.
The audit table is append-only at the database level (trigger) and the app role has no UPDATE/DELETE on it.

## Backups and restore drill

- Nightly: the `backup` service writes `/backups/shifo-<UTC stamp>.dump` (custom format), verifies it with
  `pg_restore --list`, prunes dumps older than `BACKUP_KEEP_DAYS`. **Put the `backups` volume on storage that is not
  the database disk**, and/or set `BACKUP_RSYNC_TARGET` for an off-site copy.
- Also back up: the `.env` secrets (`PII_KEYS`, `PII_HMAC_KEY`) — encrypted, separate from the dumps.
- **Restore drill (do this quarterly, and after any schema-changing release):**
  1. `docker compose exec backup sh /scripts/restore.sh /backups/<file>.dump shifo_restore_check`
  2. Check the printed counts (clinics, patients, applied migrations) against production.
  3. `docker compose exec postgres dropdb -U shifo shifo_restore_check`
  4. Record the date and result in your operations log.
- Disaster recovery: new host → deploy as above with the same `.env` → `pg_restore --clean --no-owner -d shifo <dump>`
  into an empty database → `docker compose up -d`. Expected loss: up to 24 h (shorten the interval, or add WAL archiving,
  if that is not acceptable).

## Incidents

| Symptom                      | Look at                                                            | Typical fix                                                                |
| ---------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| DHP sync stuck / many FAILED | Admin UI → Integration; `DhpSyncRecord.lastError`                  | Fix cause, press **Retry** (re-queues the outbox event)                    |
| SMS/Telegram not delivered   | `Notification.status/lastError` (`GET /api/v1/notifications`)      | Check provider credentials; DEAD rows are not retried                      |
| Users locked out             | `User.lockedUntil`; logs `ACCOUNT_LOCKED`                          | Wait for the lock, or reset the password as OWNER                          |
| Queue screen frozen          | Socket.IO connectivity; revoke/regenerate the branch screen token  | The screen falls back to polling every few seconds                         |
| Slow patient search          | `EXPLAIN` on the query; `pg_trgm` indexes present?                 | `ANALYZE "Patient"`; check indexes from migration `patient_search_indexes` |
| Worker not processing        | `docker compose logs worker`; `OutboxEvent` PENDING with old dates | Restart worker; events are leased and re-delivered automatically           |

Logs are JSON (pino) with a request id; PINFL, passport, phone and clinical text are never logged.

## Load testing

`k6 run -e BASE_URL=... -e LOGIN=... -e PASSWORD=... infra/k6/load.js` (thresholds: search p95 < 300 ms, errors < 1 %).
Run it against a production-like host (the 300 ms target is not measurable across a WAN).

## Business / legal TODOs

- TODO: legal review of data-localization obligations for patient data. Default hosting is an Uzbekistan
  data center; this is a business decision and is intentionally not enforced in code.
- TODO(external-spec): DHP authentication, Eskiz, Click/Payme/Uzum and fiscal receipts (see `docs/dhp-version.md`).
