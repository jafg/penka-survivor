# @penka/config — shared presets

## Scope

Shared tooling presets consumed by every other package:

- `@penka/config/tsconfig/base.json`, `.../node.json`, `.../vue.json` — strict tsconfigs
- `@penka/config/eslint` and `@penka/config/eslint-vue` — ESLint flat configs (+ Prettier)
- `@penka/config/vitest` — `unitTestConfig` (`src/**/*.test.ts`) and
  `integrationTestConfig` (`test/**/*.int.test.ts`)

## Commands

- `pnpm test --filter @penka/config` — preset sanity tests
- `pnpm lint --filter @penka/config`

## Must NOT

- Never contain app or domain code — tooling presets only.
- Never relax strictness (e.g. disabling `strict`) for one consumer's convenience;
  fix the consumer instead.
- Never let a package hand-roll its own divergent config — extend the presets here.
