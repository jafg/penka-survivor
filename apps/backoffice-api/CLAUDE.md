# @penka/backoffice-api — admin API

## Scope

Operator-facing Fastify API: list the running penkas, load match results, close
matchdays, trigger resolution by **publishing to RabbitMQ**, and set the
deployment's board polling cadence. Resolution itself happens in
`@penka/workers`.

It shares Mongo and Redis with `@penka/api` and creates nothing a player creates:
penkas, entries, picks and the materialized calendar all arrive from there.

## Commands

- `pnpm dev --filter @penka/backoffice-api` — run on port 3001 (override with `PORT`)
- `pnpm test --filter @penka/backoffice-api` — unit tests (`src/**/*.test.ts`, no containers)
- `pnpm test:integration --filter @penka/backoffice-api` — integration tests
  (`test/**/*.int.test.ts`, Testcontainers Mongo + Redis + RabbitMQ; Docker must be running)
- `pnpm lint --filter @penka/backoffice-api`

## Environment

Validated at boot by `src/config.ts`; a bad environment fails fast with one message
listing every problem.

| Variable         | Default                      | Notes                                    |
| ---------------- | ---------------------------- | ---------------------------------------- |
| `ADMIN_API_KEY`  | — (required)                 | ≥ 32 chars; secrets never get defaults   |
| `PORT`           | `3001`                       |                                          |
| `MONGO_URL`      | `mongodb://127.0.0.1:27017`  | matches `pnpm infra:up`                  |
| `MONGO_DB`       | `penka`                      | the same database `@penka/api` uses      |
| `REDIS_URL`      | `redis://127.0.0.1:6379`     | matches `pnpm infra:up`                  |
| `RABBITMQ_URL`   | `amqp://127.0.0.1:5672`      | matches `pnpm infra:up`                  |

There is no `RATE_LIMIT_MAX` or `TRUST_PROXY`: this API is operator-only, is not
exposed to the public internet, and keys nothing on the client IP.

## Auth notes

- One shared key in the **`X-Admin-Key`** header, compared against `ADMIN_API_KEY` with
  `timingSafeEqual`. Missing, malformed and wrong all answer the same 401 `unauthorized`.
  The header name is `ADMIN_KEY_HEADER` from `@penka/contracts`, not a local literal: the
  console has to send exactly what this plugin reads, and nothing else checks that.
- **This is a deliberate MVP decision, not a design.** A shared secret has no identity
  behind it, so an audit log cannot say *who* closed a matchday, and rotating it logs out
  every operator at once. The production path is role-based users — the `users` collection
  already exists and this API would check a role claim on the same JWTs `@penka/api`
  issues — at which point `plugins/admin-auth.ts` is replaced, not extended.
- The guard is a route-level `preHandler` (`app.requireAdmin`), not a global hook, so
  `/health` stays reachable for a load balancer that has no key. `adminRoutes` asserts its
  decorators (`db`, `redis`, `publisher`, `requireAdmin`) at boot, so registering it before
  its plugins fails loudly instead of leaving every operator endpoint open.

## Write model

**Results and close are synchronous; resolution is not.** Loading a result and closing a
matchday are single Mongo writes an operator waits on. Resolving validates, publishes one
command per penka, and returns `{ queued: true }` — the workers do the resolving, and the
matchday's `status` only becomes `resolved` when they are done.

- **Lock is a precondition of resolution in the engine**, so the API mirrors it at the
  boundary: resolve on an open matchday is 409 `matchday_not_locked` and publishes
  nothing. The operator flow is **close → results → resolve**.
- Which refusal applies is not re-derived here: `whyNotResolvable` (`preconditions.ts`)
  asks `resolveMatchday` from `@penka/game-engine` with no entries and no picks, which is
  a pure dry run because the engine checks all three preconditions before touching them.
  The API and the worker therefore cannot disagree about what "resolvable" means.
  `readyToResolve` in the set-result response is exactly `whyNotResolvable(...) === null`,
  so the back office greys out its own button instead of re-implementing the rule.
- **`resolveRequestedAt` is bookkeeping, not a status.** `MatchdayStatus` is the closed
  set open/locked/resolved; "an operator pressed resolve and the workers have not
  finished" is not a state of the game, and making it one would put a fourth value in
  front of every player-facing client. No mapper emits it and `@penka/api` never reads it.
- **The marker is claimed before the penkas are read, and it pins the fan-out to one
  instant** (`claimResolveRequest` in `resolve.ts`). `resolveRequestedAt` is set by a
  conditional `findOneAndUpdate` on `{ resolveRequestedAt: { $exists: false } }`, and
  every later press replays the stored timestamp instead of minting a new one; the penka
  query then filters `{ leagueId, createdAt: { $lte: requestedAt } }` — the same predicate
  `@penka/workers` counts with when it decides the matchday is finished. Without that, a
  second press would build a **wider** set than the first, and a penka created in between
  would be resolved by nobody: the first fan-out has already flipped the matchday, so its
  command comes back `already_resolved` and is acked and forgotten.
- A second press therefore republishes the **identical** generation. That is not a no-op
  and deliberately so — duplicates are harmless (deterministic message ids), while
  refusing would take away the only way to retry a matchday whose commands were lost.
- Publishing failure is compensated, but **only by the request that claimed the marker**:
  the claim is given back through a logging helper that never throws over the original
  error. A republish that fails says nothing about the request it was replaying, and
  clearing that marker would let the next press claim a new, wider generation. The one
  unrecoverable state is a matchday marked as requested with nothing in the queue — it
  looks done, so nobody presses resolve again.
- Setting a result on an already-resolved matchday is 409 `already_resolved`. That is
  beyond the letter of the endpoint, but the workers have already eliminated players on
  the old result and nothing re-runs a resolved matchday.
- Resolving a league **no penka plays** is 404 `penka_not_found` rather than a successful
  no-op, for the same reason: queueing nothing while marking the matchday requested would
  leave it looking done forever.

## Endpoints

All under `/admin/v1`, all behind `X-Admin-Key`.

| Endpoint                                        | Notes                                          |
| ----------------------------------------------- | ---------------------------------------------- |
| `GET /penkas`                                   | every penka with entries alive/island, picks in for the current matchday, resolved matchdays |
| `GET /leagues/:leagueId/matchdays`              | the league's whole calendar, in playing order; `[]` for a league nobody plays |
| `GET /leagues/:leagueId/matchdays/:number`      | matchday + matches + the cadence being served  |
| `POST /matches/:matchId/result`                 | `{ outcome }` → sync write, `pendingMatches`, `readyToResolve` |
| `POST /leagues/:leagueId/matchdays/:number/close`   | sync lock; idempotent; 409 `already_resolved`  |
| `POST /leagues/:leagueId/matchdays/:number/resolve` | validates, then publishes; 409 `matchday_not_locked` / `results_missing` |
| `PUT /polling-profile`                          | `{ profile }` → Redis; 422 `invalid_profile`   |

- **Matchdays are addressed by league and number, never by id**: the document id is
  derived from exactly those two values (`matchdayId` in `@penka/contracts`), so taking an
  id from the caller would let an operator address a document belonging to another league.
  That addressing is why the **calendar listing exists**: every other matchday route takes
  a number, and until a client has seen the calendar it can only guess one. The console
  guessed — "the matchday after the last resolved one" — and walked off the end of a
  finished league into a `matchday_not_found` no operator action caused. The listing
  answers **whole matchdays**, not bare numbers, so a client can render each one's status
  without a detail read per matchday; and it answers `[]`, not 404, for a league nobody
  plays, because "which matchdays does this league have?" has a true answer there and the
  client asks before it knows whether the league is in play at all.
- **A match is addressed by its id**, because that is what the operator has in hand from
  the matchday listing. Those ids carry colons (`copa-libertadores:md1:RIV-ATN`), so
  **clients must `encodeURIComponent` the id into the path**. The route does not decode it
  again — find-my-way already decoded the segment (and rejected a malformed escape as a
  400 before the handler ran), so a second `decodeURIComponent` would corrupt any id
  containing a literal `%`.
- The listing summary is a projection, not a rule (`pools.ts`): which matchday is
  "current" comes from the engine's `selectCurrentMatchday`, the same answer players see.
  Penkas on the same league share a calendar and therefore share matchday ids, so a pick
  belongs to a penka only through its **entry**.
- `invalid_outcome` and `invalid_profile` are answered with `attachValidation` plus
  `assertValidBody` (`validation.ts`): Fastify validates the body before any handler runs,
  so without that seam those two canonical codes could never be returned — and loosening
  the body schema to check by hand would give up the closed shapes `@penka/contracts`
  guarantees. Only a failure about that one field is remapped; anything else keeps the
  generic 400 `validation_failed`.
- A matchday that exists with **no matches is a 500 `internal`**, the same call
  `@penka/api` makes: a half-materialized calendar is a real failure mode, and an empty
  fixture list would read as "nothing to load results for".
- `ensureAdminIndexes` (called on route registration, the established pattern) adds the
  two back-office-only access paths: `penkas.leagueId` for the resolve fan-out and
  `picks.matchdayId` for the picks count. Everything else it queries is already indexed by
  `@penka/api`, which owns the unique keys.

## Messaging

The topology is declared idempotently at boot (`messaging/topology.ts`), so the first
process to start creates it and every later one agrees:

- exchange `survivor.commands` (topic, durable)
- queue `matchday.resolution` (durable), bound to `matchday.resolve.*`, dead-lettering to
- exchange `survivor.dlx` (topic, durable) → queue `matchday.resolution.dlq`

Names, routing keys and the message schema live in `@penka/contracts`
(`src/messaging.ts`) because the workers must agree with them byte for byte.

- **One message per penka of the league**, routing key `matchday.resolve.{penkaId}`, body
  `{ penkaId, leagueId, matchday, requestedAt }`, persistent delivery.
- `messageId` is `resolve:{penkaId}:{matchday}` — deterministic, and the **idempotency
  anchor**: a republished command carries the same id, which is what lets a worker
  recognize work it has already done. Everything about the failure handling above depends
  on duplicates being harmless.
- Publishes go through a **confirm channel** and one `waitForConfirms()` per batch:
  `publish()` alone only says the bytes reached the client's buffer, so without confirms a
  broker that died mid-batch would look exactly like a successful resolution.
- `buildApp({ publisher })` injects a `ResolutionPublisher` instead of connecting, which
  is how the integration tests drive a genuinely broken channel.

## Testing notes

- `test/integration/harness.ts` starts Mongo, Redis **and RabbitMQ** (same images as
  `infra/docker-compose.yml`) and is this package's own — an app cannot import another
  app's test folder, and only this one publishes. Every test here runs against a real
  broker with the real topology (no opt-in flag to forget), while `@penka/api`'s suite
  never pays the broker's boot.
- Tests seed through **`@penka/api` itself** (`test/integration/seed.ts`, which is why
  `@penka/api` is a devDependency): hand-written fixtures could drift from what the other
  app actually writes, and the calendar only ever gets materialized by a player creating a
  penka. Nothing in `src/` may import it.
- `makeTestConfig` gives a fresh database per call; override `mongoDbName` to share one
  database between two app instances — that is how the cross-app polling-profile test
  works (back office writes `ops:pollingProfile`, an `@penka/api` instance on the same
  Redis serves `nextPollInSec: 30` on its next board build).
- Redis database claims are documented at the top of `admin.int.test.ts`: `/9`–`/10`
  belong to this package.

## Must NOT

- **Never resolve matchdays synchronously** — resolving publishes to RabbitMQ;
  `@penka/workers` consumes it.
- Never compute game rules inline — use `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas from `@penka/contracts`.
- Never return an error code that is not in `ErrorCodes` from `@penka/contracts`.
- Never be reachable by players — this API is operator-only.
- Never import `@penka/api` from `src/` — the two apps share a database and a contract,
  never a module.
