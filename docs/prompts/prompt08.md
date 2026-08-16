Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. TDD.
Work in apps/workers. This is the heart of the async design — the code a technical
reviewer will read first.

## Task 0 — prove the publisher's tests bite (before building against them)
The publisher (src/messaging/publisher.ts in backoffice-api) and its two
integration test files were written AFTER the implementation, not test-first —
a documented process deviation. Tests written post-hoc risk describing what the
code does instead of what it must do, and this consumer is about to be built
against exactly that contract. Cheap mutation check, ~10 minutes:
1. Temporarily break the publisher one mutation at a time: drop the messageId,
   change the routing key, make the body non-JSON, drop persistent delivery.
2. Run the backoffice-api integration suite after each mutation. Every mutation
   must make at least one test fail.
3. Revert all mutations. If any mutation SURVIVED, harden those tests first
   (that hardening is test-first by definition) and only then continue.
Record the outcome in one line — it goes in the AI development log either way.

## Consumer: matchday.resolution
Per message { penkaId, leagueId, matchday }:
1. Idempotency gate: `resolutions` collection (created HERE, matching the Resolution
   contract from @penka/contracts) with unique index (penkaId, matchdayId). If a
   resolution document already exists → ack and stop (no-op). Log it. Define
   ensureWorkerIndexes following the established per-module pattern.
2. Load state from Mongo with typed accessors, then map to CONTRACT types before
   touching the engine (the engine speaks contracts: ISO strings, string ids):
   - entries by penkaId → toEntry
   - matchday by _id = matchdayId(leagueId, matchday) and matches by matchdayId,
     using the shared id builders from prompt 7 → toMatchday / toMatch (the mappers
     prompt 6 created)
   - picks by (entryId in entries, matchdayId) → toPlayerPick
3. Call @penka/game-engine resolveMatchday({ matchday, entries, picks, matches,
   settings: penka.settings }). It returns a Result, not effects:
   - { ok: false, code: 'already_resolved' } → ack, log as no-op (second idempotency
     layer besides the resolutions gate)
   - { ok: false, code: 'matchday_not_locked' | 'results_missing' } → a race with
     the back office: nack with limited requeue (the retry path below); if it
     exhausts, DLQ — never ack these as success
   - { ok: true, outcome } → continue
4. APPLY outcome.effects — the worker never recomputes rules. Per effect (keyed by
   entryId, an ObjectId hex string → ObjectId.createFromHexString): set lives to
   newLives, status to newStatus, increment points by pointsDelta, append
   teamConsumed to usedTeams when non-null. Mark picks won/lost/void from the
   outcome. Insert the resolution document LAST (it is the idempotency marker), or
   use a Mongo session. This is a multi-step write: if you fan updates out
   concurrently, use Promise.allSettled and inspect every result — Promise.all
   short-circuits and hides partial failures. Any compensation goes through a
   logging helper, mirroring discardPenka.
5. Recompute the public board and SET Redis `penka:{penkaId}:board`, matching
   EXACTLY the shape apps/api serves — reuse the same builder: extract it from
   apps/api into a shared location if needed (post-lock, picks are now visible per
   the 5b contract). Board history now comes from resolutions (eliminated carries
   display NAMES per BoardHistoryItem).
6. ack.

## Failure handling
- Processing error → nack with requeue up to 3 attempts (track via x-death or a
  retry header), then route to DLQ
- Poison message (invalid JSON / schema) → straight to DLQ, no requeue
- prefetch = 1 (ordering per queue is acceptable for MVP; note the scale path:
  consistent-hash exchange or one queue per shard)
- Graceful shutdown: stop consuming, finish in-flight message, close connections

## Tests (integration, Testcontainers Mongo + Redis + RabbitMQ — full pipeline;
this module claims Redis DB /11–/12, documented at the top of the test file)
- Happy path: close the matchday, publish a resolve message → poll until state
  settles → entries match what the pure resolveMatchday outcome predicts (compute
  the expected outcome with the engine in the test and deep-compare the applied
  state), resolution document exists, Redis board updated with picks now visible
- IDEMPOTENCY (the key test): publish the SAME message twice (same messageId) →
  final state identical to single delivery; second processing logged as no-op
- Engine no-op path: a message for an already-resolved matchday (resolutions doc
  removed to bypass the gate) → engine returns already_resolved → ack, no state
  change
- Race path: a message for a still-OPEN matchday → matchday_not_locked → limited
  requeue then DLQ; state untouched
- Shared calendar: two penkas on the same league, one resolve message each →
  both resolve correctly against the same matchday/matches documents, and each gets
  its own resolution document and its own Redis board key
- Redelivery after crash simulation: nack once, message redelivered, still exactly
  one resolution document
- Poison message lands in matchday.resolution.dlq; queue keeps processing others
- Retry exhaustion routes to DLQ after 3 attempts
Seed fixtures with uppercase alphanumeric team codes (TeamCodeSchema is
^[A-Z0-9]{2,5}$). makeTestConfig gives a fresh database per call — the worker and
the seeding side of the test must share ONE database, so pass the same mongoDbName
to both explicitly.

## Verification
- pnpm lint, pnpm build, pnpm test, pnpm test:integration --filter @penka/workers
- End-to-end manual: infra up, api + backoffice-api + workers running, create penka,
  pick, set results, resolve → GET board shows the resolved state