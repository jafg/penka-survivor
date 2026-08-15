# @penka/workers — RabbitMQ consumers

## Scope

Long-running consumers for async work, starting with matchday resolution: consume a
resolution message, apply `@penka/game-engine` rules, persist outcomes to Mongo, and
refresh Redis read models.

## Commands

- `pnpm dev --filter @penka/workers` — run the worker process (no port)
- `pnpm test --filter @penka/workers` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/workers`

## Must NOT

- **Never expose HTTP** — no Fastify, no health endpoints, no ports. Liveness is
  observed through the process and the queue, not HTTP.
- Never compute game rules inline — use `@penka/game-engine`.
- Never handle a message non-idempotently — RabbitMQ redelivers; handlers must tolerate
  duplicates.
