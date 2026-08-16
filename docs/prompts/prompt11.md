Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. Final
integration pass.

## Tasks
1. Playwright E2E (new top-level e2e/ workspace) against the full local stack
   (infra + all apps, WORKERS INCLUDED — without them resolution never completes).
   One spec covering the demo script:
   register user A → create penka on a league from the catalog (settings: {}) →
   register user B → join with the 4-digit code → both submit picks (POST
   { teamCode }) → pre-lock board shows every pick as null → admin CLOSES the
   matchday → admin loads all results (encodeURIComponent the colon-bearing match
   ids) → admin triggers the league-scoped resolve (queued, not resolved) → wait
   for the async resolution to land → player app board shows resolved standings
   (alive/island moved correctly, picks now visible, island sorted by points) →
   admin PUTs polling-profile 'slow' → player app poll indicator shows the new
   interval on next cycle.
   Make it deterministic: seed through APIs, poll with expect.poll (never sleeps),
   and give the async resolve step a generous timeout — it goes through RabbitMQ.
   Add a second, cheaper spec: two penkas on the SAME league resolve independently
   from one admin action, proving the shared calendar and the per-penka fan-out.
2. `pnpm demo`: brings up infra, waits for health, starts every app (turbo), prints
   the URL map. Env passthrough landed in prompt 5b — verify `pnpm demo` boots the
   APIs with exported env and fails fast with a clear message when a var is missing.
   `pnpm e2e` runs Playwright.
3. Root README.md: architecture diagram (ASCII is fine), port map, command
   reference, the public/personal data split, the RabbitMQ topology, the
   close-before-resolve operator flow, and the documented trade-offs (4-digit code
   ceiling + mitigations, admin API key, prefetch=1 ordering note). Add a short
   "conventions that surprised us" section: team codes instead of ids
   (^[A-Z0-9]{2,5}$), PlayerPick naming (TS utility-type collision), deterministic
   string _ids for matchdays/matches, league-scoped calendar shared across penkas,
   completeness check on materialization (matchdays AND matches, to avoid stranded
   calendars), engine returning a Result the worker must branch on, concurrent
   writes with Promise.allSettled plus logging compensation (discardPenka),
   idempotent join returning 200, createRateLimit instead of a second rateLimit
   hook, the polling profile as a GLOBAL load valve (shared POLLING_PROFILE_KEY,
   values live|normal|slow, per-penka override documented as upgrade path),
   find-my-way decoding route params before handlers (clients encode, server never
   double-decodes), and the Redis DB index allocation table for integration tests
   (/1–/4 auth, /5–/6 penkas, /7–/8 game, /9–/10 backoffice-api, /11–/12 workers).
4. docs/ai-development-log.md TEMPLATE with columns: date, prompt (verbatim or
   link), what was delegated, what I reviewed/changed, tests added. Backfill
   entries for prompts 0–11 (including 5b) as placeholders to fill during the run.
5. Regenerate docs/CODEBASE-CONVENTIONS.md with the same read-only audit prompt
   that produced it (it is now stale: game module, picks/resolutions collections,
   shared id builders, admin app, workers). Then audit every CLAUDE.md against it,
   so the next session cannot reintroduce the original plan.

## Verification
- `pnpm demo` from a clean clone (only Docker + pnpm installed) reaches a working
  stack; `pnpm e2e` green
- pnpm lint, pnpm build, pnpm test, pnpm test:integration green across the monorepo
  (do NOT add pnpm format to this loop)
- README instructions reproduced by following them literally