Read CLAUDE.md. TDD. Work in apps/api, new module: penkas. Depends on catalog + auth.

## Behavior
- POST /api/v1/penkas (auth) { name, leagueId, settings { lives (1–3, default 2),
  islandEnabled (default true) } }
  1. Validates league exists in catalog.
  2. Materializes the league's matches/matchdays in Mongo ONCE PER LEAGUE (shared
     across penkas of that league): if this league was never materialized, create
     matches with lockAt = now + template offsets; if it was, reuse the existing
     calendar. Matches are global per league; penkas reference the league.
  3. Generates a UNIQUE 4-digit join code (0000–9999), globally unique across
     active penkas: unique index + cryptographically random generation + retry on
     collision (max 5 attempts → 503 join_code_space_exhausted).
     NOTE in code comments: 10,000 codes is a deliberate MVP ceiling, documented
     trade-off; production path is 6 alphanumeric chars.
  4. Creator becomes the first Entry (alive, settings.lives).
- POST /api/v1/penkas/join (auth) { code }
  - Unknown code → 404 invalid_join_code (same error for malformed and nonexistent)
  - Already a member → 200 returning the penka (idempotent join)
  - Rate limited per user AND per IP (e.g. 10/min) → 429 (brute-force mitigation
    for the small code space)
- GET /api/v1/me/penkas (auth) → my penkas with my status/lives summary

## Tests (integration, Testcontainers Mongo + Redis)
- Create materializes league matches once: creating a second penka on the same
  league does NOT duplicate matches (assert match count)
- Join code: force a collision by injecting a deterministic code generator (make
  the generator an injectable dependency) → retry produces a different code;
  exhaustion path returns 503
- Join happy path; idempotent double join; invalid code 404; rate limit 429
- Creator entry exists with configured lives
- Unit: code generator produces zero-padded 4-digit strings, uniform over the space

## Verification
- `pnpm test:integration --filter @penka/api` green
- curl demo: register two users, user A creates penka, user B joins with the code