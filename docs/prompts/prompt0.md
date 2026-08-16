You are bootstrapping a new monorepo called `penka-survivor`. It is the MVP of a
"Survivor" football prediction game that plugs into Penka (a B2B fan-engagement
platform). Build the skeleton only — no business logic yet.

## Stack decisions (do not change them)
- pnpm workspaces + Turborepo
- TypeScript everywhere, strict mode
- Backends: Fastify. Frontends: Vue 3 + Vite + Pinia
- MongoDB (source of truth), Redis (read models, rate limiting), RabbitMQ (async resolution)
- Tests: Vitest everywhere; integration tests use Testcontainers
- Lint: ESLint + Prettier, shared config

## Repository layout
penka-survivor/
├── apps/
│   ├── web/               # player app (Vue 3 + TS) — placeholder
│   ├── backoffice-web/    # operator app (Vue 3 + TS) — placeholder
│   ├── api/               # public API (Fastify): auth, catalog, penkas, game
│   ├── backoffice-api/    # admin API (Fastify): results, close, resolve → RabbitMQ
│   └── workers/           # RabbitMQ consumers: matchday resolution
├── packages/
│   ├── game-engine/       # pure game rules, zero runtime deps
│   ├── contracts/         # shared types, TypeBox schemas, canonical error codes
│   └── config/            # shared tsconfig, eslint, vitest presets
├── infra/
│   └── docker-compose.yml # mongo:7, redis:7, rabbitmq:3-management
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md

Package names: @penka/web, @penka/backoffice-web, @penka/api, @penka/backoffice-api,
@penka/workers, @penka/game-engine, @penka/contracts, @penka/config.

## Tasks
1. Initialize pnpm workspace + Turborepo with pipelines: build, dev, test, test:integration, lint.
2. Every app/package: package.json, tsconfig extending packages/config, one placeholder
   Vitest test that passes, and for the two Fastify apps a `GET /health` endpoint with a
   passing integration test using fastify.inject (no containers needed yet).
3. infra/docker-compose.yml with mongo, redis, rabbitmq (management UI on 15672),
   healthchecks on all three, named volumes.
4. Root scripts:
   - `pnpm infra:up` / `pnpm infra:down`
   - `pnpm dev` → turbo run dev (all apps)
   - `pnpm dev --filter @penka/api` must work per app
   - `pnpm test`, `pnpm test:integration`, `pnpm lint`
5. GitHub Actions workflow: lint + unit tests on every push; integration tests job
   with docker available.
6. Write CLAUDE.md at the root AND one per app/package. The root CLAUDE.md must contain:
   - Project purpose (one paragraph) and the layout above
   - Development methodology: **strict TDD** — write failing tests first, implement to
     green, refactor. Never weaken or delete a test to make it pass; if a test seems
     wrong, stop and flag it in the response instead.
   - Command reference (the scripts above)
   - Conventions: TypeBox schemas from @penka/contracts are the single source of truth
     for API request/response types; canonical error codes only; no business rules
     outside @penka/game-engine.
   Each app's CLAUDE.md adds its scope, its commands, and what it must NOT do
   (e.g. workers: "never expose HTTP"; api: "never compute game rules inline").

## Verification
- `pnpm install && pnpm lint && pnpm test` → all green
- `pnpm infra:up` → three containers healthy (`docker compose ps` shows healthy)
- `pnpm dev --filter @penka/api` → GET http://localhost:3000/health returns { status: "ok" }
- `pnpm dev` boots all apps without port collisions (document the port map in root CLAUDE.md)