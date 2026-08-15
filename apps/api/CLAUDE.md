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
  index; the "already materialized?" read is only a fast path.
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

## Must NOT

- **Never compute game rules inline** — pick validation, elimination, resolution all come
  from `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas come from
  `@penka/contracts`, and every route declares its schemas.
- Never return an error code that is not in `ErrorCodes` from `@penka/contracts`.
- Never expose admin/operator operations (results, close, resolve) — those belong to
  `@penka/backoffice-api`.
