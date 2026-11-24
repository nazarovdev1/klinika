# Runbook

## Local development

1. `cp .env.example .env` and fill `JWT_ACCESS_SECRET`.
2. `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d postgres redis mailpit mock-dhp`
3. `pnpm install && pnpm dev`

## Backups (Phase 10)

Nightly `pg_dump` to separate storage plus a documented restore drill — to be written in Phase 10.

## TODO (business / legal)

- TODO: legal review of data-localization obligations for patient data. Default hosting is an Uzbekistan
  data center; this is a business decision and is intentionally not enforced in code.
