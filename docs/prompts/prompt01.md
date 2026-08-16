Read CLAUDE.md first. Work only inside packages/contracts. TDD: tests first.

Build the shared contracts package: TypeScript types + TypeBox schemas + canonical
error codes. This is the single source of truth for every API boundary.

## Domain types
League, Team, FixtureTemplate (matchday templates with lockAt offsets), Match,
Matchday (status: open|locked|resolved), User (never exposes passwordHash),
Penka (settings: { lives: number, islandEnabled: boolean }, joinCode),
Entry (lives, status: alive|island, usedTeams, points), Pick, Resolution,
Board (public, NO personal data: alive[], island[], history[], matchday, lockAt,
isLocked, isResolved, nextPollInSec), MyEntry (personal delta: lives, status,
myPick, usedTeams).

## API schemas (TypeBox)
Request/response pairs for every endpoint that later prompts will implement:
auth (register, login, refresh, me), catalog (leagues list/detail),
penkas (create, join, myPenkas), game (board, me, currentMatchday, submitPick),
admin (pools, matchday detail, setResult, close, resolve, setPollingProfile).

## Canonical error model
ApiError shape: { status, code, message }. Codes (exhaustive, exported as const):
invalid_credentials, email_taken, unauthorized, forbidden,
penka_not_found, invalid_join_code, join_code_space_exhausted,
matchday_locked, matchday_not_found, team_already_used, team_not_playing,
on_island, results_missing, already_resolved, invalid_outcome, invalid_profile,
rate_limited.

## Tests (write first)
- Schema validation: valid payloads pass, invalid ones fail with useful messages
  (wrong types, missing fields, extra fields rejected where additionalProperties: false)
- Board schema structurally CANNOT contain personal fields (compile-time: type test
  with expect-type or tsd; runtime: schema has no myPick/usedTeams)
- Error codes are unique

## Verification
- `pnpm test --filter @penka/contracts` green
- `pnpm build --filter @penka/contracts` emits types consumable by other packages