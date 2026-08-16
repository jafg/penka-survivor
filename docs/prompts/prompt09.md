Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. TDD where
it pays: components and composables get tests first; visual polish is exempt.
Work in apps/web.

Below is a single-file HTML prototype of the player app. It is the SPEC for visual
design (CSS custom properties = design tokens), copy (Spanish, keep it verbatim),
and behavior. Refactor it into a proper Vue 3 + TypeScript app.

NOTE: the prototype's embedded mock API predates the real one. Where they disagree,
the real API wins — see the contract notes below. The prototype is the VISUAL and
COPY contract, not the data contract.

The template is in @apps/web/public/prototype.html

## Real API contract (differs from the prototype's mock)
- Teams are CODES everywhere. Submitting a pick is
  POST /api/v1/penkas/:penkaId/picks with { teamCode } (POST, no "/current"), and
  the response is { myEntry } — the UPDATED personal delta. Use it to refresh the
  personal store directly instead of refetching /me.
- Board entries (BoardPlayer) carry { displayName, lives, points, pick }. There is
  NO pickHidden flag: pick === null && !board.isLocked → render "Pick oculto";
  pick === null && board.isLocked → render "Sin pick". Island ranking sorts by
  points.
- Listing is GET /api/v1/me/penkas → { penkas: [{ penka, entry }] }, newest first.
  The UI must read status/lives from `entry`, not from `penka`.
- Join returns 200 { penka, entry } even when the user had already joined — treat it
  as success and navigate, never as an error.
- A malformed join code and an unknown one both return 404 invalid_join_code. The
  input may hint at 4 digits, but do not block submission client-side on format and
  do not render a different message for the two cases.
- Creating a penka: the settings FIELD is required even though its two inner fields
  are optional — always send at least settings: {} and let the server apply
  defaults; never hardcode 2 lives in the client.
- Rate limiting is shared across auth and join (10/min by default): render 429
  rate_limited with the API's message and a retry hint.
- Public board and personal data are separate calls: GET /penkas/:id/board (no auth)
  and GET /penkas/:id/me (auth). Keep them in separate stores.

## Architecture
- Vite + Vue 3 + <script setup lang="ts"> + Pinia + Vue Router
- Typed API client: thin fetch wrapper using types/schemas from @penka/contracts;
  base URL from env; Bearer token injection; ApiError propagation
- Stores: authStore (tokens, refresh flow), penkasStore, boardStore (PUBLIC data),
  myEntryStore (PERSONAL data) — keep the public/personal split visible in code
- Views: Login, Register, JoinPenka (4-digit code input), MyPenkas, Pick, Standings
- Router guards: unauthenticated → Login
- Polling composable usePoll(fetcher): interval comes from the LAST RESPONSE's
  nextPollInSec (server-driven), jitter ±15%, pauses on document.hidden
  (visibilitychange), resumes with immediate fetch
- Extract design tokens into a shared CSS file; components must not hardcode colors

## Visual parity harness (prototype vs app)
The prototype pasted above is the visual CONTRACT. Build the tooling to compare
the Vue app against it:
- Copy the prototype file verbatim into apps/web/public/prototype.html, then make
  ONE addition to that copy: on boot, read `?screen=` (pick|standings|pools) from
  the query string and call showScreen() with it. Touch nothing else in the file.
- Add a dev-only route /__parity (guarded by import.meta.env.DEV, excluded from
  production builds): two equal-width panels side by side — left an iframe of
  /prototype.html?screen={s}, right an iframe of the real app route for {s} —
  plus a screen switcher (pick | standings | pools) and a link to the checklist.
- Write docs/visual-parity-checklist.md defining what parity means: design tokens
  (exact hex values from the CSS custom properties), typography (family, weight,
  size, case), spacing rhythm, radii and shadows, component states (picked,
  used/struck-through, locked bar, island notice, empty states, toast), and
  behavior cues (countdown format, poll indicator). Explicitly OUT of scope:
  data values (names, numbers, dates) — the app runs on live seed data, the
  prototype on embedded mocks.

## Visual parity loop (this session must run with Chrome integration: `claude --chrome`)
After tests are green and the local stack is up:
1. Open http://localhost:5173/__parity?screen=pick in the browser.
2. For each screen (pick, standings, pools): take a screenshot, compare both
   panels against docs/visual-parity-checklist.md, and interact where states
   require it — select a team on BOTH panels to compare the picked state, verify
   used teams render struck-through, reach the empty states from the pools screen.
3. Produce a findings table: screen | element | prototype | app | severity
   (blocker | minor). Fix every blocker in the Vue code — never "fix" the
   prototype, it is the contract — re-run affected tests, reload, re-verify.
4. Exit criteria: two consecutive passes with zero blockers, or three iterations
   completed, whichever comes first. Surviving minors go at the bottom of the
   checklist under "Accepted deviations", one line of rationale each.

## Tests (Vitest + Vue Testing Library + MSW)
MSW handlers must mirror the REAL contract (POST picks returning { myEntry },
{ penkas: [{ penka, entry }] }, idempotent join, BoardPlayer with points and
nullable pick), not the prototype's mock.
- Pick flow: select team → confirm POSTs { teamCode }; success updates the personal
  store from the returned myEntry (assert no extra /me refetch); 409
  matchday_locked and 422 team_already_used render the error toast with the API
  message
- Used teams render disabled/struck-through; island user cannot pick
- Countdown reaches lock → UI flips to locked state without reload
- Board: pick null pre-lock renders "Pick oculto"; pick null post-lock renders
  "Sin pick"; post-lock codes render as team names; island sorts by points
- Pools list reads lives/status from `entry`, not `penka`
- Create penka sends settings: {} when the user keeps defaults
- Join: unknown code and malformed code both surface the same 404 message; a
  second join of the same penka (200) navigates instead of erroring; 429 shows the
  rate-limit message
- usePoll: respects nextPollInSec changes (fake timers), pauses when hidden
- Auth guard redirects; refresh flow retries a 401 once then logs out

## Verification
- pnpm lint, pnpm build, pnpm test --filter @penka/web
- `pnpm dev --filter @penka/web` against the real local stack (env passthrough
  landed in 5b, so `pnpm dev --filter @penka/api` works with exported env): full
  manual flow (register → join → pick → see standings)
- /__parity renders both panels aligned for the three screens
- docs/visual-parity-checklist.md contains the loop's findings table and ends with
  either zero blockers or a documented "Accepted deviations" section