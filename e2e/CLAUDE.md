# @penka/e2e — end-to-end suite

## Scope

Playwright specs that drive the **whole stack at once**: both APIs, the workers, and the
two Vue apps against real Mongo, Redis and RabbitMQ. It belongs to no single app, which is
why it sits at the repo root rather than under `apps/`.

Two specs:

- `tests/demo-script.spec.ts` — the demo end to end: two players, a penka, picks, close,
  results, the league-scoped resolve, the resolved board in the browser, and a
  polling-profile change showing up in the UI.
- `tests/shared-league.spec.ts` — cheaper and API-only: two penkas on the **same** league
  resolve independently from one admin action, proving the shared calendar and the
  per-penka fan-out.

## Commands

- `pnpm e2e:install` — download the Chromium build Playwright drives (once per machine)
- `pnpm demo` — **start the stack first, in another terminal.** The suite does not boot it.
- `pnpm e2e` — run the specs
- `pnpm lint --filter @penka/e2e`, `pnpm build --filter @penka/e2e` (`tsc --noEmit`)

## Environment

`support/env.ts` reads the repo's `.env` without overwriting anything already exported, and
falls back to the standard local ports: API 3000, admin API 3001, player app 5173, console
5174, plus `MONGO_URL`, `MONGO_DB`, `REDIS_URL` and `ADMIN_API_KEY`.

Those ports are not negotiable. Neither API registers CORS, and both Vue apps set
`strictPort: true`, so the browser only reaches an API through its own dev proxy.

## Notes

- **There is no Playwright `webServer` and no `test` script.** The suite asserts against a
  stack an operator started, workers included — without them resolution never completes and
  the pipeline would hang rather than fail. Having no `test` script is what keeps
  `turbo run test` from launching a browser.
- **`globalSetup` waits for all four HTTP services, then wipes game data.** `support/reset.ts`
  does `deleteMany({})` per collection; it never drops the database, because dropping takes
  the unique indexes with it — the join-code collision check, idempotent join and once-only
  resolution are exactly what the specs exercise.
- **The wipe is also what makes the run deterministic.** Lock offsets are relative to the
  first materialization of a league's calendar (matchday 1 opens at +120 minutes), so only a
  fresh calendar guarantees an open matchday.
- **Never sleep.** Wait with `expect.poll` or a Playwright `expect` timeout. The resolve step
  goes through RabbitMQ, so it gets a generous one.
- **The end-of-pipeline signal is `board.history`, not `isResolved`.** After a matchday
  resolves the board *advances* to the next one, so `isResolved` goes back to `false`.
- **Closing a matchday does not invalidate the board cache** (60 s TTL), so the pick reveal
  and any polling-profile change can take up to a minute to appear. Wait for them; do not
  delete the Redis key behind the app's back — that would test a stack no operator has.
- **Each spec owns its league** (`copa-libertadores`, `champions-league`), because matchdays
  are league-scoped documents. `fullyParallel: false` and `workers: 1` keep one shared
  database sane and mirror the worker's `prefetch = 1`.
- **Two lives means one matchday cannot reach the island**, so the demo spec plays a second
  one and asserts island order as a points-non-increasing invariant.
- `tsconfig.json` widens `lib` to `["ES2022", "DOM"]`: the callbacks handed to
  `page.addInitScript` are compiled here but execute in the browser.

## Must NOT

- **Never type a password into the login form.** Sessions are obtained through the API and
  planted in `localStorage` under `penka.survivor.auth` via `page.addInitScript`.
- Never write to Mongo or Redis to set up a scenario — seed through the real APIs, or the
  test proves something no user can reach.
- Never assert on a shape spelled by hand. `support/api.ts` decodes every response through
  `Value.Check` against `@penka/contracts`, so contract drift fails with the field named.
- Never add a `test` script to this package.
- Never import from an app's `src/` — this suite talks HTTP, like any other client.
