# AI development log

Every prompt that produced code in this repository, what was handed to the assistant, and
what a human did with the answer afterwards.

The point of this file is the **fourth column**. Anyone can generate code; what makes the
result trustworthy is the record of what was read, questioned, rewritten or thrown away
before it was committed. A row whose "Reviewed / changed" cell says nothing is a row where
the review has not happened yet.

## How to fill a row

| Column               | What goes in it                                                                 |
| -------------------- | ------------------------------------------------------------------------------- |
| **Date**             | ISO date the prompt was run.                                                     |
| **Prompt**           | The prompt verbatim, or a link to it. Summaries hide what was actually asked.     |
| **Delegated**        | What the assistant was asked to produce, in one line.                             |
| **Reviewed / changed** | What the human checked, what they corrected, what they rejected. `—` means nothing was changed; **`TODO`** means the review has not happened. |
| **Tests added**      | The suites that came with the change, named so they can be found.                 |

Conventions:

- One row per prompt, in order. A prompt that was re-run after a correction gets a suffixed
  number (`5b`), not a rewritten row.
- Commits are listed newest-last, exactly as they landed.
- `TODO` is a real value. Leave it in rather than writing something vague.

---

## Log

| #    | Date       | Prompt                                                       | Delegated                                                                                                   | Reviewed / changed | Tests added                                                                            |
| ---- | ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| 0    | 2026-08-15 | _prompt text — TODO_                                          | Monorepo skeleton: pnpm workspaces, Turborepo, shared tsconfig/eslint/vitest presets, `infra/docker-compose.yml`, the `CLAUDE.md` set. <br>`63a194b` | TODO               | Preset and workspace smoke tests across `packages/config`.                              |
| 1    | 2026-08-15 | _prompt text — TODO_                                          | `@penka/contracts`: domain schemas, API request/response contracts, the 22 canonical error codes. <br>`25cd4c1` | TODO               | `packages/contracts/src/**/*.test.ts` — one suite per schema module.                    |
| 2    | 2026-08-15 | _prompt text — TODO_                                          | `@penka/game-engine`: pick validation, resolution, standings, board — pure, 100% coverage. <br>`91a9fe9`      | TODO               | `resolve-matchday`, `standings`, `validate-pick`, `time`, plus a property-based suite.   |
| 3    | 2026-08-15 | _prompt text — TODO_                                          | `@penka/api` bootstrap and authentication: Fastify 5, argon2, JWT access/refresh, rate limiting. <br>`4eb7f8e` | TODO               | Auth unit suites + `test/**/*.int.test.ts` against Testcontainers Mongo/Redis.           |
| 4    | 2026-08-15 | _prompt text — TODO_                                          | Catalog module: six hardcoded leagues, teams and relative-offset fixture templates. <br>`a1cd1da`             | TODO               | Catalog route and data suites.                                                          |
| 5    | 2026-08-15 | _prompt text — TODO_                                          | Penkas module: create, join by 4-digit code, my penkas, calendar materialization. <br>`e923e18`, then the corrections `fca356b` (team codes, not generated ids), `66df0f6` (materialization completeness + duplicate-key detection), `c56bf74` (partial-failure compensation), `70e3777` (one bulk-aware duplicate-key helper) | TODO               | Join-code, calendar and store suites; penkas integration suite.                          |
| 5b   | 2026-08-15 | _prompt text — TODO_                                          | Make `turbo` forward the environment the API reads at boot (`globalPassThroughEnv`). <br>`23a9563`            | TODO               | None — configuration only. Verified by booting the stack with an exported `JWT_SECRET`.  |
| 6    | 2026-08-15 | _prompt text — TODO_                                          | Game module: public board, personal delta, current matchday, submit pick. <br>`ec3c084`, then `25fd3b2` (reveal picks and points once a matchday locks), `5b8ea23` (polling profile made deployment-wide) | TODO               | Game route suites + the integration tests that hold the pre-lock pick invariant.         |
| 7    | 2026-08-15 | _prompt text — TODO_                                          | Move shared machinery into the contract: derived ids and the RabbitMQ topology (`acdbefd`), the league-scoped admin contract (`d412c64`), `selectCurrentMatchday` into the engine (`433a731`). | TODO               | `ids`, `messaging` and `current-matchday` suites.                                        |
| 8    | 2026-08-15 | _prompt text — TODO_                                          | `@penka/backoffice-api`: admin-key guard, results, close, league-scoped resolve, polling profile. <br>`b821be0` | TODO               | Admin route suites + integration suites on Redis `/9`–`/10`.                             |
| 9    | 2026-08-15 | _prompt text — TODO_                                          | `@penka/workers`: consume `matchday.resolution`, apply effects, finalize, rebuild the board cache. <br>`5f29f68` | TODO               | Handler decision-table suites + integration suites on Redis `/11`–`/12`.                 |
| 10   | 2026-08-16 | _prompt text — TODO_                                          | `@penka/web`: the player app on the prototype's design. <br>`f5b40de`, then `2c08288` (ask the engine whether a pick's team won, instead of re-deriving it) | TODO               | Component, store and router suites with MSW-backed API doubles.                          |
| 11   | 2026-08-16 | _prompt text — TODO_                                          | `@penka/backoffice-web`: the operator console for the admin API. <br>`f9e9d03`                                | TODO               | View, client and parity suites.                                                          |
| 12   | 2026-08-16 | "Read CLAUDE.md, docs/CODEBASE-CONVENTIONS.md, and the plan corrections. Final integration pass." (five tasks: Playwright e2e, `pnpm demo`, this README, this log, regenerate the conventions audit) | New `e2e/` workspace with two Playwright specs, `scripts/demo.mjs`, `.env.example`, root `README.md`, this file, and a regenerated `docs/CODEBASE-CONVENTIONS.md`. | TODO               | `e2e/tests/demo-script.spec.ts`, `e2e/tests/shared-league.spec.ts` — no new unit tests; the existing suites are unchanged. |

---

## Notes worth keeping

Things that came out of the review loop rather than out of a prompt, recorded here because
they explain why some rows have corrections attached.

- **Prompt 5's corrections were all one theme**: the first answer invented ids where the
  domain already had names (team ids over catalog codes) and trusted happy paths where the
  database was the only real arbiter (collision checks before insert, partial writes with
  no compensation). Four follow-up commits, no rewrites.
- **Prompt 6 shipped a per-penka polling profile** and it was reverted to one global key in
  `5b8ea23`. The reasoning is in `POLLING_PROFILE_KEY`'s own comment: a load valve that
  looks like a feature will be used as one.
- **Prompt 7 exists because prompts 5, 6 and 8 were each about to grow their own copy** of
  the id builders and the queue names. Moving them into `@penka/contracts` was cheaper than
  reconciling three of them later.
- **Prompt 9's hardest part was not the consumer**, it was deciding when a shared matchday
  is finished: `finalizeMatchday` flips its status only once every penka on the league has
  a resolution document.
- **Prompt 12 found one gap in 5b**: `globalPassThroughEnv` was missing `PREFETCH`,
  `MAX_ATTEMPTS` and `LOG_LEVEL`, which `@penka/workers` reads. Added along with the
  `VITE_*` variables the two Vue apps read.
