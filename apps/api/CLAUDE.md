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
| `RATE_LIMIT_MAX` | `10`                         | per minute per IP on register/login      |
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

## Must NOT

- **Never compute game rules inline** — pick validation, elimination, resolution all come
  from `@penka/game-engine`.
- Never define request/response types locally — TypeBox schemas come from
  `@penka/contracts`, and every route declares its schemas.
- Never return an error code that is not in `ErrorCodes` from `@penka/contracts`.
- Never expose admin/operator operations (results, close, resolve) — those belong to
  `@penka/backoffice-api`.
