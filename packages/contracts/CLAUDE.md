# @penka/contracts — shared types & schemas

## Scope

Single source of truth for everything crossing a boundary: TypeBox schemas for API
requests/responses, message payloads, and the canonical `ErrorCodes`. Types are derived
from schemas with `Static<>` — schema first, type second.

## Commands

- `pnpm test --filter @penka/contracts` — unit tests (`src/**/*.test.ts`)
- `pnpm lint --filter @penka/contracts`
- `pnpm build --filter @penka/contracts` — typecheck (`tsc --noEmit`)

## Must NOT

- Never contain runtime/business logic — schemas, types, and constants only.
- Never let an app define its own request/response shape — if a shape is missing,
  add it here first.
- Never add error codes casually — `ErrorCodes` is the canonical, closed set; extending
  it is a deliberate, reviewed decision.
