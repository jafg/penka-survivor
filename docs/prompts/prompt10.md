Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. Same
conventions as apps/web (reuse the design-token CSS and the API client pattern;
admin client sends X-Admin-Key from env/localStorage — MVP).

Below is the single-file HTML prototype of the back office. Same deal: it is the
spec for layout, copy (Spanish) and behavior — not for the data contract.

[PASTE THE FULL CONTENT OF penka-survivor-backoffice.html HERE]

## Real API contract (differs from the prototype's mock)
- Results, close and resolve are LEAGUE-scoped, not penka-scoped:
  GET /admin/v1/leagues/:leagueId/matchdays/:number,
  POST /admin/v1/leagues/:leagueId/matchdays/:number/{close,resolve}.
  Response shapes come from @penka/contracts/api/admin — type the client from them.
- Match ids are deterministic strings containing colons
  ('copa-libertadores:md1:RIV-BOC'). The client MUST encodeURIComponent(matchId)
  when building POST /admin/v1/matches/:matchId/result. Add a test that asserts the
  encoded URL.
- LOCK IS A PRECONDITION OF RESOLVE: resolving an open matchday → 409
  matchday_not_locked. The operator flow the UI must afford is close → load
  results → resolve. The resolve button enables only when the matchday is locked
  AND every match has an outcome; the prototype's enablement logic (results-only)
  is wrong — adjust it and note the change in the parity checklist.
- Resolve is asynchronous: the endpoint publishes one message per penka on the
  league and returns immediately. The UI must NOT claim "fecha resuelta" — it
  reports that resolution was queued, then reflects the real state on the next
  GET of the matchday (poll a few times or offer a manual refresh). Adjust the
  prototype's copy accordingly and note it in the parity checklist as an
  intentional deviation.
- Resolve error states to render verbatim from the API: 409 matchday_not_locked,
  409 results_missing, 404 penka_not_found (resolving a league where no penka
  plays). setResult on an already-resolved matchday returns 409 already_resolved —
  render it and disable the outcome selectors once the matchday is resolved.
- The penkas table is fed by GET /admin/v1/penkas.

## Views/components
- MatchdayStatus panel (matchday, status pill, results counter, picks received)
- Results table: outcome selector per match (home/draw/away), sync writes,
  toast with pendingMatches / readyToResolve
- Actions: close matchday, resolve matchday (disabled until results complete or
  already resolved), reset demo data (calls a dev-only seed endpoint if present,
  otherwise hide behind env flag)
- Ops panel: polling profile segmented control. Spanish labels stay as the
  prototype's (Normal / En vivo / Degradado) but the VALUES sent are the
  contract's: normal / live / slow — "degraded" does not exist in
  PollingProfileSchema. The call is PUT /admin/v1/polling-profile.
- API console: every request/response (method, path, status, latency) via a fetch
  interceptor into a Pinia store, newest first, cap 60 entries
- Penkas table: operational columns from GET /admin/v1/penkas

## Visual parity harness + loop (this session must run with `claude --chrome`)
Same mechanism as apps/web, adapted to a single-view desktop app:
- Copy the back-office prototype verbatim to
  apps/backoffice-web/public/prototype.html (no query-string bootstrap needed —
  it is one screen).
- Dev-only /__parity route: prototype iframe on the left, real app on the right,
  full viewport height, desktop width (do not squeeze into mobile columns).
- Extend docs/visual-parity-checklist.md with a back-office section: desktop
  layout (two-column grid, panel structure and order), tables (header case and
  letter-spacing, row hover, numeric alignment), outcome selector states, status
  pills (open/locked/resolved), segmented control, API console typography (mono
  font, method colors, error rows), toasts.
- Run the same loop as apps/web: screenshot each region, compare against the
  checklist, interact to produce comparable states (load one result on both
  sides and compare the selected outcome button; trigger a resolve with missing
  results to compare the 409 error toast), findings table, fix blockers in Vue
  only, two clean passes or three iterations max, accepted deviations documented.

## Tests (Vitest + VTL + MSW)
MSW handlers must mirror the real admin routes (league-scoped paths, colon-bearing
match ids, async resolve, contract shapes from @penka/contracts/api/admin).
- Resolve button disabled while the matchday is open OR any match lacks a result;
  enabled only when locked AND complete; enabled state calls the league-scoped
  resolve endpoint and renders the "queued" toast (not "resolved"); 409
  matchday_not_locked and 409 results_missing render the API message
- Close button issues the close POST and the UI reflects the locked status pill
- Outcome click POSTs to /admin/v1/matches/<encoded id>/result with the id
  percent-encoded, and updates the counter from the response
- Polling profile click (label Degradado) PUTs { profile: 'slow' } and reflects
  the returned nextPollInSec
- API console logs entries in order with status coloring for errors

## Verification
- pnpm lint, pnpm build, pnpm test --filter @penka/backoffice-web
- Manual: full stack up (including workers, or resolve stays queued forever), load
  results, resolve, watch the player app's board update on its next poll
- /__parity renders prototype and app side by side at desktop width
- Back-office section of docs/visual-parity-checklist.md completed with findings
  and zero blockers (or documented accepted deviations)