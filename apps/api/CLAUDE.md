# @penka/api — public API

## Scope

Player-facing Fastify API: auth, competition catalog, penkas, and game endpoints
(picks, standings). Reads Mongo (source of truth) and Redis (read models, rate
limiting).

## Commands

- `pnpm dev --filter @penka/api` — run on port 3000 (override with `PORT`)
- `pnpm test --filter @penka/api` — unit tests (`src/**/*.test.ts`)
- `pnpm test:integration --filter @penka/api` — integration tests (`test/**/*.int.test.ts`, `fastify.inject`)
- `pnpm lint --filter @penka/api`

## Must NOT

- **Never compute game rules inline** — pick validation, elimination, resolution all come
  from `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas come from
  `@penka/contracts`, and every route declares its schemas.
- Never return an error code that is not in `ErrorCodes` from `@penka/contracts`.
- Never expose admin/operator operations (results, close, resolve) — those belong to
  `@penka/backoffice-api`.
