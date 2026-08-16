# @penka/contracts — shared types & schemas

## Scope

Single source of truth for everything crossing a boundary: TypeBox schemas for API
requests/responses, message payloads, and the canonical `ErrorCodes`. Types are derived
from schemas with `Static<>` — schema first, type second.

Also the home of **names two apps must agree on byte for byte**: the Redis key the back
office writes and the public API reads (`POLLING_PROFILE_KEY`), the deterministic
document ids (`matchdayId`, `matchId`), and the RabbitMQ topology and routing keys. A
key or an id template is the one thing no compiler checks across an app boundary, so it
belongs to the contract rather than to whichever app happened to need it first.

## Conventions

- **A team is a catalog code, never a generated id.** `TeamCodeSchema` (2–5 chars) types
  every team-shaped field: `Match.homeTeamCode`/`awayTeamCode`, `PlayerPick.teamCode`,
  `Entry.usedTeams`, `MyEntry.myPick`/`usedTeams`, `BoardPlayer.pick`, and
  `SubmitPickRequest.teamCode`. The
  catalog is fixed data and owns team identity, so there are no team documents to point
  at; codes are unique within a league and every match belongs to exactly one league.

## Commands

- `pnpm test --filter @penka/contracts` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/contracts`
- `pnpm build --filter @penka/contracts` — typecheck (`tsc --noEmit`)

## Must NOT

- Never contain runtime/business logic — schemas, types, constants, and pure,
  dependency-free derivations of the names above (an id template, a routing key). A
  **game rule** belongs to `@penka/game-engine` and **I/O** belongs to an app; if a
  function here would need either, it is in the wrong package.
  - `nextPollInSec` (`ops.ts`) is the one function here that is not a name
    derivation, and it is deliberate. It is a **serving** policy, not a game rule:
    nothing about it decides who survives, it only says how often a client should
    come back. It has to be shared because `@penka/api` and `@penka/workers` both
    write the same board read model, and a cadence that differed between the two
    would make the interval flap depending on who wrote the entry last. It stays
    pure and dependency-free like everything else here, so `@penka/game-engine`
    would take it too — the reason it is here instead is that the engine is for
    rules of the game and this is a rule of the deployment.
- Never let an app define its own request/response shape — if a shape is missing,
  add it here first.
- Never add error codes casually — `ErrorCodes` is the canonical, closed set; extending
  it is a deliberate, reviewed decision.
