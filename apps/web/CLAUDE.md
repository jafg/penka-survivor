# @penka/web — player app

## Scope

Player-facing Vue 3 + Vite + Pinia app: register or log in, create or join a penka, pick a
team, and follow the board. Talks only to `@penka/api`.

## Commands

- `pnpm dev --filter @penka/web` — Vite dev server on port 5173 (strict)
- `pnpm test --filter @penka/web` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/web`
- `pnpm build --filter @penka/web` — production bundle

## Environment

| Variable            | Default             | Notes                                              |
| ------------------- | ------------------- | -------------------------------------------------- |
| `VITE_API_BASE_URL` | — (unset)           | Absolute base for `@penka/api`. When unset, requests go to the same origin and Vite's dev proxy forwards `/api` to port 3000. |

`server.strictPort` is `true`. The port is not negotiable in development: `@penka/api`
registers no CORS, so the dev proxy is the only thing that makes same-origin requests work.

## Layout

- `api/client.ts` — one fetch wrapper: attaches the access token, refreshes once on a 401,
  and turns a non-2xx body into the canonical `{ status, code, message }` envelope.
- `api/endpoints.ts` — every call the app makes, typed from `@penka/contracts`.
- `stores/` — `auth`, `catalog`, `penkas`, `board`, `my-entry`, `toast` (Pinia).
- `composables/use-poll.ts` — the polling chain; `composables/use-countdown.ts` — the lock.
- `game/pick.ts` — the **only** place a rule is consulted, and it is an adapter (below).
- `views/`, `components/` — the UI; `views/ParityView.vue` compares against the prototype.

## Notes

- **The session lives in `localStorage` under `penka.survivor.auth`**, as
  `{ tokens, user }`. That key is part of the app's observable surface — the `e2e` suite
  plants a session there instead of typing into the login form — so renaming it breaks
  more than this app.
- **The server decides the poll cadence, never the client.** Every board response carries
  `nextPollInSec`, and `use-poll.ts` reads the NEXT delay from the LATEST response. It is a
  chain of `setTimeout`s, not a `setInterval`, because the delay is not constant, and the
  next one is armed only after the fetch settles so a slow answer cannot stack requests.
  Wake-ups are jittered (`JITTER_FLOOR`/`JITTER_SPREAD`) so clients that loaded the board
  together do not stay in lockstep for the life of the penka.
- **The board and the personal delta are two calls, on purpose.** `GET /penkas/:id/board`
  is public and identical for every viewer; `GET /penkas/:id/me` carries `lives`, `status`,
  `myPick` and `usedTeams`. Never merge them into one store shape that could be rendered
  for the wrong player.
- **A `null` pick on the board means *hidden* before lock and *never picked* after it.**
  Read `board.isLocked` to tell them apart. There is no `pickHidden` flag and asking for
  one would leak "this player has already picked".
- **After a matchday resolves the board advances.** `selectCurrentMatchday` returns the
  lowest-numbered *unresolved* matchday, so `matchday` increments, `isResolved` goes back
  to `false`, picks are `null` again, and the matchday that just finished appears in
  `board.history`. Do not treat `isResolved` as "the last matchday is done".
- **`game/pick.ts` is an adapter, not a rule.** `validateMyPick` lines up arguments for
  `validatePick` in `@penka/game-engine` — the same function the API runs — and decides
  nothing. Where the prototype and the engine disagree, the engine wins: an island player
  keeps picking when the penka has `islandEnabled`, because each hit is a point.

## Must NOT

- Never call `@penka/backoffice-api` — the player app only talks to the public API.
- Never re-implement game rules client-side. If the UI needs to know whether something is
  allowed or whether a pick won, ask `@penka/game-engine`; add an adapter, not a rule.
- Never hand-write API payload types — import them from `@penka/contracts`.
- Never hard-code a poll interval or compute one from a profile name — that is
  `nextPollInSec`'s job, server-side.
- Never render anything personal from the board response. If a field is not in
  `MyEntrySchema`, it did not come from the personal route.
