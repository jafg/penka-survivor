# penka-survivor

A **Survivor** football prediction game, built as an MVP for [Penka](https://penka.io)'s
B2B fan-engagement platform.

Players join a private penka with a 4-digit code and back **one team per matchday**. A
winning pick survives; a draw or a loss costs a card. Run out of cards and you fall to
**La Isla**, where you keep playing for points but can no longer win. Operators drive the
competition from a back office: they close the matchday, load results, and trigger
resolution — which happens **asynchronously**, through RabbitMQ, in a worker.

```
pnpm install && pnpm demo     # the whole stack
pnpm e2e                      # the demo script, end to end, in another terminal
```

---

## Architecture

```
                    ┌──────────────────┐            ┌────────────────────────┐
  players  ───────► │  @penka/web      │            │  @penka/backoffice-web │ ◄─── operator
                    │  Vue 3 · 5173    │            │  Vue 3 · 5174          │
                    └────────┬─────────┘            └───────────┬────────────┘
                             │ /api/v1                          │ /admin/v1
                             │ Bearer <access token>            │ x-admin-key
                    ┌────────▼─────────┐            ┌───────────▼────────────┐
                    │  @penka/api      │            │ @penka/backoffice-api  │
                    │  Fastify · 3000  │            │ Fastify · 3001         │
                    └────┬────────┬────┘            └────┬───────────┬───────┘
                         │        │                      │           │
                         │        │   board cache        │           │ publish
                         │        └──────┐  ┌────────────┘           │ resolve
                         │               ▼  ▼                        ▼
                         │            ┌─────────┐         ┌────────────────────┐
                         │            │  Redis  │         │      RabbitMQ      │
                         │            │  6379   │         │  survivor.commands │
                         │            └─────────┘         └─────────┬──────────┘
                         │                                          │ matchday.resolve.*
                         ▼                                          ▼
                    ┌─────────────────────┐              ┌────────────────────────┐
                    │      MongoDB        │ ◄────────────┤    @penka/workers      │
                    │       27017         │   effects,   │  prefetch 1, no port   │
                    │  source of truth    │   resolution └────────────────────────┘
                    └─────────────────────┘

              every rule above comes from  ►  @penka/game-engine  (pure, zero deps)
              every request/response shape ►  @penka/contracts    (TypeBox schemas)
```

**The one rule that shapes everything else**: game rules live in `@penka/game-engine` and
nowhere else. It is pure — no clock, no randomness, no I/O — so the API, the workers and
both Vue apps can call the *same functions* and never disagree about who is still alive.
The player app closes its pick screen with `isMatchdayLocked`, the very function the API
uses to reject a late pick.

| Workspace                | What it is                                                              |
| ------------------------ | ----------------------------------------------------------------------- |
| `apps/web`               | Player app — Vue 3 + Pinia + Vite. Talks only to `@penka/api`.           |
| `apps/backoffice-web`    | Operator app — Vue 3 + Pinia + Vite. Talks only to `@penka/backoffice-api`. |
| `apps/api`               | Public API — auth, catalog, penkas, game. Fastify 5.                    |
| `apps/backoffice-api`    | Admin API — results, close, resolve, polling profile. Fastify 5.        |
| `apps/workers`           | RabbitMQ consumer — matchday resolution. No HTTP surface.               |
| `packages/game-engine`   | The rules. Pure functions, `dependencies: {}`, forever.                 |
| `packages/contracts`     | TypeBox schemas, canonical error codes, derived ids, messaging names.   |
| `packages/config`        | Shared tsconfig / eslint / vitest presets.                              |
| `e2e`                    | Playwright suite driving the whole stack.                               |
| `infra`                  | `docker-compose.yml` — mongo:7, redis:7, rabbitmq:3-management.         |

---

## Ports

`pnpm demo` boots all of these at once; nothing collides.

| Service                 | URL / port                          |
| ----------------------- | ----------------------------------- |
| `@penka/api`            | http://localhost:3000 — `/api/v1`   |
| `@penka/backoffice-api` | http://localhost:3001 — `/admin/v1` |
| `@penka/web`            | http://localhost:5173               |
| `@penka/backoffice-web` | http://localhost:5174               |
| `@penka/workers`        | *no port* — consumes `matchday.resolution` |
| MongoDB                 | 27017                               |
| Redis                   | 6379                                |
| RabbitMQ (AMQP)         | 5672                                |
| RabbitMQ management     | http://localhost:15672 (guest / guest) |

Both Vue dev servers use `strictPort: true` and proxy `/api` → 3000 and `/admin` → 3001,
which is also why neither API registers CORS. Moving an API to another port therefore
needs the matching proxy change, not just an env var.

---

## Commands

| Command                          | What it does                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| `pnpm install`                   | Install every workspace                                             |
| `pnpm demo`                      | **Everything**: `.env`, infra + healthchecks, all five apps, URL map |
| `pnpm e2e`                       | Playwright against a running stack (**resets the game data**)        |
| `pnpm e2e:install`               | Download the Playwright browser, once                                |
| `pnpm dev`                       | `turbo run dev` — the apps only, no infra                            |
| `pnpm dev --filter @penka/api`   | One app (works for any package name)                                 |
| `pnpm test`                      | Unit tests, workspace-wide (`src/**/*.test.ts`)                      |
| `pnpm test:integration`          | Integration tests (`test/**/*.int.test.ts`, Testcontainers)          |
| `pnpm test:coverage`             | Unit tests with coverage                                             |
| `pnpm lint`                      | ESLint, workspace-wide                                               |
| `pnpm build`                     | Typecheck the node packages, bundle the Vue apps                     |
| `pnpm format`                    | Prettier over the repo                                               |
| `pnpm infra:up` / `infra:down`   | Just the containers                                                  |

### First run, from a clean clone

You need **Docker** and **pnpm**. Nothing else.

```bash
pnpm install
pnpm e2e:install     # only if you plan to run the e2e suite
pnpm demo
```

`pnpm demo` writes `.env` from `.env.example` the first time and tells you it did. Those
are dev-only values for a localhost stack — generate real ones per environment before
deploying anything. If a required variable is missing or too short, `pnpm demo` says which
one, what reads it, and exits non-zero **before** starting a single process.

Then, in another terminal:

```bash
pnpm e2e
```

The suite needs the stack already running: it drives the real APIs, the real broker and the
real worker. It clears the game collections first, so **do not run it against a demo you
care about**.

---

## The demo, by hand

1. **Player app** (5173) → *Crear cuenta*, then *Crear penka*, pick a league from the
   catalog. You get a 4-digit join code.
2. A second player registers and joins with that code. Both make a pick for Fecha 1.
   The table shows *Pick oculto* for everyone, including yourself — picks are secret until
   the matchday locks.
3. **Back office** (5174) → paste the `ADMIN_API_KEY` from `.env`, open the league's
   matchday.
4. **Close** the matchday. Picks are now public: revealing what everyone played is the
   Survivor format, not a leak.
5. **Load a result** for every match. The screen tells you how many are still pending and
   greys out *Resolver* until none are.
6. **Resolve**. The response is `{ queued: true }` — the back office does not resolve
   anything. `@penka/workers` picks the command up, applies the effects and rebuilds the
   board cache; the table updates on its next poll, within seconds.
7. Whoever backed a losing team has one card fewer. Lose them all and you appear under
   *La Isla*, still scoring a point per correct pick.

---

## Public data vs personal data

The board is **cached and shared**: one document, the same bytes for every viewer, so it
can sit in Redis under `penka:{penkaId}:board` for 60 seconds and be served to a hundred
players from one build. That only works because it contains nothing personal.

| `GET /penkas/:id/board` — **public**       | `GET /penkas/:id/me` — **personal**            |
| ------------------------------------------ | ---------------------------------------------- |
| display names, lives, points               | your lives and status                          |
| picks, **only once the matchday is locked**| **your** pick, always                          |
| history of resolved matchdays              | the teams you have already spent (`usedTeams`) |
| `lockAt`, `isLocked`, `isResolved`         | —                                              |
| `nextPollInSec`                            | —                                              |
| no ids, no emails, no `my*` field of any kind | requires a Bearer token                     |

A pick is not private for the whole matchday, only until it locks. `BoardSchema` cannot
express "null means hidden before the lock and *no pick* after it", so the **board builder
enforces it at runtime** and clients tell the two apart by reading `isLocked`. There is
deliberately no `pickHidden` flag: two ways of saying the same thing is how they drift.

---

## RabbitMQ topology

```
  backoffice-api                                                    workers
       │  publish, one message per penka                               ▲
       │  routing key: matchday.resolve.{penkaId}                      │
       │  messageId:   resolve:{penkaId}:{matchday}                    │
       ▼                                                               │
  ┌──────────────────────┐   matchday.resolve.*   ┌────────────────────┴───┐
  │ survivor.commands    ├───────────────────────►│ matchday.resolution    │
  │ topic, durable       │                        │ durable, prefetch 1    │
  └──────────────────────┘                        └───────────┬────────────┘
                                                              │ x-death / give up
  ┌──────────────────────┐                        ┌───────────▼────────────┐
  │ survivor.dlx         ├───────────────────────►│ matchday.resolution.dlq│
  │ topic, durable       │  matchday.resolution.dlq│ durable               │
  └──────────────────────┘                        └────────────────────────┘
```

Everything is durable. A resolution command lost to a broker restart would leave players
eliminated in some penkas and untouched in others — the one inconsistency this game cannot
explain to its players. Both the publisher and the consumer declare the identical topology
at boot, so a drift fails immediately with `PRECONDITION_FAILED` instead of quietly routing
messages nowhere.

**One command per penka.** The operator resolves a *league's* matchday; the API fans it out
to every penka on that league, each with its own routing key, and the worker resolves them
independently. Retries are republished through the same exchange with an `x-attempt` header
rather than `nack`-ed, so a poison message cannot spin the queue.

**`prefetch = 1` is a decision, not a default.** One message at a time keeps resolution
serial, so two commands for the same penka can never interleave their writes. It caps
throughput at one resolution at a time per worker process — the way to go faster is more
worker processes, not a bigger prefetch.

---

## The operator flow: close, then resolve

```
  open ──── close ────► locked ──── results ────► locked+complete ──── resolve ────► resolved
   │                      │                                                            ▲
   │ picks accepted       │ picks public                                                │
   │ picks hidden         │ results accepted                       @penka/workers ──────┘
```

The order is enforced, and each refusal is a canonical error code with a sentence an
operator can act on:

| Attempt                                   | Answer                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| Resolve a matchday still open             | `409 matchday_not_locked` — *Close this matchday before resolving it* |
| Resolve with a match still missing a result | `409 results_missing` — *Some matches still have no result* |
| Resolve twice                             | `409 already_resolved` — *This matchday was already resolved* |
| Close twice                               | `200`, idempotent — closing is not a destructive act        |

`resolve` answers `{ queued: true, matchdayId }` and **never** `resolved`. The matchday's
own status flips only when every penka on the league has a resolution document — the
completeness check in `finalizeMatchday`. Flipping it on the first penka would tell the
others their calendar was already resolved, and they would never get their own row.

---

## Trade-offs we took on purpose

**4-digit join codes.** `0000`–`9999`, because a code has to be readable out loud across
an office. That is 10,000 codes total, and the space is small enough to enumerate. What
holds it together in the MVP:

- the unique index on `penkas.joinCode` is the arbiter — creation retries on collision and
  fails loudly with `503 join_code_space_exhausted` after five, rather than ever handing
  out a code twice;
- codes are drawn with `crypto.randomInt`, which rejection-samples, so no code is likelier
  than another (`% 10000` over random bytes would bias the low end);
- joining is rate limited per user *and* per IP, so the small space is not trusted alone;
- a wrong code and a malformed code get the identical `404 invalid_join_code`, so a guesser
  cannot learn the shape.

The production path is 6 alphanumeric characters (~2.2 billion codes) and it is a drop-in
replacement for one generator function.

**A single admin API key.** The back office authenticates with one shared `x-admin-key`,
compared with `timingSafeEqual` and required to be at least 32 characters. There are no
admin accounts, no roles and no audit trail of *which* operator closed a matchday. For an
MVP with one operator that is the honest amount of machinery; a real deployment needs
per-operator identities, and the guard is a single Fastify plugin to replace. `/health` sits
outside the guard on purpose, so a load balancer never needs the key.

**A 60-second board cache.** It is what makes the board cheap to serve, and it is also why
an operator's change is not instant: closing a matchday does not invalidate the cache, so
the picks become visible when the entry turns over. The worker *does* overwrite the cache
after a resolution, so results appear as fast as the pipeline runs. The e2e suite waits this
out rather than deleting the key behind the app's back — the wait is the documented
behaviour.

**The polling profile is global.** `live | normal | slow` (2 s / 10 s / 30 s) under one
Redis key, for the whole deployment. It is a load valve — "how hard may clients hammer us
right now" — not an editorial setting, and boards already tighten themselves inside the last
ten minutes before a lock without an operator touching anything. A per-penka override is a
clean upgrade path; it was rejected here because it invites using a load control as a
feature.

---

## Conventions that surprised us

Things this codebase does that are not the obvious first choice, and why.

- **Teams are `teamCode`, never a team id.** `^[A-Z0-9]{2,5}$` — `RIV`, `BOC`, `LIV`.
  Codes are what a fixture actually publishes and what a player recognises, so nothing has
  to maintain a second identifier that means the same thing.
- **`PlayerPick`, not `Pick`.** A domain type called `Pick` would shadow TypeScript's own
  `Pick<T, K>` at every import site. The clash is silent and awful; the rename is one word.
- **Matchday and match `_id`s are derived strings, not ObjectIds.**
  `matchdayId(leagueId, n)` → `copa-libertadores:md1`, and
  `matchId(matchdayId, home, away)` → `copa-libertadores:md1:RIV-BOC`. Deterministic ids
  make materialization idempotent and let a route address a document without a lookup —
  and they mean admin routes take a `leagueId` + `number` rather than an id from the
  caller, which would let an operator address another league's matchday.
- **Those colons must be `encodeURIComponent`d by clients.** find-my-way decodes route
  params *before* the handler, so the server decodes exactly once and never again. A
  handler that "helpfully" decoded a second time would corrupt any id containing a `%`.
- **The calendar belongs to the league, not to the penka.** Every penka on
  `copa-libertadores` shares one set of matchday and match documents, so one operator
  action settles all of them. Lives, picks, points and standings stay strictly per-penka.
  Whichever penka materializes a league first fixes its dates for everyone after.
- **Materialization checks matchdays AND matches.** Checking only for matchdays would let
  a half-written calendar look complete and strand a league with fixtures missing, forever.
- **The engine returns a `Result`, and the worker branches on it.** `resolveMatchday`
  answers `{ ok: false, code }` for `already_resolved`, `matchday_not_locked` and
  `results_missing` instead of throwing. The worker acks the first (the work is done) and
  **retries** the other two (the state will change) — a distinction an exception would have
  flattened into "something went wrong".
- **Concurrent writes use `Promise.allSettled` plus logged compensation.** Penka creation
  writes several documents at once; when one fails the code calls `discardPenka` and logs
  what it undid. Not a transaction, and the log says so.
- **Joining twice is a `200`, not a `409`.** `$setOnInsert` behind the unique
  `(penkaId, userId)` index. A player who double-taps has not done anything wrong, and a
  second join must never reset their lives.
- **`createRateLimit`, not a second `rateLimit` hook.** `@fastify/rate-limit` is registered
  once with `global: false`; routes opt in through route config. Registering it twice to get
  a second limit silently replaces the first.
- **The polling profile lives under one shared key** (`ops:pollingProfile`), values
  `live | normal | slow`. See the trade-offs above.
- **Integration tests that need an isolated Redis claim a numbered database.** Redis has 16
  of them, and a rate-limit test only means something if its counters start empty — sharing
  index 0 with a suite that has already spent the budget makes the assertion depend on test
  order. There is no allocator: the claim is a comment at the top of the suite that made it
  (`apps/api/test/integration/game.int.test.ts:1`), so check the table before taking one.

  | Redis DB    | Claimed by                | In use                                   |
  | ----------- | ------------------------- | ---------------------------------------- |
  | `/1`–`/4`   | `@penka/api` auth         | yes — rate-limited register/login         |
  | `/5`–`/6`   | `@penka/api` penkas       | yes — the two join budgets                |
  | `/7`–`/8`   | `@penka/api` game         | reserved; no game route is throttled      |
  | `/9`–`/10`  | `@penka/backoffice-api`   | reserved; no admin route is throttled     |
  | `/11`–`/12` | `@penka/workers`          | `/11` only; `/12` is for the next suite   |

  Mongo is split the other way — per **test**, not per module. `startStack` mints one
  database name and gives it to the worker *and* to both APIs, because a worker resolving a
  different database than the test seeded is a green test that proves nothing.

---

## Testing

Strict TDD: a failing test first, then the implementation, then the refactor. A test is
never weakened or deleted to make a change pass — if a test looks wrong, that is a
conversation, not an edit.

| Layer            | Where                        | Run with                |
| ---------------- | ---------------------------- | ----------------------- |
| Unit             | `src/**/*.test.ts`           | `pnpm test`             |
| Integration      | `test/**/*.int.test.ts`      | `pnpm test:integration` |
| End-to-end       | `e2e/tests/*.spec.ts`        | `pnpm e2e`              |

Integration tests bring up real MongoDB, Redis and RabbitMQ with Testcontainers — no
mocks of the things most likely to break. The e2e suite goes one further and drives the
running stack through the browser and the admin API at once:

- `demo-script.spec.ts` — the whole script above, ending with an operator slowing every
  board down and the player app following.
- `shared-league.spec.ts` — two penkas on one league, resolved by one admin action, proving
  the shared calendar and the per-penka fan-out.

Both seed through the APIs and wait with `expect.poll`; there is not a single `sleep` in
the suite.

---

## Documentation

- `CLAUDE.md` — the conventions, at the root and one per workspace.
- `docs/CODEBASE-CONVENTIONS.md` — a read-only audit of what the code actually does.
- `docs/ai-development-log.md` — what was delegated to an AI assistant, and what was
  reviewed or changed afterwards.
- `docs/prompts/` — every build prompt, verbatim, in the order it was run. The plan was
  generated in one pass from the design spec and then corrected against the code as it
  went; `prompt_plan_corrections.md` is that correction, and it sits between prompts 5
  and 5b.
