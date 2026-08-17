# @penka/backoffice-web — operator console

## Scope

Operator-facing Vue 3 + Vite + Pinia app: list the running penkas, load match results,
close matchdays, trigger resolution, and set the deployment's board polling cadence. Talks
only to `@penka/backoffice-api`.

## Commands

- `pnpm dev --filter @penka/backoffice-web` — Vite dev server on port 5174 (strict)
- `pnpm test --filter @penka/backoffice-web` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/backoffice-web`
- `pnpm build --filter @penka/backoffice-web` — production bundle

## Environment

| Variable                     | Default   | Notes                                                     |
| ---------------------------- | --------- | ---------------------------------------------------------- |
| `VITE_ADMIN_API_BASE_URL`    | — (unset) | Absolute base for `@penka/backoffice-api`. Unset means same origin, and Vite's dev proxy forwards to port 3001. |
| `VITE_ADMIN_API_KEY`         | — (unset) | Build-time fallback key, so a fresh clone talks to the local API with no setup. |
| `VITE_ADMIN_RESET_ENDPOINT`  | — (unset) | Path of a deployment-provided demo-reset route. Unset hides the button. |

`server.strictPort` is `true` — same reason as the player app: no API registers CORS, so
the dev proxy is what makes same-origin requests work.

## Layout

- `api/client.ts` — the fetch wrapper, the `x-admin-key` header, and where the key is kept.
- `api/endpoints.ts` — every admin call, typed from `@penka/contracts`.
- `api/reset.ts` — the optional demo-reset button.
- `stores/` — `pools`, `matchday`, `ops`, `console`, `session`, `toast` (Pinia).
- `game/resolve.ts` — the resolve precondition, asked of the engine (below).
- `components/` — `PenkasPanel`, `ResultsPanel`, `MatchdayStatusPanel`, `OpsPanel`,
  `ApiConsolePanel`, `StatusPill`, `AdminKeyGate`; `views/ConsoleView.vue` is the console
  itself.

## Notes

- **The operator flow is close → results → resolve**, and the API enforces it: resolving an
  open matchday is 409 `matchday_not_locked` and publishes nothing. The console must not
  offer resolve as the first step, and must not "helpfully" close on the operator's behalf.
- **Resolve is queued, not done.** The response is `{ queued: true, matchdayId }`; the
  matchday becomes `resolved` only when `@penka/workers` has finished every penka on the
  league. Poll the matchday for its status — never report success off the 202-shaped body.
- **`game/resolve.ts` is a dry run against the engine, not a re-check.** `whyNotResolvable`
  calls `resolveMatchday` with no entries and no picks, which is pure because the engine
  checks all three preconditions before touching them. The console needs its own copy
  because the resolve button's enabled state is a question about a matchday sitting in a
  store, not about a response — and when a set-result response does arrive, its
  `readyToResolve` is the same predicate and simply agrees. Never hand-code "locked and
  complete".
- **A match id carries colons** (`copa-libertadores:md1:RIV-ATN`), so it must be
  `encodeURIComponent`-ed into the path. The server decodes exactly once (find-my-way does
  it), so never pre-decode or double-encode.
- **The admin key is one shared secret for the deployment.** The header it travels in is
  `ADMIN_KEY_HEADER` from `@penka/contracts` — the same constant `@penka/backoffice-api`
  compares against, so the two cannot drift apart on a name no compiler checks. Never
  re-spell it locally. A stored key (`penka.survivor.adminKey` in `localStorage`) beats the
  build-time one so a bundle can be pointed at another stack without a rebuild. An empty
  key is removed, never stored — it would shadow the fallback forever.
- **`VITE_ADMIN_API_KEY` in `.env.development` must equal `ADMIN_API_KEY` in the repo's
  root `.env`, byte for byte.** `timingSafeEqual` has no notion of "close enough". The two
  drifted once and the console came up empty on every panel, with the only clue a 401 in
  the API log — which is what `AdminKeyGate` now exists to answer.
- **`stores/session.ts` is not a session.** There is no identity behind a shared secret, so
  "signed in" is only ever the answer to the last request. The store listens on the
  client's **traffic feed** rather than wrapping one endpoint, so any 401 from any panel
  locks the console and no future endpoint can forget to report one. **Only a 401 locks** —
  a 500 or an unreachable API is not an auth problem, and prompting for a key on one would
  send an operator hunting for the wrong thing. A key the API rejects is never left in
  `localStorage`: it would shadow the build-time fallback even after the deployment is
  fixed.
- **The polling profile is deployment-wide.** `PUT /admin/v1/polling-profile` writes one
  Redis key (`ops:pollingProfile`) that every penka's board reads. Present it as a load
  valve, not as a per-penka setting; players see the change on their next poll, and up to
  60 seconds later than the write because of the board cache.

## Must NOT

- Never call the public `@penka/api` — operator flows go through the admin API only.
- Never include player-facing flows — this app is for operators.
- Never re-implement game rules client-side; ask `@penka/game-engine` as `game/resolve.ts`
  does.
- Never hand-write API payload types — use `@penka/contracts`.
- Never invent an admin endpoint the API does not register. The demo-reset button exists
  only because a deployment names the path itself, and is hidden otherwise.
