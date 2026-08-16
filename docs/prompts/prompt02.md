Read CLAUDE.md first. Work only inside packages/game-engine. It imports types from
@penka/contracts and NOTHING else at runtime. Pure functions only: no I/O, no dates
from the system clock (time comes in as arguments), no randomness.

This package encodes the Survivor rules:
1. Each matchday, each alive entry picks ONE team playing that matchday.
2. Team wins → entry survives. Draw or loss → entry loses one life.
3. No pick submitted by lock → loses one life.
4. A team cannot be repeated by the same entry during the tournament.
5. Lives are configurable per penka (default 2).
6. At 0 lives the entry moves to the Island: keeps picking, earns 1 point per
   correct pick, ranked separately. Island entries never lose further lives.
7. Winner: last alive. If several alive at tournament end: most lives, then most
   total correct picks.

## API to implement (suggested, adjust names if clearer)
- validatePick(entry, matchday, matches, teamCode, now): Result<ok, ErrorCode>
  → covers matchday_locked, team_already_used, team_not_playing, on_island
- resolveMatchday(input: { entries, picks, matches, settings }): ResolutionOutcome
  → returns per-entry effects (livesDelta, newStatus, pointsDelta, teamConsumed),
    eliminated names, and a deterministic summary. Does NOT mutate input.
- computeStandings(entries): { alive[], island[] } with the documented sort order
- rankWinners(entries, allPicks): final ordering with tiebreakers

## Tests FIRST — cover at minimum
- win / draw / loss / no-pick life outcomes
- island entry with correct pick gains a point; island never loses lives
- elimination transition exactly at 0 lives; never negative lives
- team repetition rejected; team not playing this matchday rejected
- lock semantics via injected `now` vs lockAt
- determinism: resolveMatchday(x) === resolveMatchday(x) (deep equal) and input
  is not mutated (freeze inputs in tests)
- resolving the same matchday effects twice must be detectable by the caller:
  outcome includes matchday number so persistence layer can enforce idempotency
- tiebreakers: lives first, then correct-pick count
- property-style test: for random valid scenarios, total entries is conserved
  (alive + island counts always sum to input entries)

Target: 100% line and branch coverage on this package. Add `pnpm test:coverage`.

## Verification
- `pnpm test --filter @penka/game-engine` green, coverage report ~100%
- `grep -r "import" src/` shows only @penka/contracts and local files