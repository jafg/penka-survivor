## Plan corrections (this prompt plan vs docs/CODEBASE-CONVENTIONS.md)

Read docs/CODEBASE-CONVENTIONS.md first; it is the source of truth. The corrections
below fix what THIS plan previously got wrong. Do not "fix" code to match older
prompt wording.

ENGINE (signatures are object-shaped, and resolve can refuse)
- validatePick(input: ValidatePickInput) — ONE input object:
  { entry, matchday, matches, teamCode, now, settings }. `now` is an ISO string;
  the engine never reads the system clock. `settings` is required.
- resolveMatchday(input: { matchday, entries, picks, matches, settings }) returns
  ResolveMatchdayResult = { ok: true, outcome } | { ok: false, code } where code is
  results_missing | already_resolved | matchday_not_locked. The engine REFUSES to
  resolve an unlocked matchday — closing/locking is a precondition of resolving.
- ResolutionOutcome carries matchdayId, matchdayNumber, effects[] (per entry:
  entryId, livesDelta 0|-1, pointsDelta 0|1, newLives, newStatus,
  teamConsumed: string|null), eliminatedEntryIds, summary. The persistence layer
  APPLIES these deltas; it never recomputes rules.
- All engine domain types come from @penka/contracts; picks are PlayerPick
  { id, entryId, matchdayId, teamCode, createdAt } — matchdayId is the derived
  string id ('league:mdN'), not a number. Engine team params are plain string.

CONTRACTS (game and admin schemas ALREADY EXIST — implement against them verbatim)
- Envelopes: BoardResponse = { board }, MyEntryResponse = { myEntry },
  SubmitPickResponse = { myEntry: MyEntrySchema } (submitting a pick returns the
  updated personal delta, not an ack).
- The submit route per the contract's own comment is POST /penkas/:penkaId/picks
  (POST, no "/current"). Board: GET /penkas/:penkaId/board. Me: GET /penkas/:penkaId/me.
- BoardPlayer as shipped is { displayName, lives } ONLY — no pick, no points. The
  product needs island points and post-lock picks, so prompt 5b evolves this
  contract deliberately (tests first), rewriting BoardSchema's privacy comment in
  the SAME commit: the invariant is refined (picks are public data once the
  matchday locks; the builder enforces null before lock), not violated. If you
  see `pick` on BoardPlayer next to the old "no picks" comment, that is a broken
  intermediate state — fix the comment, not the field.
- BoardHistoryItem = { matchday, eliminated: string[] (display NAMES), resolvedAt }.
- MyEntry = { lives, status, myPick: TeamCode|null, usedTeams } — no points field.
- CreatePenkaRequest.settings is REQUIRED as a field (its two inner fields are
  optional): clients must send at least settings: {}.
- The error set has 22 codes and is closed; it already includes matchday_not_locked,
  already_resolved, not_found, validation_failed, internal.
- PollingProfileSchema values are live | normal | slow — there is no "degraded".
  The profile's SCOPE is settled as GLOBAL: one deployment-wide load valve at
  Redis key ops:pollingProfile (the reader in apps/api already works this way,
  with slow → 30s). The admin contract shipped per-penka
  (PUT /admin/penkas/:penkaId/polling-profile) by mistake — prompt 7 fixes the
  contract FIRST (route becomes global, PenkaParams drops out) and moves
  POLLING_PROFILE_KEY to the shared package so both apps import the same
  constant. Editorial speed-up for a hot penka needs no operator: the <10-min
  lock proximity rule already accelerates it automatically.
- StrictObject is NOT exported from the contracts entrypoint — inside the package,
  deep-import './strict'; outside, you never need it.

PERSISTENCE
- Six collections exist: penkas, entries, matchdays, matches, users, refreshTokens.
  There is NO picks and NO resolutions collection yet — prompts 6 and 8 create them.
- TWO index helpers exist, each called from its route module's registration (never
  from buildApp): ensurePenkaIndexes and ensureAuthIndexes. New modules follow the
  same pattern: define their own ensure<Module>Indexes and call it on registration.
- Mappers to contracts exist for penkas/entries/users only (toPenka, toEntry,
  toPublicUser; Date→toISOString, ObjectId→hexString). There are NO toMatchday /
  toMatch mappers yet — prompt 6 creates them (string _id passes through as id).
- matchdayId(leagueId, number) lives in apps/api/src/modules/penkas/calendar.ts:10;
  match ids are an inline template `${matchdayId}:${HOME}-${AWAY}`. backoffice-api
  and workers CANNOT import from apps/api — prompt 7 moves these builders to a
  shared package.
- isDuplicateKeyError lives in penkas/mongo-errors.ts (bulk-aware: non-empty list,
  every error 11000); auth duplicates the check inline — known debt, unified in 5b.
- Untyped db.collection('matchdays') in tests COMPILES for reads; the string-_id
  typing only bites when writing or comparing _ids. Prefer the typed accessors.

API WIRING
- find-my-way (Fastify's router) DECODES path segments before the handler:
  :matchId arrives as 'a:b' from '/x/a%3Ab'; '%zz' → 400 pre-handler. Never
  decodeURIComponent a route param server-side (double-decode corrupts literal %).
  Clients must still encodeURIComponent when building URLs.
- Fixture reality: copa-libertadores md1 pairs RIV-ATN, BOC-CCO, FLA-NAC, PAL-PEN.
  'copa-libertadores:md1:RIV-ATN' is the canonical EXISTING match id;
  ':RIV-BOC' is well-formed but names no fixture — the canonical 404 case. Do not
  seed tests with RIV-BOC expecting success.
- Guards that exist beyond the plan (both protect against the one unrecoverable
  state — a matchday marked requested with nothing queued): setting a result on a
  resolved matchday → 409 already_resolved; resolving a league where no penka
  plays → 404 penka_not_found. Clients must render both.
- health.int.test.ts was folded into admin.int.test.ts (next to the auth suite
  proving /health is the only unguarded route). Do not restore a separate file.
- buildApp options: { config, logger?, generateJoinCode? }. AJV runs with
  removeAdditional:false on purpose (closed schemas must reject, not strip).
- Decorators available: mongo, db, redis, tokens, authenticate, plus
  createRateLimit/rateLimit from @fastify/rate-limit. penkaRoutes asserts
  [db, authenticate, createRateLimit]; authRoutes asserts [db, tokens, authenticate,
  rateLimit] but uses per-route config.rateLimit (it never calls app.rateLimit).
- There are TWO different 429 message wordings (plugin builder vs createRateLimit
  path). Accepted as-is; do not unify unless asked.
- Existing routes: /health, /api/v1/auth/{register,refresh,login}, /api/v1/me,
  /api/v1/me/penkas, /api/v1/catalog/leagues[/:leagueId], /api/v1/penkas,
  /api/v1/penkas/join. buildApp registers authRoutes, catalogRoutes, penkaRoutes
  under /api/v1 — prompt 6 adds gameRoutes there.

TEST HARNESS
- makeTestConfig(infra, overrides) creates a FRESH database PER CALL (random name).
  Do not pass mongoDbName except to make two app instances share one database
  (the existing rate-limit tests do exactly that). jwtSecret is fixed so tokens
  travel across instances. rateLimitMax defaults to 1000.
- startInfra() starts Mongo + Redis per test file (no shared global setup). It does
  NOT start RabbitMQ — prompt 7 extends the harness.
- failNextInsert(db, collectionName) exists as a transient-write-failure seam.
- Redis DB indexes claimed: /1–/4 auth, /5–/6 penkas. New modules start at /7.
- Test layout is enforced by config: src/**/*.test.ts = unit,
  test/**/*.int.test.ts = integration. A misplaced file silently never runs.

COMMANDS
- Verify loop: pnpm lint, pnpm build, pnpm test,
  pnpm test:integration --filter <package>. Never add pnpm format to it.
- turbo.json has NO env passthrough — `pnpm dev --filter @penka/api` drops
  JWT_SECRET. Fixed in prompt 5b; until then run the API from apps/api with env
  inline + pnpm exec tsx src/server.ts.