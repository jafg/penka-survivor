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
│   ├── web/               # player app (Vue 3 + Pinia): board, picks, standings
│   ├── backoffice-web/    # operator console (Vue 3 + Pinia): results, close, resolve
│   ├── api/               # public API (Fastify): auth, catalog, penkas, game
│   ├── backoffice-api/    # admin API (Fastify): results, close, resolve → RabbitMQ
│   └── workers/           # RabbitMQ consumers: matchday resolution
├── packages/
│   ├── game-engine/       # pure game rules, zero runtime deps
│   ├── contracts/         # shared types, TypeBox schemas, canonical error codes
│   └── config/            # shared tsconfig, eslint, vitest presets
├── e2e/                   # Playwright suite driving the whole stack (no `test` script)
├── infra/
│   └── docker-compose.yml # mongo:7, redis:7, rabbitmq:3-management
├── scripts/demo.mjs       # `pnpm demo`: env check → infra → every app → URL map
├── docs/                  # CODEBASE-CONVENTIONS.md, ai-development-log.md
├── README.md              # architecture, ports, operator flow, trade-offs
├── .env.example           # dev-only defaults; `pnpm demo` copies it to .env
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md
```

## Development methodology: strict TDD

- Write a **failing test first**, implement until green, then refactor.
- **Never weaken or delete a test to make it pass.** If a test seems wrong, stop and flag
  it in your response instead of changing it.
- Unit tests are `src/**/*.test.ts` (`pnpm test`). Integration tests are
  `test/**/*.int.test.ts` (`pnpm test:integration`); they drive `fastify.inject` against
  real Mongo/Redis/RabbitMQ started by Testcontainers, so Docker must be running.
- End-to-end tests live in `e2e/` and run under Playwright against a stack you started
  yourself (`pnpm demo`, workers included). `@penka/e2e` deliberately has **no `test`
  script**, so `pnpm test` never launches a browser.

## Commands

| Command                        | What it does                                        |
| ------------------------------ | --------------------------------------------------- |
| `pnpm install`                 | Install all workspace dependencies                  |
| `pnpm demo`                    | Check env, start infra, boot every app, print URLs  |
| `pnpm dev`                     | `turbo run dev` — boot every app                    |
| `pnpm dev --filter @penka/api` | Boot a single app (works for any package name)      |
| `pnpm test`                    | Unit tests across the workspace (Vitest)            |
| `pnpm test:integration`        | Integration tests across the workspace              |
| `pnpm test:coverage`           | Coverage where a package defines it (`@penka/game-engine`) |
| `pnpm e2e`                     | Playwright against a stack you already started      |
| `pnpm e2e:install`             | Download the Chromium Playwright drives (once)      |
| `pnpm lint`                    | ESLint across the workspace                         |
| `pnpm build`                   | Typecheck node packages, bundle the Vue apps        |
| `pnpm infra:up`                | Start mongo/redis/rabbitmq via docker compose       |
| `pnpm infra:down`              | Stop the infra containers                           |
| `pnpm format`                  | Prettier over the repo — **not** part of the verification loop |

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

### Decisions that are settled — do not re-litigate them

These were each reached by correcting an earlier answer. `docs/CODEBASE-CONVENTIONS.md`
cites the code for every one; changing any of them is a reviewed decision, not a refactor.

- **A matchday belongs to a LEAGUE, not to a penka.** Every penka on a league shares one
  calendar, one set of matchday ids and one set of matches. One admin action fans out to
  every penka on the league.
- **A team is a catalog code (`^[A-Z0-9]{2,5}$`), never a generated id.** There is no teams
  collection and there will not be one.
- **Matchday and match `_id`s are derived, not generated** — `matchdayId`/`matchId` from
  `@penka/contracts`. That is what makes materializing a calendar idempotent. Never
  re-derive an id from a local template.
- **Resolution is asynchronous.** The back office publishes to RabbitMQ and returns
  `{ queued: true }`; `@penka/workers` is the only process that writes a resolution or
  flips a matchday to `resolved`. The operator flow is **close → results → resolve**.
- **The polling profile is one global Redis key**, not a per-penka setting. It is a load
  valve; a per-penka override is documented in `ops.ts` as the upgrade path, not as a gap.
- **Mongo document shapes are declared per process, on purpose.** A collection crossing an
  app boundary is a contract about bytes in Mongo; do not extract a shared `PenkaDoc`.
- **Apps never import each other from `src/`** — only from `@penka/contracts` and
  `@penka/game-engine`. Test folders may import another app to seed through its real API.
