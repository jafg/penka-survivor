Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. TDD.
Work in apps/backoffice-api, plus a small shared messaging module (put topology
constants and the shared id builders in @penka/contracts or a new packages/messaging
— your call, justify it in the PR description).

Admin API for operators. Auth: header X-Admin-Key checked against env ADMIN_API_KEY
(MVP decision, documented; production path is role-based users).

## Write model decision (already made — implement exactly this)
- Match results and matchday close are SYNCHRONOUS writes to Mongo.
- Matchday RESOLUTION is asynchronous: the endpoint validates and PUBLISHES commands
  to RabbitMQ; workers (next prompt) consume them.

## Identifiers — read before writing routes
matchdays and matches have deterministic string _ids ('copa-libertadores:md1',
'copa-libertadores:md1:RIV-BOC') and are keyed by leagueId, never penkaId. So:
- Result and close/resolve routes are LEAGUE-scoped, not penka-scoped.
- :matchId contains colons. Colons are legal in a path segment, and find-my-way
  (Fastify's router) ALREADY decodes it — the handler receives 'a:b' from
  '/x/a%3Ab', and a malformed escape ('%zz') is rejected with 400 before the
  handler runs. Never call decodeURIComponent server-side: a second decode
  corrupts any id containing a literal %. Clients still MUST encodeURIComponent
  when building the URL. Test with both encoded and raw forms.
- Use the module's typed collection accessors, mirroring the apps/api pattern.
- Resolving a matchday fans out to every penka on that league: query penkas by
  leagueId to build the message list.
- matchdayId(leagueId, number) and the inline match-id template currently live in
  apps/api/src/modules/penkas/calendar.ts — this app CANNOT import from apps/api.
  Move both deterministic id builders to the shared package you create for the
  topology (below), update apps/api to import from there, and delete the originals.
  Derived ids are part of the cross-app contract now.

## Contracts already exist — implement, don't invent (one exception below)
@penka/contracts/api/admin already exports every schema this app needs
(AdminPoolsResponse, AdminMatchdayDetailResponse, SetResultRequest/Response,
CloseMatchdayResponse, ResolveMatchdayResponse, SetPollingProfileRequest/Response,
MatchdayParams, PollingProfile). Read them first and implement the routes against
them verbatim. If a shape genuinely cannot express the behavior, change the
contract FIRST, tests first, as its own commit.

## Polling profile: settle the scope conflict (contract change, own commit, FIRST)
Two designs currently pass each other: the api reader uses one GLOBAL Redis key
(ops:pollingProfile), while the admin contract declares a per-penka operation
(PUT /admin/penkas/:penkaId/polling-profile). The settled semantics is GLOBAL —
the profile is a deployment-wide load valve ("how hard may clients hammer us right
now"), which is the feature's origin; editorial speed-up for a hot penka needs no
operator because the <10-min lock-proximity rule already handles it. Therefore:
1. Contract first (own commit): the route becomes PUT /admin/v1/polling-profile —
   no penkaId, PenkaParams drops out of it. Body stays { profile } with
   PollingProfileSchema (live | normal | slow — "degraded" does not exist).
   Update contract tests.
2. Move POLLING_PROFILE_KEY from apps/api/src/modules/game/polling.ts into the
   shared package (same home as the id builders). Both apps import the SAME
   constant — nothing else type-checks a key name across the app boundary.
   Update apps/api to import it; delete the original.
3. Document the rejected alternative in one line where the key lives: a per-penka
   override with global fallback (penka:{id}:pollingProfile → ops:pollingProfile
   → normal) is the upgrade path if editorial control is ever wanted.

## RabbitMQ topology (declare idempotently on boot)
- Exchange: `survivor.commands` (topic, durable)
- Queue: `matchday.resolution` (durable) bound to `matchday.resolve.*`
- DLX: `survivor.dlx` → queue `matchday.resolution.dlq`
- Messages: one per penka of the league, routing key `matchday.resolve.{penkaId}`,
  messageId `resolve:{penkaId}:{matchday}` (deterministic — idempotency anchor),
  persistent delivery, JSON body { penkaId, leagueId, matchday, requestedAt }
- Extend the integration harness: startInfra() today starts only Mongo + Redis.
  Add rabbitmq (same image as infra/docker-compose.yml) behind the same TestInfra
  interface, without breaking the existing apps/api tests that don't need it
  (make it opt-in or a separate startInfraWithRabbit helper — your call, justify).

## Lock is a precondition of resolve
The engine refuses to resolve an unlocked matchday (ResolveMatchdayResult
ok:false, code matchday_not_locked — the code already exists in contracts).
Mirror that at the API boundary: resolve on an open matchday → 409
matchday_not_locked, nothing published. The operator flow is close → results →
resolve (results can be loaded anytime; in practice they arrive after kickoff,
which IS lockAt).

## Multi-step write on resolve
Marking the matchday resolved-requested and publishing N messages is a multi-step
write with partial-failure risk. Follow the module's established pattern: run the
legs concurrently with Promise.allSettled, inspect EVERY settled result, and
compensate through a logging helper (mirroring discardPenka) rather than throwing
from the compensation. Promise.all is wrong here — it short-circuits and leaves the
other leg unobserved. Decide and document which way the operation fails:
prefer publishing first and marking after, so a crash leaves duplicate messages
(harmless — the workers are idempotent) rather than a matchday marked as requested
with nothing in the queue.

## Endpoints
- GET  /admin/v1/penkas → operational view (players, alive, island, picksReceived,
  resolvedMatchdays)
- GET  /admin/v1/leagues/:leagueId/matchdays/:number → matches + status + pollingProfile
- POST /admin/v1/matches/:matchId/result { outcome: home|draw|away } → sync write;
  response includes pendingMatches and readyToResolve
- POST /admin/v1/leagues/:leagueId/matchdays/:number/close → sync lock
  (409 already_resolved)
- POST /admin/v1/leagues/:leagueId/matchdays/:number/resolve
  → 409 matchday_not_locked if still open; 409 results_missing if any match lacks
    an outcome; otherwise marks resolved-requested and publishes one message per
    penka on the league
- PUT  /admin/v1/polling-profile { profile: live|normal|slow } → writes Redis
  POLLING_PROFILE_KEY (the shared constant; 422 invalid_profile)
The 22-code error set is closed; do not invent codes. If new indexes are needed,
define an ensure<Module>Indexes in this app's store, called on route registration
(the established pattern).

## Tests
Integration (Testcontainers Mongo + Redis + RabbitMQ; this module claims Redis DB
/9–/10 for any rate-limit test, documented at the top of the file):
- Auth: missing/wrong admin key → 401
- setResult persists and computes pendingMatches correctly, using a real colon-bearing
  matchId ('copa-libertadores:md1:RIV-ATN' — that IS the md1 fixture; ':RIV-BOC' is
  well-formed but names no match and is the canonical 404 case)
- setResult on a RESOLVED matchday → 409 already_resolved (guards the requested-
  with-nothing-queued state)
- resolve on an OPEN matchday → 409 matchday_not_locked, queue empty
- resolve with missing results (matchday closed) → 409 results_missing, queue empty
- resolve happy path publishes exactly one message per penka ON THAT LEAGUE, with
  correct routing key, messageId and body (consume from a test channel to assert);
  seed two penkas on the same league and one on another league to prove the fan-out
  boundary
- polling-profile PUT with 'slow' round-trips into Redis via the SHARED
  POLLING_PROFILE_KEY, and a board request served by an apps/api instance on the
  same Redis now returns nextPollInSec 30 (the cross-app write→read pair, proven
  end to end); invalid value → 422 invalid_profile
- Partial failure on resolve: make the publish leg fail (inject a broken channel)
  and assert the matchday is NOT left marked as resolved-requested, and that the
  compensation logged instead of throwing a second error over the first
makeTestConfig gives a fresh database per call — override mongoDbName only to share
one database between two app instances. Uppercase alphanumeric team codes in every
fixture (TeamCodeSchema is ^[A-Z0-9]{2,5}$).

## Verification
- pnpm lint, pnpm build, pnpm test,
  pnpm test:integration --filter @penka/backoffice-api
- RabbitMQ management UI shows exchange/queues after boot