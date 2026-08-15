# @penka/backoffice-web — operator app

## Scope

Operator-facing Vue 3 + Vite + Pinia app: enter results, close matchdays, trigger and
monitor resolution. Talks only to `@penka/backoffice-api`.

## Commands

- `pnpm dev --filter @penka/backoffice-web` — Vite dev server on port 5174 (strict)
- `pnpm test --filter @penka/backoffice-web` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/backoffice-web`
- `pnpm build --filter @penka/backoffice-web` — production bundle

## Must NOT

- Never call the public `@penka/api` — operator flows go through the admin API only.
- Never include player-facing flows — this app is for operators.
- Never re-implement game rules client-side; never hand-write API payload types
  (use `@penka/contracts`).
