Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. TDD. Work in
apps/api, new module: game. Prompt 5b already landed (BoardPlayer carries points and
a lock-gated pick). The game/api contracts ALREADY EXIST in @penka/contracts —
implement against them verbatim; do not invent shapes.

This module enforces the public/personal data split: public endpoints are cacheable
per penka and carry ZERO personal data; personal data travels on separate
authenticated endpoints.

## Resolving the calendar (read this before writing a query)
matchdays and matches are keyed by leagueId with deterministic string _ids, and carry
no penkaId. Every endpoint below must: load the penka → take its leagueId → query
matchdays/matches by leagueId, using the module's typed accessors.
"Current matchday" = the league's lowest-numbered matchday that is not resolved;
if all are resolved, the highest-numbered one. Since kickoffAt === lockAt, a matchday
is locked when now >= lockAt or its status says so.
Never assume a matchday has matches just because it exists — a partially
materialized calendar is a real failure mode. If the current matchday has no
matches, fail with a clear error instead of returning an empty list the client
would render as "no hay partidos".

## New persistence (follow the established module pattern)
- picks collection, PickDoc matching the PlayerPick contract minus mapping concerns:
  { entryId, matchdayId (string 'league:mdN'), teamCode, createdAt } with driver
  ObjectId _id. Unique index (entryId, matchdayId) — one pick per entry per matchday;
  the upsert leans on it.
- ensureGameIndexes(db) in the game store, called from gameRoutes registration —
  the same pattern ensurePenkaIndexes/ensureAuthIndexes use. Do NOT extend the
  penkas helper and do NOT create indexes in buildApp.
- New mappers, mirroring toPenka/toEntry: toMatchday(doc) and toMatch(doc)
  (string _id passes through as id; Date → toISOString), plus toPlayerPick(doc).

## Endpoints (register gameRoutes in app.ts under /api/v1, after penkaRoutes)
- GET /api/v1/penkas/:penkaId/board  (public, no auth) → BoardResponse { board }
  Read model from Redis key `penka:{penkaId}:board`, cache-aside: on miss, build
  from Mongo, SET with TTL 60s, serve. Building the board:
  computeStandings(entries-as-contracts) for alive/island split; BoardPlayer needs
  displayName — EntryDoc has only userId, so look up users for names; points from
  the entry; pick is the runtime-gated field: ALWAYS null before lock; after lock,
  the entry's pick code for the current matchday or null. history comes from the
  resolutions collection once prompt 8 creates it — until then return [].
  nextPollInSec included (below).
- GET /api/v1/penkas/:penkaId/me (auth) → MyEntryResponse { myEntry }
  { lives, status, myPick (code|null), usedTeams }. 404 penka_not_found if the
  caller has no entry there (same error as unknown penka — don't leak existence).
- GET /api/v1/penkas/:penkaId/matchday/current → CurrentMatchdayResponse from the
  existing contract schema (matches via toMatch, lockAt, isLocked, isResolved).
- POST /api/v1/penkas/:penkaId/picks (auth) { teamCode } → SubmitPickResponse
  { myEntry } — the response is the UPDATED personal delta, per the contract.
  Upsert semantics until lock (the unique index arbitrates the race: on duplicate
  key, update instead). Validation delegated to @penka/game-engine validatePick —
  the API never inlines rules. Build the input object exactly as the engine
  expects: { entry, matchday, matches, teamCode, now: new Date().toISOString(),
  settings: penka.settings } — entry/matchday/matches mapped to contract types
  first. Map rejection codes: 409 matchday_locked / on_island, 422
  team_already_used / team_not_playing.

## nextPollInSec (server-driven polling)
Pure function (unit-tested): profile from Redis key `ops:pollingProfile`
(live|normal|slow per PollingProfileSchema, set by the back office later; missing
or unrecognized value → normal): slow → 30; live → 2; normal → 10, except
< 10 minutes before lockAt → 2.

## Rate limiting
If you add any throttling, use app.createRateLimit (never a second rateLimit hook)
with route-distinct key prefixes, and add it to the module's REQUIRED_DECORATORS.

## Tests
Unit: nextPollInSec matrix (all profiles × time-to-lock, including missing key);
board builder pick-gating (pre-lock null even when a pick exists).
Integration (Testcontainers Mongo + Redis; this module claims Redis DB /7–/8 for
any rate-limit test, documented at the top of the file):
- Privacy: pre-lock board JSON contains NO pick codes (every BoardPlayer.pick is
  null) and no usedTeams anywhere (assert deeply on the serialized JSON); after
  lockAt passes, picks visible, and a player without a pick shows null
- /me returns my delta and requires auth; non-member → 404 penka_not_found
- POST pick: happy path returns { myEntry } with myPick set; resubmission
  overwrites until lock (assert single pick document); locked → 409; used team →
  422; team not playing this matchday → 422; island user → 409
- Two penkas on the SAME league share the calendar: a pick in one never appears in
  the other's board or /me
- Cache-aside: first board call computes (Mongo queried), second is served from
  Redis; a POST pick does NOT invalidate the board (pre-lock the public board
  doesn't change)
makeTestConfig already gives a fresh database per call — override mongoDbName ONLY
if two app instances must share one database.

## Verification
- pnpm lint, pnpm build, pnpm test, pnpm test:integration --filter @penka/api
- Manual (env passthrough landed in 5b): pnpm dev --filter @penka/api; create
  penka, submit pick, read /board (all picks null) and /me (my pick present)