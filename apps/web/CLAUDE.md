# @penka/web — player app

## Scope

Player-facing Vue 3 + Vite + Pinia app: join penkas, make picks, follow standings.
Talks only to `@penka/api`.

## Commands

- `pnpm dev --filter @penka/web` — Vite dev server on port 5173 (strict)
- `pnpm test --filter @penka/web` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/web`
- `pnpm build --filter @penka/web` — production bundle

## Must NOT

- Never call `@penka/backoffice-api` — the player app only talks to the public API.
- Never re-implement game rules client-side — the UI displays server-computed state;
  any shared rule logic lives in `@penka/game-engine`.
- Never hand-write API payload types — import them from `@penka/contracts`.
