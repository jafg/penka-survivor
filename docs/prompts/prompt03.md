Read CLAUDE.md (root and apps/api). TDD. Work in apps/api.

Bootstrap the public API properly and implement authentication.

## Infrastructure plumbing
- Fastify with TypeBox type provider; global error handler that maps thrown
  ApiError → HTTP status + { code, message }; unknown errors → 500 without leaking internals
- Mongo plugin (connection from env, MONGO_URL), Redis plugin (REDIS_URL)
- Config via env with validation at boot (fail fast, clear message)
- @fastify/rate-limit with Redis store, applied per route where specified

## Auth module
- POST /api/v1/auth/register { email, displayName, password }
  → argon2id (OWASP params), unique email (409 email_taken)
  Password policy: min 8 chars (keep simple, document it)
- POST /api/v1/auth/login { email, password } → { accessToken, refreshToken, user }
  Invalid email and invalid password return the SAME error (401 invalid_credentials)
- POST /api/v1/auth/refresh { refreshToken } → rotates: old one revoked, new pair issued
  Refresh tokens stored HASHED in Mongo with expiry (7d); access token JWT 15m
- GET /api/v1/me (auth) → user without any credential material
- Rate limit register and login (e.g. 10/min per IP) → 429 rate_limited
- Auth decorator/plugin for protected routes reading Bearer token

## Tests
Unit (no containers):
- password service: hash+verify roundtrip; hashing the same password twice yields
  DIFFERENT hashes (per-password salt — this is the "salted" requirement, prove it)
- token service: sign/verify, expiry respected, tampered token rejected
Integration (Testcontainers Mongo + Redis):
- register → login → me happy path
- duplicate email 409; bad credentials 401 with identical body for both failure modes
- refresh rotation: old refresh token no longer works after use
- protected route without/with-invalid token → 401
- rate limit triggers 429
- response bodies never contain passwordHash or refresh token hashes (assert on
  serialized JSON)

## Verification
- `pnpm test --filter @penka/api` and `pnpm test:integration --filter @penka/api` green
- Manual smoke: `pnpm infra:up && pnpm dev --filter @penka/api`, register + login via curl