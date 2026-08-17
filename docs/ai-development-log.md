# AI development log

Every prompt that produced code in this repository, what was handed to the assistant, and
what a human did with the answer afterwards.

The point of this file is the **fifth column**. Anyone can generate code; what makes the
result trustworthy is the record of what was read, questioned, rewritten or thrown away
before it was committed. A row whose "Reviewed / changed" cell says nothing is a row where
the review has not happened yet.

Every prompt is stored verbatim in [`docs/prompts/`](./prompts/) and the table links to it.
Row numbers are the prompt file names, not a separate numbering.

## Where the prompts came from

The prompt list was **not** written by hand one prompt at a time. It was generated in one
pass from a design specification, in the Claude chat interface, using **Fable 5**: the spec
went in, and a numbered plan of implementation prompts came out — `prompt0.md` through
`prompt11.md`, each scoped to one package or module, each with its own verification block.
That plan is what `docs/prompts/` holds.

A generated plan is a hypothesis about the code, and it started drifting from the code
almost immediately. **Every prompt's output was code-reviewed before the next prompt ran**,
and the plan was edited whenever a review found it had guessed wrong — which is why several
rows below carry follow-up commits and why the prompts from `prompt05b.md` onward all open
with *"Read CLAUDE.md and docs/CODEBASE-CONVENTIONS.md"*. The corrections were fed back into
the plan rather than patched into the code after the fact.

### `prompt_plan_corrections.md`, and why it sits between 5 and 5b

By the end of prompt 5 the drift was large enough to be worth writing down in one place
instead of correcting prompt by prompt. So the review at that point was done properly: a
**read-only audit** of the whole tree produced `docs/CODEBASE-CONVENTIONS.md` (`490cdfa`,
1852 lines, no code changes), and the plan was then diffed against that audit. Everywhere
the two disagreed, the audit won — it describes code that exists, the plan only described
code someone intended.

[`prompt_plan_corrections.md`](./prompts/prompt_plan_corrections.md) is the result of that
diff, and it enters the sequence **between `prompt05.md` and `prompt05b.md`**. Its opening
line is the whole policy:

> Read docs/CODEBASE-CONVENTIONS.md first; it is the source of truth. The corrections below
> fix what THIS plan previously got wrong. Do not "fix" code to match older prompt wording.

It carried forward from there: it is what re-scoped prompt 5b (evolve `BoardPlayer`
deliberately, tests and privacy comment in the same commit), told prompt 7 to fix the admin
contract *before* implementing against it, and corrected the engine signatures, the route
paths, the collection inventory and the fixture ids the plan had assumed. `prompt11.md`
names it explicitly in its first line.

## How to fill a row

| Column                 | What goes in it                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt**             | Link to the prompt file. It is stored verbatim; summaries hide what was actually asked.                                                   |
| **Date**               | ISO date the prompt was run.                                                                                                              |
| **Delegated**          | What the assistant was asked to produce, and the commits that came back.                                                                  |
| **Reviewed / changed** | What the review found, what it corrected, what it rejected. `—` means the answer was taken as-is; `TODO` means the review has not happened. |
| **Tests added**        | The suites that came with the change, named so they can be found.                                                                         |

Conventions:

- One row per prompt file, in order. A prompt that was re-run after a correction gets a
  suffixed number (`5b`), not a rewritten row.
- Commits are listed newest-last, exactly as they landed.
- A correction commit **is** review evidence. Where a row's fifth cell cites commits, those
  commits are the record — the follow-up landed, so the review happened.
- `TODO` is a real value. Leave it in rather than writing something vague.

---

## Log

| #   | Prompt                                                            | Date       | Delegated                                                                                                                                                                                       | Reviewed / changed                                                                                                                                                                                                                                                                                | Tests added                                                                                                            |
| --- | ----------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0   | [`prompt0.md`](./prompts/prompt0.md)                              | 2026-08-15 | Monorepo skeleton: pnpm workspaces, Turborepo, shared tsconfig/eslint/vitest presets, `infra/docker-compose.yml`, the `CLAUDE.md` set. `63a194b`                                                 | Taken as-is — no follow-up commits. The stack decisions were pinned in the prompt itself ("do not change them") precisely so this row would have nothing in it.                                                                                                                                    | `packages/config` preset smoke tests.                                                                                  |
| 1   | [`prompt01.md`](./prompts/prompt01.md)                            | 2026-08-15 | `@penka/contracts`: domain schemas, API request/response contracts, the 22 canonical error codes. `25cd4c1`                                                                                      | Taken as-is at the time. Two shapes it shipped were later found wrong by the audit and fixed where they belonged: `BoardPlayer` was missing points and picks (prompt 5b), and the polling-profile route shipped per-penka (prompt 7).                                                               | One suite per schema module in `packages/contracts/src/`.                                                              |
| 2   | [`prompt02.md`](./prompts/prompt02.md)                            | 2026-08-15 | `@penka/game-engine`: pick validation, resolution, standings — pure, zero runtime deps, 100% coverage. `91a9fe9`                                                                                 | Taken as-is. The purity constraint held for the rest of the project: every later prompt that needed a rule moved code *into* this package rather than around it (`433a731`, `5f29f68`, `2c08288`).                                                                                                 | `validate-pick`, `resolve-matchday`, `standings`, `time`, `index`, plus `property.test.ts`.                            |
| 3   | [`prompt03.md`](./prompts/prompt03.md)                            | 2026-08-15 | `@penka/api` bootstrap and authentication: Fastify 5, argon2, JWT access/refresh, rate limiting. `4eb7f8e`                                                                                       | Taken as-is. The review noted one piece of debt rather than fixing it inline: auth inlined its own `error.code === 11000` check instead of a shared helper. Recorded, then paid off in prompt 5b (`70e3777`).                                                                                       | Auth unit suites + `apps/api/test/integration/auth.int.test.ts` (Testcontainers Mongo/Redis).                          |
| 4   | [`prompt04.md`](./prompts/prompt04.md)                            | 2026-08-15 | Catalog module: six hardcoded leagues, teams and relative-offset fixture templates. `a1cd1da`                                                                                                    | Taken as-is. The relative offsets are what later made the e2e suite deterministic — a fresh calendar always has an open matchday — so the decision was left alone deliberately.                                                                                                                    | Catalog route and data suites.                                                                                         |
| 5   | [`prompt05.md`](./prompts/prompt05.md)                            | 2026-08-15 | Penkas module: create, join by 4-digit code, my penkas, calendar materialization. `e923e18`                                                                                                      | **Three corrections, one theme**: the answer invented ids where the domain already had names, and trusted happy paths where the database was the only real arbiter. `fca356b` teams become catalog codes, not generated ids; `66df0f6` materialization checks matches too, and duplicate-key detection becomes bulk-aware; `c56bf74` partial writes get logged compensation. No rewrites — four commits on top. | Join-code, calendar, materialize and store suites; `apps/api/test/integration/penkas.int.test.ts`.                     |
| —   | [`prompt_plan_corrections.md`](./prompts/prompt_plan_corrections.md) | 2026-08-15 | **Not a build prompt.** A read-only audit of the tree, which produced `docs/CODEBASE-CONVENTIONS.md` (`490cdfa`, 1852 lines, zero code changes); the plan was then diffed against it.        | This *is* the review, written down. It corrected the plan's engine signatures, envelope shapes, route paths, collection inventory, index helpers, Redis claims and fixture ids, and it named the two contract bugs prompts 5b and 7 then fixed. From here on the audit outranks the plan.           | None — documentation only, by design. The audit prompt is not in `docs/prompts/`; prompt 11 re-runs it from memory of its own instructions. |
| 5b  | [`prompt05b.md`](./prompts/prompt05b.md)                          | 2026-08-15 | A scoped contract-evolution + hygiene pass, four tasks: evolve `BoardPlayer`, unify duplicate-key detection, add turbo env passthrough, document accepted inconsistencies. `25fd3b2`, `70e3777`, `23a9563` | The prompt was written to forbid the failure mode the review feared: `BoardPlayer.pick` had to land in the **same commit** as the rewritten privacy comment and the updated tests, so no commit exists where the schema contradicts its stated invariant. `25fd3b2` did exactly that.                | `domain.test.ts` privacy cases rewritten to the refined rule; `apps/api/src/lib/mongo-errors.test.ts` (single, bulk all-11000, bulk mixed, bulk empty). |
| 6   | [`prompt06.md`](./prompts/prompt06.md)                            | 2026-08-15 | Game module: public board, personal delta, current matchday, submit pick — implemented against the existing contracts verbatim. `ec3c084`                                                        | **One reversion.** It shipped a per-penka polling profile; `5b8ea23` cut it back to one deployment-wide key and moved `POLLING_PROFILE_KEY`/`nextPollInSec` into `@penka/contracts`, which is what the plan corrections had already ruled. The reasoning is in the constant's own comment: a load valve that looks like a feature gets used as one. | Game route, store and polling suites + `apps/api/test/integration/game.int.test.ts`, which holds the pre-lock pick invariant at runtime. |
| 7   | [`prompt07.md`](./prompts/prompt07.md)                            | 2026-08-15 | `@penka/backoffice-api` plus the shared messaging module: admin-key guard, results, close, league-scoped resolve, polling profile. `5b8ea23`, `acdbefd`, `d412c64`, `433a731`, `b821be0`         | The prompt left "contracts or a new `packages/messaging`" to the assistant and asked it to justify the call; shared package won, and the contract was fixed **before** anything was implemented against it — `d412c64` reshaped the admin routes around league-scoped matchdays, `433a731` moved `selectCurrentMatchday` out of the API and into the engine where the board reader could reach it too. | `ids`, `messaging`, `ops`, `current-matchday` and `api/admin` suites; admin route suites + `admin.int.test.ts` (Redis `/9`–`/10`). |
| 8   | [`prompt08.md`](./prompts/prompt08.md)                            | 2026-08-15 | `@penka/workers`: consume `matchday.resolution`, apply effects, finalize the matchday, rebuild the board cache. `5f29f68`                                                                        | The prompt opened with "prove the publisher's tests bite" — the review's own precondition, run before any consumer existed. The hard part was not the consumer: `finalizeMatchday` flips a shared matchday only once **every** penka on the league has a resolution document, or the others would be told their calendar was already settled. | Handler decision-table suites (ack / poison / counted retry), `board` and `pick-result` engine suites, + `resolution.int.test.ts` (Redis `/11`). |
| 9   | [`prompt09.md`](./prompts/prompt09.md)                            | 2026-08-16 | `@penka/web`: the player app, with a single-file HTML prototype as the spec for design and Spanish copy — but not for the data contract. `2c08288`, `f5b40de`                                    | Caught before the app was written: the view was about to re-derive whether a pick's team won. `2c08288` exposed the predicate from the engine first, so the app asks instead of computing. Where prototype and engine disagreed the engine won — an island player keeps picking, because each hit is a point. | `resolve-matchday.test.ts` gained the win-predicate cases; component, store, composable and router suites with MSW-backed API doubles. |
| 10  | [`prompt10.md`](./prompts/prompt10.md)                            | 2026-08-16 | `@penka/backoffice-web`: the operator console, same treatment — prototype as spec for layout and copy only. `f9e9d03`                                                                            | The console must never claim work it did not do: `resolve` answers `{ queued: true }`, so the review's rule was that success is reported off a polled matchday status, never off that body. `game/resolve.ts` asks the engine for the precondition rather than hand-coding "locked and complete".   | View, client, store and parity suites; `game/resolve.test.ts`.                                                          |
| 11  | [`prompt11.md`](./prompts/prompt11.md)                            | 2026-08-16 | Final integration pass, five tasks: Playwright e2e, `pnpm demo`, root `README.md`, this log, and regenerating the conventions audit. `efdbd54`, `93f09a1`                                        | Found one gap in 5b: `globalPassThroughEnv` was missing `PREFETCH`, `MAX_ATTEMPTS` and `LOG_LEVEL`, which `@penka/workers` reads. The regenerated audit corrected the Redis database table — the old one listed reserved indexes as though they were in use. The e2e spec plays a *second* matchday, because `settings: {}` means two lives and one matchday cannot reach the island. | `e2e/tests/demo-script.spec.ts`, `e2e/tests/shared-league.spec.ts`. No new unit tests; the existing suites are unchanged. |

---

## Notes worth keeping

Things that came out of the review loop rather than out of a prompt, recorded here because
they explain why some rows have corrections attached.

- **The plan was generated once and corrected continuously.** Prompts 0–11 came out of
  Fable 5 in a single pass from the design spec; everything after prompt 5 ran against a
  plan that had been diffed back against the real code. The generated plan was a good
  starting point and a bad source of truth, and the two documents it lost to —
  `docs/CODEBASE-CONVENTIONS.md` and `prompt_plan_corrections.md` — are both in this repo.
- **Prompt 5's corrections were all one theme**: the first answer invented ids where the
  domain already had names (team ids over catalog codes) and trusted happy paths where the
  database was the only real arbiter (collision checks before insert, partial writes with
  no compensation). Three follow-up commits, no rewrites.
- **Prompt 6 shipped a per-penka polling profile** and it was reverted to one global key in
  `5b8ea23`. The reasoning is in `POLLING_PROFILE_KEY`'s own comment: a load valve that
  looks like a feature will be used as one.
- **Prompt 7 exists in the shape it does because prompts 5, 6 and 8 were each about to grow
  their own copy** of the id builders and the queue names. Moving them into
  `@penka/contracts` was cheaper than reconciling three of them later.
- **Prompt 8's hardest part was not the consumer**, it was deciding when a shared matchday
  is finished: `finalizeMatchday` flips its status only once every penka on the league has
  a resolution document.
- **Prompt 11 found one gap in 5b**: `globalPassThroughEnv` was missing `PREFETCH`,
  `MAX_ATTEMPTS` and `LOG_LEVEL`, which `@penka/workers` reads. Added along with the
  `VITE_*` variables the two Vue apps read.
- **The conventions audit found `ADMIN_KEY_HEADER` spelled independently** in
  `apps/backoffice-api` and `apps/backoffice-web` — a name two apps must agree on byte for
  byte, with no compiler checking it across the boundary. It now lives in
  `@penka/contracts` (`api/admin.ts`) and both sides import it, the same rule
  `POLLING_PROFILE_KEY` and the id builders already followed. Test first, as always: the
  constant's two assertions in `packages/contracts/src/api/admin.test.ts` went red before
  the export existed.
- **The join code had exactly one moment of visibility** — the toast fired when a penka was
  created — so a player who wanted to invite someone a week later had nowhere to read it.
  It was already on the wire (`PenkaSchema.joinCode`, hence `MyPenkaItem.penka`), so this
  cost no contract change: `PenkaCard` grew a second control and `composables/use-clipboard.ts`
  handles the two ordinary failures of `navigator.clipboard` — absent outside a secure
  context, and `NotAllowedError` when the click is not read as a gesture. It answers a
  boolean rather than throwing, because neither is a bug.
- **The back office's 401 was configuration drift, not missing auth.**
  `apps/backoffice-web/.env.development` shipped a `VITE_ADMIN_API_KEY` that no longer
  matched the root `.env`'s `ADMIN_API_KEY`, and `timingSafeEqual` has no notion of "close
  enough", so every panel came up empty with the only clue a 401 in the API console panel.
  The value is fixed; `AdminKeyGate` is the answer to the question the console could not
  previously ask. Making the key optional was the other option on the table and was
  declined — it would have taken auth off every operator endpoint. `stores/session.ts`
  listens on the client's traffic feed rather than probing, so the console's own first call
  is what establishes the verdict, and only a 401 locks: a 500 is not an auth problem.
- **Two things the reviews have not resolved**, carried here rather than quietly dropped:
  neither API registers CORS, and CI runs neither `pnpm build` nor `pnpm e2e`.
