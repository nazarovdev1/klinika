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
