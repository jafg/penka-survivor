Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md. TDD: contracts change tests-first.
This is a small, deliberate contract-evolution + hygiene pass. Scope is EXACTLY the
four tasks below — nothing else.

## 1. Evolve the public Board contract (packages/contracts)
The shipped BoardPlayer is { displayName, lives }, but the product's board shows
island points and, after lock, everyone's pick. Extend deliberately:
- BoardPlayerSchema gains:
    points: Type.Integer({ minimum: 0 })
    pick: Type.Union([TeamCodeSchema, Type.Null()])
  Semantics (write them as schema comments): `pick` is ALWAYS null before the
  matchday locks; after lock it is the played code, or null when the player never
  picked. Clients distinguish "hidden" from "no pick" via board.isLocked. There is
  NO pickHidden flag.
- ATOMICITY: BoardSchema's own comment (domain.ts:204-208) currently states the
  invariant as "must NEVER carry personal data (no picks, no used teams…)".
  Adding `pick` without rewriting that comment leaves a schema that contradicts
  its stated invariant, and the next reader will treat the field as a violation.
  Field, comment rewrite, and test updates land in the SAME commit — never a
  commit where schema and invariant disagree.
- The comment rewrite is a REFINEMENT of the invariant, not an exception. State
  the precise rule and its product rationale: the board never carries usedTeams,
  emails, or anything identifying the viewer; a pick becomes PUBLIC data the
  moment the matchday locks — revealing everyone's pick at lock is part of the
  Survivor format, not a leak — and the board builder enforces null before lock
  at runtime.
- Update the contracts type/privacy tests to the refined rule: usedTeams and
  viewer identity remain structurally impossible; `pick` exists and the test
  suite documents the lock-gated semantics (runtime enforcement is
  integration-tested in the game module, prompt 6).
- Update test-support fixtures accordingly.

## 2. Unify duplicate-key detection (apps/api)
auth/routes.ts inlines `error.code === 11000`; penkas/mongo-errors.ts exports the
bulk-aware isDuplicateKeyError. Move isDuplicateKeyError to a module-neutral
location inside apps/api (e.g. src/lib/mongo-errors.ts), keep the penkas re-export
if churn is high, switch auth to use it, delete the inline check. Tests: the
existing auth duplicate-email test still passes; add a unit test for the helper
covering MongoServerError, bulk with all-11000, bulk with mixed codes, bulk with
empty list (must be false).

## 3. Turbo env passthrough (root)
Add to turbo.json the env declarations so `pnpm dev` and turbo-run tasks forward
what the apps read at boot: JWT_SECRET, MONGO_URL, MONGO_DB_NAME, REDIS_URL,
RATE_LIMIT_MAX, TRUST_PROXY, PORT (audit apps/api/src/config.ts for the exact list
and use it). Verify `pnpm dev --filter @penka/api` now boots with exported env vars,
no inline workaround.

## 4. Document the accepted inconsistencies (docs/CODEBASE-CONVENTIONS.md)
Append a short "Accepted as-is" note: the two different 429 message wordings, and
engine team params being plain string while contracts brand TeamCodeSchema. One
line of rationale each. Do not change the behavior.

## Verification
- pnpm lint, pnpm build, pnpm test, pnpm test:integration --filter @penka/api
- `pnpm dev --filter @penka/api` boots with env exported in the shell (no inline env)
- git diff shows contracts changes covered by updated tests, not silent edits