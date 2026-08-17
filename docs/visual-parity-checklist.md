# Visual parity checklist

Two apps, two prototypes, one rule.

- `apps/web/public/prototype.html` is the **visual and copy contract** for the player app.
- `apps/backoffice-web/public/prototype.html` is the same for the operator console — see
  [Back office](#back-office-appsbackoffice-web) at the end of this document.

When a Vue app and its prototype disagree about how something looks or what it says, the
prototype is right and the Vue code changes. A prototype is never edited to match its app.

Each prototype's embedded mock API predates the real one. Where the two disagree about
**data** — the shape of a payload, which fields exist, what an endpoint answers — the real
API wins. That is a different question from the one this document is about.

## How to use it

Everything from here to "Accepted deviations" is about the **player app**; the back office
has its own harness, checklist and findings in the last section.

Run the dev server and open `http://localhost:5173/__parity?screen=pick`. The harness
frames the prototype on the left and the real app on the right at the same screen, with a
switcher for `pick | standings | pools`. Compare each section below on both panels, then
record what you found in the findings table.

The harness is dev-only: the route is registered under `import.meta.env.DEV` and the
chunk is tree-shaken out of `pnpm build`.

## In scope

### 1. Design tokens

Every colour, radius and shadow in the app comes from a custom property in
`apps/web/src/styles/tokens.css`, lifted verbatim from the prototype. **No component may
spell a colour, radius or shadow of its own.** The values, exactly:

| Token              | Value                         | Used for                                |
| ------------------ | ----------------------------- | --------------------------------------- |
| `--accent`         | `#FDA328`                     | primary button, countdown, picked state |
| `--accent-strong`  | `#E5860F`                     | primary button hover                    |
| `--accent-wash`    | `rgba(253, 163, 40, .14)`     | picked team option, own standings row   |
| `--bg`             | `#0D1420`                     | app background                          |
| `--surface`        | `#172232`                     | cards, header, rows                     |
| `--surface-raised` | `#253344`                     | hovered option, disabled button         |
| `--border`         | `#2C3C4F`                     | every 1px border                        |
| `--fg`             | `#EAF0F7`                     | body text                               |
| `--fg-muted`       | `#8496AB`                     | secondary text, captions, tallies       |
| `--fg-dim`         | `#56697F`                     | disabled button label                   |
| `--positive`       | `#6BA352`                     | poll pip, "En carrera" badge            |
| `--card-kept`      | `#F2C230`                     | a life the player still has             |
| `--card-lost`      | `#CE4B42`                     | a life spent, error toast, island badge |
| `--radius-sm`      | `8px`                         | buttons, small chips                    |
| `--radius-md`      | `14px`                        | cards, rows, notices                    |
| `--radius-lg`      | `20px`                        | hero                                    |
| `--shadow`         | `0 10px 30px rgba(0,0,0,.45)` | raised surfaces                         |

Check: sample a pixel from each panel with the same role and confirm the hex matches.
A near-miss (`#FDA32A` for `#FDA328`) is a **blocker** — it means a literal was typed
somewhere instead of a token being read.

### 2. Typography

- Body family: `DM Sans`, falling back to the system stack.
- Display family: `Barlow Condensed`, uppercase, `letter-spacing: .02em`, `line-height: 1`.
  Applied via `.display` on: screen titles, team codes, ranks, the header product name.
- `.screen-title` — 30px / 700.
- `.eyebrow` — Barlow Condensed, 600, uppercase, tracked out; muted.
- `.screen-intro` — 14px, `line-height: 1.45`, muted.
- `.team-code` — 26px / 700, `letter-spacing: .04em`.
- `.team-name` — 11.5px, muted. `.team-state` — 9.5px, uppercase, tracked `.1em`.
- `.lock-bar .countdown` — 20px / 700 accent while open; 14px muted once locked.
- Numerals that sit in a column — countdown, rank, points, tallies — carry `.tnum`
  (`font-variant-numeric: tabular-nums`) so they do not jitter as they tick.

### 3. Spacing rhythm

- `.screen` padding: `18px 18px 92px` — the bottom pad clears the tab bar.
- `.section-head` margin: `30px 0 10px`.
- Cards and rows: `margin-bottom` of 7px (rows) / 10px (match cards).
- `.screen-intro` bottom margin 18px; `.screen-title` bottom margin 4px.
- The action bar is sticky at the bottom with `margin: 16px -18px -92px` and a fade.

### 4. Radii and shadows

- Cards, rows, notices, the hero, the lock bar: `--radius-md` (hero `--radius-lg`).
- Buttons and chips: `--radius-sm`. Badges: `999px`.
- Only raised surfaces take `--shadow`; flat rows do not.

### 5. Component states

| Component     | State      | Expected                                                               |
| ------------- | ---------- | ---------------------------------------------------------------------- |
| Team option   | default    | code + name + `Elegir`                                                 |
| Team option   | picked     | `.is-picked`: accent wash, accent code/name, accent-bordered `Tu pick` |
| Team option   | used       | `.is-used`: code struck through (2px), `Ya usado`, disabled            |
| Team option   | disabled   | `opacity: .42`, `cursor: not-allowed`                                  |
| Lock bar      | open       | pulsing accent dot, `Cierra en`, accent `HH:MM:SS`                     |
| Lock bar      | locked     | `.is-locked`: muted dot (no animation), `Fecha cerrada`, `Sin cambios` |
| Notice        | island     | `.notice--lost`, `Te quedaste sin tarjetas` in bold on its own line    |
| Notice        | pick won   | `.notice--won`, `{Equipo} ganó`                                        |
| Notice        | pick lost  | `.notice--lost`, `{Equipo} no ganó`                                    |
| Standings row | own row    | `.is-me`: accent wash and accent border                                |
| Standings row | island row | `.is-island`: points instead of life cards                             |
| Life cards    | —          | 9×13px, 3px gap; kept `--card-kept`, lost `--card-lost` at `.85` alpha |
| Empty state   | —          | dashed border, centred, `h3` + muted `p`                               |
| Toast         | ok / error | bottom-anchored; error variant on `--card-lost` with white text        |
| Skeleton      | —          | three shimmer bars while the first board loads                         |
| Button        | disabled   | `--surface-raised` background, `--fg-dim` label                        |

### 6. Behaviour cues

- Countdown format is `HH:MM:SS` with **unbounded hours** — a matchday two days out reads
  `50:12:04`, never wrapped to `02:12:04`.
- The header poll indicator reads `cada {n}s`, where `n` is the server's `nextPollInSec`;
  it shows `—` before the first answer and turns the pip accent while a request is open.
- The screen locks itself the second the countdown reaches zero — no reload, no waiting
  for the next poll.
- Tab bar: three tabs, active one accent-coloured, in the prototype's order
  (`Mi pick | Tabla | Mis juegos`).

## Explicitly out of scope

**Data values.** Names, numbers, dates, team codes, counts, join codes, kickoff times and
match results will differ between the panels and that is expected: the prototype serves a
fixed mock, and the app serves whatever the local stack holds. Only the _shape_ of a value
is in scope — `HH:MM:SS`, `cada 10s`, `2 jugadores · Fecha 1 en juego` — never the value
itself.

Also out of scope: the prototype's screen-switching mechanics (it hides `<main>` elements;
the app routes), and anything below the fold that exists only because the mock has more
rows than the local stack.

## Findings

Filled in by the parity loop. One row per difference; blockers are fixed in the Vue code
and re-verified, minors are moved to "Accepted deviations" with a reason.

The loop ran three iterations against the real stack — Mongo/Redis/RabbitMQ up, `@penka/api`
on 3000, `@penka/backoffice-api` on 3001 and `@penka/workers` consuming, so the states that
need a resolved matchday (used teams, history rows, island rows, the locked lock bar) were
reached by actually playing two matchdays rather than by faking store state. Comparison was
not by eye alone: a script normalizes every rule in the prototype's `<style>` blocks and in
`tokens.css + base.css + forms.css` and diffs them (**0 rules missing, 0 differing**), a
runtime probe confirms all 17 design tokens byte-identical, and a per-selector probe diffs
17 computed properties across both iframes on each screen.

**Iteration 1 — 5 blockers, all fixed:**

| Screen    | Element                  | Prototype                                         | App                                                                               | Severity |
| --------- | ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| all       | app shell                | renders                                           | `No pudimos conectarnos con el servidor` — every request failed before being sent | blocker  |
| all       | parity harness           | two 430px panels side by side                     | both panels crushed into one 430px frame, right panel clipped                     | blocker  |
| pick      | `.screen-intro`          | `margin-top: 16px` (inline, `prototype.html:234`) | `0` — intro sat tight under the hero                                              | blocker  |
| standings | `.screen-intro` (island) | `margin-top: -4px` (inline, `prototype.html:262`) | `0` — extra gap under the section head                                            | blocker  |
| pools     | `a.btn`                  | `.btn` is a `<button>`: centred, no underline     | underlined, left-aligned — anchors style their own label                          | blocker  |

Fixes: `@penka/api` registers no CORS plugin, so the dev server now proxies `/api` to 3000
(`vite.config.ts` + `.env.development`, which empties `VITE_API_BASE_URL` so the client
builds relative URLs); `.parity` became `position: fixed; inset: 0` so the harness escapes
`.app`'s `max-width: 430px` and `overflow: hidden`; the two inline margins were mirrored as
attributes so `base.css` stays the prototype's stylesheet declaration for declaration; and
`a.btn { display: block; text-align: center; text-decoration: none; }` went into
`forms.css` for the same reason.

**Iteration 2 — 0 blockers.** All three screens re-navigated and re-probed. The surviving
diffs are data-only or accepted (below):

| Screen    | Element                | Prototype                                | App                                             | Severity                      |
| --------- | ---------------------- | ---------------------------------------- | ----------------------------------------------- | ----------------------------- |
| standings | `.tally`               | `2 de 9`                                 | `1 de 5` — different width, same style          | minor                         |
| standings | `.standing-row`        | no `.is-me` on the first row             | `.is-me` on the first row                       | minor                         |
| pools     | `.pool-card`           | `.is-current` on the first card          | never applied                                   | minor                         |
| pick      | `.lock-bar .indicator` | blink at opacity `0.999`                 | `0.986` — same animation, sampled a frame apart | minor                         |
| standings | island empty state     | `Todavía nadie perdió sus dos tarjetas.` | `…sus 2 tarjetas.`                              | **copy — flagged, not fixed** |

**Iteration 3 — 0 blockers.** `?screen=pick` (16 selectors), `?screen=standings` (19) and
`?screen=pools` (7) each probed clean: `[]`. Two consecutive zero-blocker passes; exit
criteria met.

Between iterations: `pnpm test --filter @penka/web` — 19 files / 171 tests pass;
`pnpm lint` 8/8; `pnpm build` 7/7 with no `parity` chunk in `dist/assets` and
`localhost:3000` still baked into the production bundle.

### Flagged, not fixed

The island empty state reads `sus dos tarjetas` in the prototype and `sus 2 tarjetas` in
the app. Copy is the contract, so the prototype wins — but the numeral form is asserted by
`StandingsView.test.ts:115` and `:133`, and the root `CLAUDE.md` says: _"Never weaken or
delete a test to make it pass. If a test seems wrong, stop and flag it in your response
instead of changing it."_ Changing the copy means editing two existing assertions, so it is
recorded here for a human decision. The clean fix is a small number-to-word helper (the
setting is 1–3), which keeps the prototype's wording at every value.

## Accepted deviations

Differences that survive on purpose. Each one is a place where something outranks the
prototype: the real API, the game engine, or a fact the prototype's mock hid.

- **Island players can still pick** (when the penka has `islandEnabled`). The prototype
  greys out every team option for an island player. `validatePick` in
  `@penka/game-engine` — the same function the API runs — accepts their picks, because
  each hit is worth a point on the island table, which the prototype's own notice copy
  says out loud. The rule wins; the greyed-out state is kept for `islandEnabled: false`.
- **No scorelines.** The prototype printed `2–0` / `0–2` / `1–1` from a match outcome. It
  invented them: neither the mock nor the real API carries goals. The app prints the
  outcome in words (`Ganó local`, `Ganó visitante`, `Empate`) rather than a number nobody
  sent.
- **`PenkaCard` drops the player count and "Fecha N".** `MyPenkaItem` carries `penka` and
  `entry` and nothing else, so those two figures have no source. They would have to be
  fabricated or fetched per card.
- **Life cards count `penka.settings.lives`, not two.** The prototype drew exactly two
  because its mock only ever had two; a penka is created with one to three.
- **"La Isla está vacía" counts the penka's own lives** — `Todavía nadie perdió sus
{lives} tarjetas.` stays true at one, two or three, where the prototype's hard-coded
  `dos` would be wrong. It does not read identically: the prototype spells the word, the
  app prints the numeral. That half is a genuine copy miss, not a deviation — see
  "Flagged, not fixed" above.
- **History sentences are composed client-side.** The mock handed the UI finished
  `headline` and `detail` strings; the real board sends `eliminated: string[]`. The count
  and the names are data, the sentence is copy — and copy in the API cannot be changed
  without deploying the API.
- **Auth, join and create screens are new.** The prototype has none: it opens signed in,
  in a penka. They are built from the same tokens and primitives, and add no new colours,
  radii or shadows.

Added by the parity loop:

- **`.pool-card.is-current` is never applied.** The prototype highlights one card as the
  penka you are "in". `/penkas` answers a flat list of `MyPenkaItem` with no such flag, and
  the app has no notion of a current penka outside a route that already names one. The rule
  would have to be invented client-side to draw the state.
- **Kickoff reads `Dom 02:11`, not `21:30`.** The mock's kickoff was a bare time string
  because every mock match was the same evening. The real calendar spans days, so a bare
  time is ambiguous and the weekday is prepended. Same class, same type, one more token of
  text.
- **The own standings row shows the player's display name, not `Vos`.** `Vos` is a value in
  the prototype's mock roster (`penka-api.js:113`, `{ name: 'Vos', isMe: true }`), not
  renderer copy — the prototype prints `entry.name` like every other row. The board carries
  no viewer identity, so the row is matched by display name and shows it.
- **The resolved-pick notice is unreachable against the real API.** `{Equipo} ganó` /
  `no ganó` renders correctly (unit-tested), but `/matchday/current` advances to the next
  matchday the instant the previous one resolves, so a live board never pairs
  `isResolved: true` with the pick that was made on it. Reaching it needs an API change,
  not a web one.
- **History detail joins the last name with `y`.** The mock handed over a finished
  sentence; the app builds it from `eliminated: string[]`, and a Spanish list of names ends
  in `y` rather than a comma. Mechanical consequence of composing the sentence client-side.
- **`PenkaCard` carries a join-code chip the prototype has no equivalent for, and is a
  `<div>` rather than a `<button>`.** `MyPenkaItem.penka.joinCode` was already on the wire
  and the app printed it exactly once, in the toast fired at creation — so a player who
  wanted to invite someone a week later had nowhere to read it. The card now holds two
  independent actions, enter and copy, and a button inside a button is invalid HTML, so the
  card became the frame and `.pool-open` took over the tap target. Same tokens, same
  radii; the chip reuses the dashed-border treatment already in the sheet.
- **The header poll indicator reads `—` on the pools screen.** The app polls the board, and
  there is no board outside a penka, so `nextPollInSec` has no value there yet. The
  prototype's mock answered a poll interval globally. Inside a penka both panels read
  `cada {n}s`.

---

# Back office (`apps/backoffice-web`)

`apps/backoffice-web/public/prototype.html` is the visual and copy contract for the
operator console. Same rule as above: the prototype wins on layout and copy, the real
admin API wins on data.

One difference from the player app: this prototype has **no screen switcher**. The back
office is a single screen, so the harness frames one page against one page.

## How to use it

With the full stack up — Mongo/Redis/RabbitMQ, `@penka/backoffice-api` on 3001 and
`@penka/workers` consuming, or a queued resolution never lands — run
`pnpm dev --filter @penka/backoffice-web` and open `http://localhost:5174/__parity`.

The console is a **desktop** screen: `.layout` collapses to a single column below 1080px.
Two half-width panels on a laptop would put both sides into that collapsed state, which is
comparable but not shippable — so the harness renders each frame at a fixed **1360px** and
scales it down to fit. Compare at that width; never at the squeezed one.

The harness is dev-only: the route is registered under `import.meta.env.DEV` and the chunk
is tree-shaken out of `pnpm build`.

## In scope

### 1. Desktop layout

- `.layout` — `max-width: 1320px`, `margin: 0 auto`, `padding: 22px 26px 60px`, and the
  two-column grid `minmax(0, 1fr) 380px` with `gap: 20px` and `align-items: start`. The
  sidebar is a fixed 380px; it never flexes.
- Below 1080px the grid becomes `minmax(0, 1fr)` — one column, sidebar underneath.
- Panel order, main column: **Estado de la fecha → Resultados → Penkas activas**.
  Sidebar: **Operación → Consola de API**.
- `.topbar` is sticky (`top: 0`, `z-index: 20`) with a 1px bottom border, the logo at 24px,
  a 1px × 19px divider, the product name, the context line, then the mode pill pushed right
  by `.spacer`.
- `.panel` — `--surface` on a 1px `--border`, `--radius-md`, `margin-bottom: 18px`,
  `overflow: hidden`. `.panel-head` is 14px/18px with a bottom border; `.panel-body` is 18px.

### 2. Panel structure

- `.panel-head h2` — Barlow Condensed 700, uppercase, 16px, `letter-spacing: .1em`.
- `.panel-head .hint` — 12px, `--fg-muted`, right of the title (Resultados, Penkas) or
  pushed right by `.spacer` (Estado de la fecha, Consola de API).
- `.status-grid` — four equal cells, `gap: 12px`, `padding: 18px`; two columns below 760px.
- `.status-cell` — `--bg` inside the panel, 1px border, `--radius-sm`, `padding: 12px 14px`.
  `.label` is Barlow Condensed 11px uppercase tracked `.14em` in `--fg-dim`; `.value` is
  20px/700, and `.value.small` (the status pill's cell) 15px/500.
- The actions block is a `.panel-body` with a 1px top border, holding `.btn-row`
  (`gap: 10px`, wrapping) and a `.field-note` beneath.

### 3. Tables

- `thead th` — Barlow Condensed 700, uppercase, 12px, `letter-spacing: .12em`, `--fg-dim`,
  left aligned, `padding: 10px 18px`, 1px bottom border.
- `tbody td` — `padding: 11px 18px`, bottom border `rgba(44,60,79,.5)`, none on the last row.
- Row hover — `background: rgba(37,51,68,.35)`.
- `.cell-strong` (the name column) is 500; `.cell-muted` is 12.5px `--fg-muted`.
- Every numeric column carries `.tnum` so the digits do not jitter between reads.

### 4. Outcome selector states

- `.outcome-group` — inline flex, `gap: 6px`; three buttons per row: home code, `Empate`,
  away code.
- Resting `.outcome-btn` — `--surface-raised`, 1px `--border`, `--radius-sm`, Barlow
  Condensed 14px tracked `.04em`.
- Hover (enabled only) — border and text go `--accent`.
- Selected — `background: --accent`, same border, text `#241503`.
- Disabled — `opacity: .45`, `cursor: not-allowed`. Every selector is disabled once the
  matchday is `resolved`.
- Focus — `outline: 2px solid --accent`, `outline-offset: 2px`.

### 5. Status pills

`.pill` is a 999px chip, 10.5px, uppercase, tracked `.1em`, `--fg-muted` text on a
`--border` outline; the modifier only recolours the border and the text:

| Status     | Class            | Label     | Border                  | Text         |
| ---------- | ---------------- | --------- | ----------------------- | ------------ |
| `open`     | `.pill--open`     | `Abierta` | `rgba(107,163,82,.55)`  | `--positive` |
| `locked`   | `.pill--locked`   | `Cerrada` | `rgba(242,194,48,.5)`   | `--warning`  |
| `resolved` | `.pill--resolved` | `Resuelta`| `rgba(253,163,40,.5)`   | `--accent`   |

### 6. Segmented control

- `.segmented` — inline flex, 1px border, `--radius-sm`, `overflow: hidden`; a 1px left
  border between buttons, none on the first.
- Buttons — `padding: 8px 14px`, transparent, `--fg-muted`, 12.5px, inheriting the body
  family (not Barlow).
- Selected — `--accent` background, `#241503` text, weight 700.
- Labels stay the prototype's **Normal / En vivo / Degradado**; the values on the wire are
  the contract's `normal / live / slow`.

### 7. API console typography

- `.console` — `max-height: 520px`, `overflow-y: auto`, no padding of its own.
- `.log-entry` — a `52px 1fr auto` grid, `gap: 10px`, `align-items: baseline`,
  `padding: 9px 18px`, mono family (`JetBrains Mono`), 11.5px, with the same faint bottom
  border as table rows and none on the last entry.
- `.log-method` — 500, `--accent`. `.log-path` — `--fg`, `word-break: break-all`.
  `.log-meta` — `--fg-dim`, `white-space: nowrap`, reading `{status} · {ms}ms`.
- `.log-entry.is-error` recolours **method and path** to `--danger` (not the row background),
  and the path gains `— {code}`. A failure is `status >= 400` **or** `status === 0`.
- Empty state `.log-empty` — `Sin actividad todavía.`, centred, 12.5px `--fg-dim`.

### 8. Toasts

- Fixed at `right: 26px; bottom: 26px`, `max-width: 380px`, `padding: 14px 18px`,
  `--radius-md`, `0 12px 30px rgba(0,0,0,.5)`.
- Success — `--positive` on `#0A1A06`. Failure — `.is-error`, `--danger` on `#fff`.
- Visible for 4200ms; a second message replaces the first and restarts the clock.

## Comparable states to produce

Data will differ; the states must not. On both panels:

1. **Load one result.** Click the home team on the first row and compare the selected
   `.outcome-btn`, the `Estado` cell flipping `Pendiente → Cargado`, the results counter and
   the toast.
2. **Trigger a refusal.** Resolve with results missing and compare the error toast — the
   prototype's mock and the real API both refuse, and the toast must look identical
   (position, colour, radius, shadow) even though the words come from different places.
3. **Close the matchday** and compare the status pill and the disabled close button.
4. **Change the polling profile** and compare the selected segment and `Intervalo vigente`.
5. **Clear the API console** and compare the empty state.

## Back-office findings

### Iteration 1 — stylesheet diff and resting states

The app's whole style surface is `src/styles/tokens.css` + `src/styles/base.css` (only
`ParityView.vue` carries a `<style>` block, and it styles the harness chrome, never the
frames). Diffing that surface against the prototype's `<style>`, rule by rule and
declaration by declaration:

| Check | Result |
| --- | --- |
| Rules in the prototype missing from the app | **0** |
| Declarations that differ on a shared selector | **0** |
| Rules in the app with no prototype counterpart | **4** — see below |

The four extra rules are the prototype's three inline `style=` attributes promoted to
classes, plus one state the prototype never has to render:

| Rule | Where it comes from |
| --- | --- |
| `.btn--small` | `#clearLog`'s inline `padding:5px 10px;font-size:12px` |
| `.btn--trailing` | `#resetData`'s inline `margin-left:auto` |
| `.panel-body--divided` | the actions block's inline `border-top:1px solid var(--border)` |
| `.table-empty` | app-only: a penka list or match list that comes back empty |

Computed-style probe across the resting selectors (`.layout`, `.topbar`, `.panel`,
`.panel-head h2/.hint`, `.status-grid`, `.status-cell` + `.label`/`.value`/`.value.small`,
`.btn-row`, `.field-note`, `table`, `thead th`, `tbody td`, `.cell-strong`, `.cell-muted`,
`.tnum`, `.outcome-group`, `.segmented`, `.console`, `.log-entry`, `.log-method`,
`.log-path`, `.log-meta`, `.toast`) — **no differences**. The only selectors that came back
unequal were ones where the two panels were in different *states*, which the next iteration
settles.

**Blockers: none.**

### Iteration 2 — matched states, driven through the real API

The app half ran against the live stack (Mongo, Redis, RabbitMQ, `@penka/backoffice-api`
on 3001 and `@penka/workers` consuming), so every state below is the real one, not a mock.

| State | How it was produced | Result |
| --- | --- | --- |
| Selected outcome | clicked one outcome on each side | `.outcome-btn.is-selected` **identical** |
| Success toast | same click | `.toast` **identical**; only the number in the copy differs |
| Locked pill | app: `POST .../close` | `.pill--locked` + `Cerrada`, **identical** |
| Resolve blocked | locked with 3 of 4 results | button disabled, `Cargá todos los resultados antes de resolver.` |
| Error toast | app: real `409 results_missing`; prototype: its own `showToast(…, true)` | `.toast.is-error` **identical** — `#CE4B42` on white, `14px` radius, `0 12px 30px rgba(0,0,0,.5)`, pinned `26px/26px` |
| Resolved pill | both sides resolved | `.pill--resolved` + `Resuelta`, **identical** |
| Disabled selectors | after resolution | `.outcome-btn:disabled` and `.outcome-btn.is-selected:disabled` **identical** |
| Disabled button | `Resolver fecha` disabled on both | **identical** |
| Segmented selection | clicked `Degradado` on both | `.segmented button.is-selected` **identical**; both read `Intervalo vigente: 30 s` and toast `Polling: 30 s` |
| Error log row | the 409 above | method and path both `--danger`, path suffixed `— results_missing` |

A full pass after reloading both frames found no computed-style difference on any
state-matched selector. **Two clean passes, zero blockers, nothing fixed in Vue.**

The 409 is worth spelling out: the app's resolve button is *disabled* in exactly the state
that earns it, so the button had to be force-enabled from the harness to make the API
refuse. That is the deviation working — the prototype would have sent the request.

Also confirmed end to end on the real stack: close → four results → resolve → the queued
toast → the matchday flipping to `Resuelta` on a later read, with the workers doing the
actual resolution in between.

## Accepted deviations (back office)

- **`AdminKeyGate` and the top bar's "Cambiar clave" have no prototype counterpart.** The
  prototype toggled between a mock backend and the real API and so never had to be
  authorized. The real console sends a shared secret on every request, and a key the
  deployment does not know left every panel empty with the reason visible only in the API
  log. Built from the console's own tokens — `.panel` surface, `.btn` / `.btn--ghost`, the
  `--danger` wash already used by `.btn--danger` — so it adds no new colours or radii.

Recorded, not fixed. The first two were directed; the rest follow from the admin contract.

| # | Prototype | App | Why |
| --- | --- | --- | --- |
| 1 | Resolve enables as soon as every match has a result | Enables only when the matchday is **locked** *and* complete, and the disabled state names the missing half | Lock is a precondition of resolve; the prototype's rule earns a `409 matchday_not_locked`. Enablement asks `@penka/game-engine`, never arithmetic over the rows |
| 2 | `Fecha resuelta · N jugadores pasaron a La Isla` | `Resolución encolada · un job por Penka; el estado se actualiza al terminar` | `POST …/resolve` publishes one message per penka and returns. Nothing is resolved when it answers, so the console reports what happened — a queued job — and reflects the real state on a later read |
| 3 | — | **Actualizar** button next to the two actions | The manual half of the same problem: the console re-reads the matchday a few times after a resolve, and this is the operator's way to ask again once the budget is spent |
| 4 | API console appends, oldest first | Newest first, capped at 60 | Directed. An operator watching a flow wants the last request at the top |
| 5 | `Tenant` column, `penka-demo` | `Código` column, the join code | `AdminPoolSummary` carries no tenant. The join code is the operationally useful identifier the response does carry |
| 6 | `Fechas resueltas` lists numbers (`1, 2`), styled `.cell-muted` | A count (`2`), styled `.tnum` | `resolvedMatchdays` is a number in the contract, so the column is numeric and aligns with the other numeric columns |
| 7 | Team names (`River Plate vs Boca Juniors`) | Team codes (`RIV vs BOC`) | The admin API sends no team catalog |
| 8 | `mock backend` mode pill | `API real` | There is no mock to switch to |
| 9 | Topbar context `Copa Libertadores · Fecha 2` | `copa-libertadores · Fecha 2` | The matchday response carries no league name |
| 10 | `Reiniciar datos de prueba` | Hidden | No seed endpoint exists on the admin API. The button renders only when `VITE_ADMIN_RESET_ENDPOINT` names one |
| 11 | `nextPollInSec` arrives in the payload | Computed locally from the profile | The response carries `pollingProfile` alone; the seconds come from the contract's own `nextPollInSec`, so the number can never drift from the one the player app uses |
| 12 | Reads `/admin/pools`, `/admin/tournaments/:id/matchdays/:n` | Reads `/admin/v1/penkas`, `/admin/v1/leagues/:leagueId/matchdays/:number` | The prototype's mock predates the real routes. Match ids carry colons, so the client percent-encodes them |
| 13 | Screen switcher in the harness | One screen | The back office is a single screen |
