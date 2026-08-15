# @penka/api — public API

## Scope

Player-facing Fastify API: auth, competition catalog, penkas, and game endpoints
(picks, standings). Reads Mongo (source of truth) and Redis (read models, rate
limiting).

## Commands

- `pnpm dev --filter @penka/api` — run on port 3000 (override with `PORT`)
- `pnpm test --filter @penka/api` — unit tests (`src/**/*.test.ts`, no containers)
- `pnpm test:integration --filter @penka/api` — integration tests (`test/**/*.int.test.ts`,
  Testcontainers Mongo + Redis via `fastify.inject`; Docker must be running)
- `pnpm lint --filter @penka/api`

## Environment

Validated at boot by `src/config.ts`; a bad environment fails fast with one message
listing every problem.

| Variable         | Default                      | Notes                                    |
| ---------------- | ---------------------------- | ---------------------------------------- |
| `JWT_SECRET`     | — (required)                 | ≥ 32 chars; secrets never get defaults   |
| `PORT`           | `3000`                       |                                          |
| `MONGO_URL`      | `mongodb://127.0.0.1:27017`  | matches `pnpm infra:up`                  |
| `MONGO_DB`       | `penka`                      |                                          |
| `REDIS_URL`      | `redis://127.0.0.1:6379`     | matches `pnpm infra:up`                  |
| `RATE_LIMIT_MAX` | `10`                         | per minute on register, login, join      |
| `TRUST_PROXY`    | `false`                      | `true`, a hop count, or an IP/CIDR list  |

Token lifetimes are policy, not env: access JWT 15m, refresh token 7d.

Rate limiting keys on `request.ip`. Behind a reverse proxy, set `TRUST_PROXY` or every
client shares the proxy's bucket; with no proxy in front, leave it off so clients cannot
forge `X-Forwarded-For` to get a fresh bucket.

## Auth notes

- Password policy: minimum 8 characters (kept simple on purpose), enforced by
  `RegisterRequestSchema`; hashing is argon2id with OWASP params (m=19456, t=2, p=1).
- Emails are normalized to lowercase before storing and querying.
- Refresh tokens are opaque and stored only as SHA-256 hashes; refresh rotates
  atomically (`findOneAndDelete`) — a token grants exactly one refresh.
- Login returns the same 401 `invalid_credentials` body for unknown email and wrong
  password, and verifies a dummy hash when the email is unknown (timing parity).
- The current user lives at `GET /api/v1/me`; the other three routes are under
  `/api/v1/auth/*`.
- `authRoutes` asserts the decorators it needs (`db`, `tokens`, `authenticate`,
  `rateLimit`) at boot, so registering it before its plugins fails loudly instead of
  leaving login unthrottled or crashing cryptically.

## Catalog notes

- The competition catalog is **hardcoded TypeScript** (`src/modules/catalog/data.ts`), not a
  database: six leagues across three regions, assembled once at module load and served
  from memory. The endpoints are public — no auth, no rate limiting.
- Team codes are the identity of a team inside its league: keep them stable and unique per
  league (the same code may legitimately appear in another league). National teams carry no
  `country` — they are one.
- Each league ships one `FixtureTemplate` with 3 matchdays; a matchday pairs every team
  exactly once, built by the circle-method round robin in `schedule.ts`. A league therefore
  needs an even number of teams, and `buildRoundRobin` throws at boot if that is violated.
- **Lock times are relative offsets, not dates**: matchday 1 locks 120 minutes after the
  template is materialized into a penka, matchday 2 at 1560 (+26h), matchday 3 at 3000
  (+50h). That keeps the demo repeatable — seed at any hour of any day and matchday 1 is
  always open for two hours, so nothing goes stale before a presentation.
- `GET /api/v1/catalog/leagues` takes an optional `?region=america|europe|world`; an
  unknown region is a 400 `validation_failed` from the querystring schema. An unknown
  league id is a 404 `league_not_found` — the generic `not_found` is only for unroutable
  paths.
- `src/modules/catalog/catalog.test.ts` sweeps the whole catalog (contract validation, code
  uniqueness, every team paired exactly once per matchday, no pairing repeated). Editing the
  hardcoded data means keeping that green.

## Penkas notes

- Three endpoints, all authenticated: `POST /api/v1/penkas`, `POST /api/v1/penkas/join`,
  `GET /api/v1/me/penkas`.
- **Matchdays and matches belong to a league, not to a penka.** The first penka created on
  a league materializes its calendar (`materialize.ts`) and every penka after that reuses
  it — so the second penka on a league does not duplicate matches, and whoever
  materialized first fixed the lock times for everyone. Idempotence rests on deterministic
  `_id`s (`copa-libertadores:md1`, `…:md1:RIV-BOC`) plus the unique `(leagueId, number)`
  index; the "already materialized?" read is only a fast path. The id builders
  (`matchdayId`, `matchId`) live in `@penka/contracts` because the back office addresses
  the same documents — never re-derive an id from a local template.
- Materialized matches carry `homeTeamCode`/`awayTeamCode` — catalog codes, matching the
  contracts (see `packages/contracts/CLAUDE.md`). There is no teams collection.
- Join codes are 4 digits, `randomInt`-uniform, and unique through the index on
  `penkas.joinCode` — never a read-then-write check. Five collisions in a row means the
  space is full: 503 `join_code_space_exhausted`. The 10,000-code ceiling is a deliberate,
  documented MVP trade-off (see `join-code.ts`); the production path is 6 alphanumeric
  characters. `buildApp({ generateJoinCode })` injects the generator so tests can force
  collisions.
- Unknown and malformed join codes get the **same** 404 `invalid_join_code`, byte for byte
  — hence `JoinPenkaRequestSchema` stays loose, since a 400 from schema validation would
  tell a guesser their code was at least well formed.
- Joining is idempotent: `$setOnInsert` under the unique `(penkaId, userId)` index, so a
  double-click returns the existing entry instead of resetting lives. The creator is just
  the penka's first entry, so "joining" your own penka is a no-op that returns it.
- `POST /penkas/join` carries **two** independent budgets, per IP and per user, so neither
  rotating IPs nor rotating logins buys extra guesses against the small code space. They
  use `app.createRateLimit` rather than `app.rateLimit`: a `rateLimit()` hook flags the
  request as limited and every later one on the same route returns without counting, so
  the second budget would silently never apply. Their Redis keys carry explicit
  `join:ip:` / `join:user:` prefixes — decorator-built limiters have no route information
  to keep their counters apart.

## Game notes

- Four endpoints, split by who the data belongs to. `GET /penkas/:penkaId/board` and
  `GET /penkas/:penkaId/matchday/current` are **public and carry zero personal data**, so
  one cached answer serves every viewer. `GET /penkas/:penkaId/me` and
  `POST /penkas/:penkaId/picks` are authenticated and carry the personal delta
  (`lives`, `status`, `myPick`, `usedTeams`). Nothing personal ever rides on the board.
- **The lock gate is runtime, not schema.** `BoardPlayer.pick` is nullable in
  `@penka/contracts`, so only `buildBoard` (`modules/game/board.ts`) can enforce "a pick
  is secret until the matchday locks" — it drops every pick before lock however loudly
  the caller passed one in. A `null` pick therefore means *hidden* before lock and *never
  picked* after it; clients tell them apart with `board.isLocked`, and there is
  deliberately no `pickHidden` flag to leak "this player has already picked".
- The board is cached aside on `penka:{penkaId}:board` for 60s. The whole board is one
  entry, so a cache hit is byte-identical and a poll costs a single Redis read. The
  staleness errs safe: a board built before lock keeps hiding picks for up to a minute
  after it, never the reverse. A pick does **not** invalidate it — pre-lock the public
  board does not change when someone picks. An unparsable entry is discarded and rebuilt
  rather than 500ing every viewer.
- **Resolving the calendar always goes through the league**: load the penka, take its
  `leagueId`, query matchdays/matches by it (matchday `_id`s are `league:mdN`, and no
  matchday carries a `penkaId`). The current matchday is the lowest-numbered unresolved
  one, or the highest-numbered when all are resolved. Since `kickoffAt === lockAt`, it is
  locked when `now >= lockAt` or its status already says so.
- A matchday that exists with **no matches is a 500 `internal`, not an empty list** — a
  half-materialized calendar is a real failure mode, and "no hay partidos" is a lie the
  player cannot act on. It is logged with the matchday id so an operator can find it.
- Picks live in their own `picks` collection (`entryId`, `matchdayId`, `teamCode`,
  `createdAt`) behind a unique `(entryId, matchdayId)` index. A player may change their
  mind until lock: the write is an upsert, and the index is what arbitrates two
  submissions in flight — the loser retries as a plain update, so a resubmission never
  becomes a second document. `createdAt` tracks the pick that will be resolved, not the
  first one attempted.
- Every rule about whether a pick is allowed comes from `validatePick`; the route only
  maps the engine's rejection to a status: `matchday_locked`/`on_island` → 409 (nothing
  is wrong with the request, it is late or from an eliminated player),
  `team_not_playing`/`team_already_used`/`validation_failed` → 422.
- A penka the caller has not joined answers **exactly** like one that does not exist
  (404 `penka_not_found`, same body) — membership is not something a stranger gets to
  probe for.
- `nextPollInSec` is server-driven and pure (`modules/game/polling.ts`): the server is the
  only side that knows how close the lock is and how loaded the deployment is. The
  operator profile lives in one Redis key for the whole deployment,
  `POLLING_PROFILE_KEY` from `@penka/contracts` (`ops:pollingProfile`) — this app only
  reads it, `@penka/backoffice-api` writes it, and neither owns the name. `live` → 2s,
  `slow` → 30s, and `normal` → 10s except
  inside the last 10 minutes before lock, where it tightens to 2s. A missing or
  unrecognized value reads as `normal`; `PollingProfileSchema` is the closed set.
- `board.history` is `[]` until matchday resolutions exist — an empty history is the
  truth today, not a placeholder.

## Must NOT

- **Never compute game rules inline** — pick validation, elimination, resolution all come
  from `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas come from
  `@penka/contracts`, and every route declares its schemas.
- Never return an error code that is not in `ErrorCodes` from `@penka/contracts`.
- Never expose admin/operator operations (results, close, resolve) — those belong to
  `@penka/backoffice-api`.
