# @penka/backoffice-api — admin API

## Scope

Operator-facing Fastify API: load match results, close matchdays, and trigger
resolution by **publishing to RabbitMQ**. Resolution itself happens in
`@penka/workers`.

## Commands

- `pnpm dev --filter @penka/backoffice-api` — run on port 3001 (override with `PORT`)
- `pnpm test --filter @penka/backoffice-api` — unit tests (`src/**/*.test.ts`)
- `pnpm test:integration --filter @penka/backoffice-api` — integration tests (`fastify.inject`)
- `pnpm lint --filter @penka/backoffice-api`

## Must NOT

- **Never resolve matchdays synchronously** — closing/resolving publishes a message to
  RabbitMQ; `@penka/workers` consumes it.
- Never compute game rules inline — use `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas from `@penka/contracts`.
- Never be reachable by players — this API is operator-only.
