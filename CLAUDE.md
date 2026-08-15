# penka-survivor

## Purpose

MVP of a "Survivor" football prediction game that plugs into Penka, a B2B fan-engagement
platform. Players pick one team per matchday; a wrong pick eliminates them, and the last
player standing wins. Operators run competitions from a backoffice: they load results,
close matchdays, and trigger asynchronous resolution. MongoDB is the source of truth,
Redis holds read models and rate limiting, and RabbitMQ carries async matchday resolution
to workers.

## Layout

```
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
```

## Development methodology: strict TDD

- Write a **failing test first**, implement until green, then refactor.
- **Never weaken or delete a test to make it pass.** If a test seems wrong, stop and flag
  it in your response instead of changing it.
- Unit tests are `src/**/*.test.ts` (`pnpm test`). Integration tests are
  `test/**/*.int.test.ts` (`pnpm test:integration`); they use `fastify.inject` today and
  Testcontainers once real infrastructure is involved.

## Commands

| Command                        | What it does                                        |
| ------------------------------ | --------------------------------------------------- |
| `pnpm install`                 | Install all workspace dependencies                  |
| `pnpm dev`                     | `turbo run dev` — boot every app                    |
| `pnpm dev --filter @penka/api` | Boot a single app (works for any package name)      |
| `pnpm test`                    | Unit tests across the workspace (Vitest)            |
| `pnpm test:integration`        | Integration tests across the workspace              |
| `pnpm lint`                    | ESLint across the workspace                         |
| `pnpm build`                   | Typecheck node packages, bundle the Vue apps        |
| `pnpm infra:up`                | Start mongo/redis/rabbitmq via docker compose       |
| `pnpm infra:down`              | Stop the infra containers                           |
| `pnpm format`                  | Prettier over the repo                              |

## Port map (`pnpm dev` boots all of these — no collisions)

| Service               | Port  |
| --------------------- | ----- |
| @penka/api            | 3000  |
| @penka/backoffice-api | 3001  |
| @penka/web            | 5173  |
| @penka/backoffice-web | 5174  |
| MongoDB               | 27017 |
| Redis                 | 6379  |
| RabbitMQ (AMQP)       | 5672  |
| RabbitMQ management   | 15672 |

`@penka/workers` is a long-running process with no port.

## Conventions

- **TypeBox schemas from `@penka/contracts` are the single source of truth** for API
  request/response types. Never define request/response shapes inline in an app.
- **Canonical error codes only**: every error response uses a code from
  `ErrorCodes` in `@penka/contracts`. Never invent ad-hoc codes.
- **No business rules outside `@penka/game-engine`.** APIs, workers, and frontends call
  the engine; they never re-implement or inline its rules.
- TypeScript strict mode everywhere; shared tsconfig/eslint/vitest presets come from
  `@penka/config`.
- Each app/package has its own `CLAUDE.md` with its scope and hard boundaries — read it
  before working there.
