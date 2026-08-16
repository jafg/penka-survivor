# @penka/workers — RabbitMQ consumers

## Scope

Long-running consumers for async work. Today there is exactly one: **matchday
resolution**. It consumes `matchday.resolution`, applies `@penka/game-engine`'s
outcome to Mongo, finishes the league's matchday when every penka on it is done,
and refreshes the Redis board read model.

This is the write side of the game. `@penka/api` never resolves anything and
`@penka/backoffice-api` only asks for it — the resolution itself happens here,
once per penka per matchday, and nowhere else.

## Commands

- `pnpm dev --filter @penka/workers` — run the worker process (no port)
- `pnpm test --filter @penka/workers` — unit tests (`src/**/*.test.ts`, no containers)
- `pnpm test:integration --filter @penka/workers` — the full pipeline
  (`test/**/*.int.test.ts`, Testcontainers Mongo + Redis + RabbitMQ; Docker must be
  running)
- `pnpm lint --filter @penka/workers`

## Environment

Validated at boot by `src/config.ts`; a bad environment fails fast with one message
listing every problem, the same contract the two APIs use.

| Variable       | Default                     | Notes                                     |
| -------------- | --------------------------- | ----------------------------------------- |
| `MONGO_URL`    | `mongodb://127.0.0.1:27017` | matches `pnpm infra:up`                   |
| `MONGO_DB`     | `penka`                     | the same database the APIs write          |
| `REDIS_URL`    | `redis://127.0.0.1:6379`    | board read models only                    |
| `RABBITMQ_URL` | `amqp://127.0.0.1:5672`     |                                           |
| `PREFETCH`     | `1`                         | deliveries in flight; see the note below  |
| `MAX_ATTEMPTS` | `3`                         | total deliveries before the DLQ           |
| `LOG_LEVEL`    | `info`                      | pino level                                |

There is **no `PORT` and no secret**: this process authenticates nobody and answers
nobody.

## Resolution, step by step

`src/modules/resolution/handler.ts` is the decision table; the order is not
negotiable.

1. **Gate** — `resolutions` has a document for `(penkaId, matchdayId)` → log and
   ack. A redelivery stops here, before touching anyone's lives.
2. **Load** — `load.ts` reads the penka, its entries, this matchday's matches and
   the picks of *those entries*, and maps everything to **contract types** (ISO
   strings, string ids) before the engine sees it. Matchday and match ids are
   built with `matchdayId`/`matchId` from `@penka/contracts`, never re-derived. A
   penka whose `leagueId` disagrees with the command is refused.
3. **Ask the engine** — `resolveMatchday` decides everything. Its three refusals
   are routed, never re-interpreted:
   - `already_resolved` → ack (the second idempotency layer: the shared matchday
     can say "done" while this penka's marker is missing),
   - `matchday_not_locked` / `results_missing` → a race with the back office, so
     **retry**, and never an ack-as-success.
4. **Apply** — `apply.ts` writes the effects verbatim: `lives = newLives`,
   `status = newStatus`, `$inc points`, `$addToSet usedTeams` when a team was
   consumed, and each pick labelled `won`/`lost`/`void` from the same effect. The
   **resolution document is written last** — it is the idempotency marker, and a
   marker in front of half-applied effects is the one state nobody recovers from.
5. **Finish the shared matchday** — `finalize.ts`, below.
6. **Rebuild the board** — `board.ts` recomputes this penka's board and sets
   `penka:{penkaId}:board`. A failure here is logged and **not** retried: the
   board is a 60s cache that `@penka/api` rebuilds on a miss, and redelivering a
   durable resolution is far worse than a stale board.

### Who owns `matchdays.status = 'resolved'`

**This worker, and nothing else.** A matchday belongs to a LEAGUE and resolution
fans out per PENKA, so the flip cannot happen when the first penka finishes:
sibling penkas would then load an already-resolved matchday and no-op, and nobody
would ever resolve them. `finalizeMatchday` therefore flips it only once every
penka the fan-out addressed — `{ leagueId, createdAt: { $lte: command.requestedAt } }`,
taken from the message's own `requestedAt` so a penka created *after* the operator
pressed resolve is not counted — has a resolution document. The update filters on
`status: 'locked'`, so a concurrent or repeated finalizer is a no-op, and the
function never throws: this penka's resolution is already durable by the time it
runs. The gate's no-op path calls it too, which is what repairs a crash between
the marker and the flip.

The flip invalidates every sibling board (they were built while the matchday was
still locked), so the handler drops those cache keys and only then rebuilds its
own — after the flip, never before.

### The residual window

Between the effects and the marker there is a crash window: a worker that dies
there leaves the effects applied and no marker, and the redelivery resolves the
matchday a second time. It is deliberate for the MVP — Mongo transactions need a
replica set, and the single-node `mongo:7` in `infra/docker-compose.yml` has none.
`apply.ts` is written so the upgrade is one `withSession`/`withTransaction` wrap
once the deployment runs a replica set.

## Messaging

Topology names, routing keys, message ids and the command schema all come from
`@penka/contracts/messaging` — this app declares the topology (`messaging/topology.ts`)
with the same arguments the back office does, so a disagreement is a
`PRECONDITION_FAILED` at boot instead of a message that quietly never arrives.

| Outcome                                   | Answer                                                |
| ----------------------------------------- | ----------------------------------------------------- |
| Applied, or deliberately skipped          | `ack`                                                 |
| Poison (not JSON, or not the schema)      | `nack(requeue: false)` → `matchday.resolution.dlq`     |
| Not yet (engine race, or a handler threw) | counted retry, then `nack(requeue: false)`             |

A counted retry **republishes through `survivor.commands`** with `x-attempt`
incremented and acks the original only after the broker confirms the copy.
`nack(requeue: true)` cannot carry a counter — the broker's `x-death` array only
accrues on real dead-lettering — so an uncounted requeue loop would be invisible
and unbounded. The retry keeps the original `messageId`, since that is the
idempotency anchor. There is no backoff: three immediate attempts is enough to
ride out a close landing a moment after a resolve, and the scale path is a
delayed-retry queue (per-attempt TTL dead-lettering back into the queue), which
is why the counter lives in a preserved header rather than in memory.

`prefetch = 1` keeps the queue serial, so two commands for one penka are never in
flight together. That is an MVP limit, and the scale path is **not** a bigger
prefetch: it is a consistent-hash exchange keyed on `penkaId`, or one queue per
shard, so ordering survives the fan-out.

Shutdown on `SIGINT`/`SIGTERM` cancels the consumer, waits for the deliveries in
flight to finish and ack, and only then closes RabbitMQ, Redis and Mongo. A second
signal is logged and ignored rather than cutting the first one short.

## Testing notes

- Unit tests cover each step against fake Mongo/Redis call shapes and the handler's
  branching against injected steps (`ResolutionSteps`).
- The integration suite drives the **whole pipeline**: a player creates a penka and
  picks through `@penka/api`, an operator closes, loads results and resolves through
  `@penka/backoffice-api`, the real publisher writes to a real broker, and this
  worker consumes it. Both APIs are devDependencies for exactly that reason —
  **nothing in `src/` may import either of them**.
- It claims **Redis DB /11 and /12** (the repo splits the shared Redis per module).
  Mongo is split per test: `startStack` generates one database name and hands it to
  the worker *and* to both APIs, because a worker resolving a different database
  than the test seeded is a green test that proves nothing.

## Must NOT

- **Never expose HTTP** — no Fastify, no health endpoints, no ports. Liveness is
  observed through the process and the queue, not HTTP.
- Never compute game rules inline — use `@penka/game-engine`. The worker applies
  `outcome.effects`; it never decides who survives.
- Never handle a message non-idempotently — RabbitMQ redelivers; handlers must
  tolerate duplicates.
- Never write the resolution marker before the effects it marks.
- Never `Promise.all` a multi-step write — it short-circuits and hides partial
  failures. Use `Promise.allSettled` and inspect every result.
- Never ack `matchday_not_locked` or `results_missing` as success — that silently
  drops a matchday nobody will resolve again.
