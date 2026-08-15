# @penka/game-engine — pure game rules

## Scope

The **only** place Survivor rules live: pick validation, elimination, matchday
resolution outcomes. Pure functions — data in, data out.

## Commands

- `pnpm test --filter @penka/game-engine` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/game-engine`
- `pnpm build --filter @penka/game-engine` — typecheck (`tsc --noEmit`)

## Must NOT

- **Never add a runtime dependency.** `dependencies` stays empty, forever.
- Never do I/O — no database, network, filesystem, or environment access.
- Never be nondeterministic — no `Date.now()`, no `Math.random()`; clocks and
  randomness come in as arguments.
- Never let rules leak out — if an app needs a rule, it calls this package.
