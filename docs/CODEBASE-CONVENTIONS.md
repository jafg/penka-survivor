# Codebase conventions — factual inventory

Read-only audit of `penka-survivor` at commit `f9e9d03`, plus the uncommitted final
integration pass (`e2e/`, `scripts/`, `README.md`, `.env.example`, `docs/ai-development-log.md`,
and the edits to `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `.gitignore`).

Every claim below cites `file:line` and quotes the code as it exists. Nothing here is
inferred from naming or from `CLAUDE.md`; where something does not exist it is recorded as
**NOT FOUND** in the last section.

This supersedes the previous edition, which audited `c56bf74` and therefore predated the
game module, the `picks` and `resolutions` collections, the shared id builders,
`@penka/backoffice-api`, `@penka/workers`, both Vue apps, and the `e2e` workspace.

---

## 1. `@penka/contracts` public surface

### 1.1 Entrypoint

`packages/contracts/package.json:6-10`

```json
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
```

`packages/contracts/src/index.ts:1-11` — the complete entrypoint, verbatim:

```ts
export * from './errors';
export * from './domain';
export * from './health';
export * from './ids';
export * from './messaging';
export * from './ops';
export * from './api/auth';
export * from './api/catalog';
export * from './api/penkas';
export * from './api/game';
export * from './api/admin';
```

Three modules exist in `src/` and are **not** re-exported:

| File                                        | Why it is not exported                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/contracts/src/strict.ts`          | `StrictObject` is the internal schema factory every module builds on.                     |
| `packages/contracts/src/test-support/fixtures.ts` | Test-only.                                                                           |
| `packages/contracts/src/**/*.test.ts`       | Test-only.                                                                                 |

### 1.2 Full export list

Grouped by source file, in the order `index.ts` re-exports them.

**`errors.ts`** — `ErrorCodes` (`:9`), `ErrorCode` (`:37`), `ErrorCodeSchema` (`:39`),
`ApiErrorSchema` (`:44`), `ApiError` (`:50`).

**`domain.ts`** — `IdSchema` (`:5`), `IsoDateTimeSchema` (`:8`), `EmailSchema` (`:12`),
`RegionSchema` (`:17`), `Region` (`:22`), `TeamCodeSchema` (`:32`), `TeamSchema` (`:38`),
`Team` (`:44`), `LeagueSchema` (`:46`), `League` (`:52`), `FixtureMatchupSchema` (`:55`),
`FixtureMatchup` (`:59`), `FixtureTemplateMatchdaySchema` (`:61`),
`FixtureTemplateMatchday` (`:67`), `FixtureTemplateSchema` (`:74`), `FixtureTemplate` (`:78`),
`MatchOutcomeSchema` (`:82`), `MatchOutcome` (`:87`), `MatchSchema` (`:96`), `Match` (`:104`),
`MatchdayStatusSchema` (`:106`), `MatchdayStatus` (`:111`), `MatchdaySchema` (`:113`),
`Matchday` (`:120`), `UserSchema` (`:125`), `User` (`:131`), `PenkaSettingsSchema` (`:135`),
`PenkaSettings` (`:140`), `PenkaSchema` (`:142`), `Penka` (`:150`), `EntryStatusSchema` (`:152`),
`EntryStatus` (`:153`), `EntrySchema` (`:155`), `Entry` (`:165`), `PlayerPickSchema` (`:168`),
`PlayerPick` (`:176`), `ResolutionSchema` (`:178`), `Resolution` (`:186`),
`BoardPlayerSchema` (`:200`), `BoardPlayer` (`:208`), `BoardHistoryItemSchema` (`:210`),
`BoardHistoryItem` (`:215`), `BoardSchema` (`:230`), `Board` (`:240`), `MyEntrySchema` (`:243`),
`MyEntry` (`:249`).

**`health.ts`** — `HealthResponseSchema` (`:4`), `HealthResponse` (`:8`).

**`ids.ts`** — `matchdayId` (`:17`), `matchId` (`:22`).

**`messaging.ts`** — `SURVIVOR_COMMANDS_EXCHANGE` (`:17`), `RESOLUTION_QUEUE` (`:20`),
`RESOLUTION_BINDING_KEY` (`:27`), `SURVIVOR_DLX` (`:30`), `RESOLUTION_DLQ` (`:31`),
`resolveRoutingKey` (`:34`), `resolveMessageId` (`:45`), `ResolveMatchdayCommandSchema` (`:55`),
`ResolveMatchdayCommand` (`:61`).

**`ops.ts`** — `POLLING_PROFILE_KEY` (`:19`), `toPollingProfile` (`:26`), `boardCacheKey` (`:37`),
`BOARD_CACHE_TTL_SECONDS` (`:52`), `NEAR_LOCK_MS` (`:58`), `NextPollInput` (`:60`),
`nextPollInSec` (`:80`).

**`api/auth.ts`** — `RefreshTokenSchema` (`:5`), `AuthTokensSchema` (`:7`), `AuthTokens` (`:11`),
`RegisterRequestSchema` (`:14`), `RegisterRequest` (`:19`), `RegisterResponseSchema` (`:21`),
`RegisterResponse` (`:25`), `LoginRequestSchema` (`:28`), `LoginRequest` (`:32`),
`LoginResponseSchema` (`:34`), `LoginResponse` (`:38`), `RefreshRequestSchema` (`:41`),
`RefreshRequest` (`:44`), `RefreshResponseSchema` (`:46`), `RefreshResponse` (`:49`),
`MeResponseSchema` (`:52`), `MeResponse` (`:55`).

**`api/catalog.ts`** — `LeagueParamsSchema` (`:5`), `LeagueParams` (`:8`),
`LeagueSummarySchema` (`:11`), `LeagueSummary` (`:17`), `ListLeaguesQuerySchema` (`:21`),
`ListLeaguesQuery` (`:24`), `ListLeaguesResponseSchema` (`:26`), `ListLeaguesResponse` (`:29`),
`LeagueDetailResponseSchema` (`:32`), `LeagueDetailResponse` (`:37`).

**`api/penkas.ts`** — `DEFAULT_PENKA_SETTINGS` (`:6`), `CreatePenkaSettingsSchema` (`:10`),
`CreatePenkaSettings` (`:16`), `CreatePenkaRequestSchema` (`:18`), `CreatePenkaRequest` (`:23`),
`CreatePenkaResponseSchema` (`:25`), `CreatePenkaResponse` (`:28`), `JoinPenkaRequestSchema` (`:31`),
`JoinPenkaRequest` (`:40`), `JoinPenkaResponseSchema` (`:42`), `JoinPenkaResponse` (`:46`),
`MyPenkaItemSchema` (`:49`), `MyPenkaItem` (`:53`), `MyPenkasResponseSchema` (`:55`),
`MyPenkasResponse` (`:58`).

**`api/game.ts`** — `PenkaParamsSchema` (`:12`), `PenkaParams` (`:15`), `BoardResponseSchema` (`:18`),
`BoardResponse` (`:21`), `MyEntryResponseSchema` (`:24`), `MyEntryResponse` (`:27`),
`CurrentMatchdayResponseSchema` (`:30`), `CurrentMatchdayResponse` (`:34`),
`SubmitPickRequestSchema` (`:37`), `SubmitPickRequest` (`:40`), `SubmitPickResponseSchema` (`:42`),
`SubmitPickResponse` (`:45`).

**`api/admin.ts`** — `PollingProfileSchema` (`:12`), `PollingProfile` (`:17`),
`LeagueMatchdayParamsSchema` (`:26`), `LeagueMatchdayParams` (`:30`), `MatchParamsSchema` (`:38`),
`MatchParams` (`:41`), `AdminPoolSummarySchema` (`:44`), `AdminPoolSummary` (`:54`),
`AdminPoolsResponseSchema` (`:56`), `AdminPoolsResponse` (`:59`),
`AdminMatchdayDetailResponseSchema` (`:62`), `AdminMatchdayDetailResponse` (`:68`),
`SetResultRequestSchema` (`:71`), `SetResultRequest` (`:74`), `SetResultResponseSchema` (`:82`),
`SetResultResponse` (`:87`), `CloseMatchdayResponseSchema` (`:90`), `CloseMatchdayResponse` (`:93`),
`ResolveMatchdayResponseSchema` (`:96`), `ResolveMatchdayResponse` (`:100`),
`SetPollingProfileRequestSchema` (`:103`), `SetPollingProfileRequest` (`:106`),
`SetPollingProfileResponseSchema` (`:108`), `SetPollingProfileResponse` (`:111`).

### 1.3 Collisions with TypeScript utility types

One export is renamed to avoid shadowing a built-in utility type.
`packages/contracts/src/domain.ts:167-176`

```ts
// Named PlayerPick (not Pick) so the exported type never shadows TypeScript's Pick<T, K>.
export const PlayerPickSchema = StrictObject({
  id: IdSchema,
  entryId: IdSchema,
  matchdayId: IdSchema,
  /** The team backed this matchday, as a catalog code (see MatchSchema). */
  teamCode: TeamCodeSchema,
  createdAt: IsoDateTimeSchema,
});
export type PlayerPick = Static<typeof PlayerPickSchema>;
```

`Record`, `Omit`, `Exclude`, `Extract`, `Partial` and `Required` are **not** exported from
`@penka/contracts` under any name. `Entry`, `Match`, `Team` and `League` collide with nothing
in `lib.es5.d.ts`.

### 1.4 `TeamCodeSchema`, verbatim

`packages/contracts/src/domain.ts:32-36`

```ts
export const TeamCodeSchema = Type.String({
  pattern: '^[A-Z0-9]{2,5}$',
  description: 'Catalog team code, unique inside a league (RIV, BOC, RMA).',
});
```

A team is addressed by this code everywhere on the wire — there is no generated team id in
the repository. `apps/api/src/modules/penkas/store.ts:36-40` records the reason:

```ts
/**
 * Teams are stored as catalog codes, never as generated ids. A match belongs to
 * one league, and codes are unique inside a league, so a code identifies a team
 * unambiguously — the MVP creates no separate team documents.
 */
```

### 1.5 Read models: what is public and what is personal

`packages/contracts/src/domain.ts:200-207` — `BoardPlayerSchema`, with the pre-lock rule
stated in the contract itself:

```ts
export const BoardPlayerSchema = StrictObject({
  displayName: Type.String({ minLength: 1 }),
  lives: Type.Integer({ minimum: 0 }),
  /** Correct picks so far. Island players keep scoring, so this is what they play for. */
  points: Type.Integer({ minimum: 0 }),
  /** Hidden before lock, revealed after — see the note above. */
  pick: Type.Union([TeamCodeSchema, Type.Null()]),
});
```

`packages/contracts/src/domain.ts:230-239` — `BoardSchema`:

```ts
export const BoardSchema = StrictObject({
  matchday: Type.Integer({ minimum: 1 }),
  lockAt: IsoDateTimeSchema,
  isLocked: Type.Boolean(),
  isResolved: Type.Boolean(),
  alive: Type.Array(BoardPlayerSchema),
  island: Type.Array(BoardPlayerSchema),
  history: Type.Array(BoardHistoryItemSchema),
  nextPollInSec: Type.Integer({ minimum: 0 }),
});
```

`packages/contracts/src/domain.ts:243-248` — `MyEntrySchema`, the personal delta:

```ts
export const MyEntrySchema = StrictObject({
  lives: Type.Integer({ minimum: 0 }),
  status: EntryStatusSchema,
  myPick: Type.Union([TeamCodeSchema, Type.Null()]),
  usedTeams: Type.Array(TeamCodeSchema),
});
```

The split is enforced by the schemas being closed (`StrictObject`) and by
`removeAdditional: false` in both apps (§3.1, §3.7): a board that grew a `myPick` field would
fail response validation rather than leak.

### 1.6 Complete error-code list

`packages/contracts/src/errors.ts:9-33`, verbatim and exhaustive — 22 codes:

```ts
export const ErrorCodes = {
  invalid_credentials: 'invalid_credentials',
  email_taken: 'email_taken',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  /** Generic 404: an unroutable path or method. Specific misses have their own codes. */
  not_found: 'not_found',
  /** Unknown league id in the catalog. */
  league_not_found: 'league_not_found',
  penka_not_found: 'penka_not_found',
  invalid_join_code: 'invalid_join_code',
  join_code_space_exhausted: 'join_code_space_exhausted',
  matchday_locked: 'matchday_locked',
  matchday_not_found: 'matchday_not_found',
  team_already_used: 'team_already_used',
  team_not_playing: 'team_not_playing',
  on_island: 'on_island',
  results_missing: 'results_missing',
  already_resolved: 'already_resolved',
  matchday_not_locked: 'matchday_not_locked',
  invalid_outcome: 'invalid_outcome',
  invalid_profile: 'invalid_profile',
  rate_limited: 'rate_limited',
  // Generic fallbacks: request-schema validation failures and unhandled server errors.
  validation_failed: 'validation_failed',
  internal: 'internal',
} as const;
```

`packages/contracts/src/errors.ts:44-48` — the envelope every non-2xx response uses:

```ts
export const ApiErrorSchema = StrictObject({
  status: Type.Integer({ minimum: 400, maximum: 599 }),
  code: ErrorCodeSchema,
  message: Type.String({ minLength: 1 }),
});
```

### 1.7 Derived ids

`packages/contracts/src/ids.ts` is 24 lines; the whole file is the convention.

```ts
/** `copa-libertadores:md1` */
export function matchdayId(leagueId: string, number: number): string {
  return `${leagueId}:md${number}`;
}

/** `copa-libertadores:md1:RIV-BOC` — home team first, so the id is not symmetric. */
export function matchId(matchdayId: string, homeTeamCode: string, awayTeamCode: string): string {
  return `${matchdayId}:${homeTeamCode}-${awayTeamCode}`;
}
```

`packages/contracts/src/ids.ts:1-13` states why they live in the contract and what the colon
costs clients:

```
 * They live in the contract because they cross apps: the public API writes
 * them, the back office addresses them in its routes, and the workers resolve
 * them off a message. A shape only one app knows how to build is not derived —
 * it is a private convention that happens to be readable.
 *
 * The separator is a colon, so an id is legal in a URL path segment but must be
 * `encodeURIComponent`-ed by clients — see the back office's route notes.
```

### 1.8 Messaging names and the command body

`packages/contracts/src/messaging.ts:17-31`

```ts
export const SURVIVOR_COMMANDS_EXCHANGE = 'survivor.commands';
export const RESOLUTION_QUEUE = 'matchday.resolution';
export const RESOLUTION_BINDING_KEY = 'matchday.resolve.*';
export const SURVIVOR_DLX = 'survivor.dlx';
export const RESOLUTION_DLQ = 'matchday.resolution.dlq';
```

`packages/contracts/src/messaging.ts:34-47`

```ts
export function resolveRoutingKey(penkaId: string): string {
  return `matchday.resolve.${penkaId}`;
}

export function resolveMessageId(penkaId: string, matchday: number): string {
  return `resolve:${penkaId}:${matchday}`;
}
```

`packages/contracts/src/messaging.ts:55-61`

```ts
export const ResolveMatchdayCommandSchema = StrictObject({
  penkaId: IdSchema,
  leagueId: IdSchema,
  matchday: Type.Integer({ minimum: 1 }),
  requestedAt: IsoDateTimeSchema,
});
export type ResolveMatchdayCommand = Static<typeof ResolveMatchdayCommandSchema>;
```

The matchday is addressed by **number**, not by id — `packages/contracts/src/messaging.ts:49-54`
gives the reason: "a number cannot silently point at a calendar the penka is not on".

### 1.9 Operational keys

`packages/contracts/src/ops.ts:19` — one global key, not one per penka:

```ts
export const POLLING_PROFILE_KEY = 'ops:pollingProfile';
```

`packages/contracts/src/ops.ts:10-13` records the rejected alternative verbatim:

```
 * Rejected alternative, kept here as the upgrade path if editorial control is
 * ever wanted: a per-penka override read first, with this key as the fallback
 * (`penka:{penkaId}:pollingProfile` → `ops:pollingProfile` → `normal`).
```

`packages/contracts/src/ops.ts:26-28`, `:37-39`, `:52`, `:55`, `:58`:

```ts
export function toPollingProfile(raw: string | null): PollingProfile {
  return Value.Check(PollingProfileSchema, raw) ? raw : 'normal';
}

export function boardCacheKey(penkaId: string): string {
  return `penka:${penkaId}:board`;
}

export const BOARD_CACHE_TTL_SECONDS = 60;
const POLL_SECONDS: Record<PollingProfile, number> = { live: 2, normal: 10, slow: 30 };
export const NEAR_LOCK_MS = 10 * 60_000;
```

`packages/contracts/src/ops.ts:80-86` — the cadence rule, computed server-side:

```ts
export function nextPollInSec({ profile, now, lockAt }: NextPollInput): number {
  if (profile !== 'normal') {
    return POLL_SECONDS[profile];
  }
  const msToLock = lockAt.getTime() - now.getTime();
  return msToLock < NEAR_LOCK_MS ? POLL_SECONDS.live : POLL_SECONDS.normal;
}
```

`POLL_SECONDS` is module-private; only `nextPollInSec` is exported.

---

## 2. Persistence

### 2.1 `db.collection(...)` call sites

Eight collections, twenty-one typed accessors across four processes. No other file in the
repository calls `db.collection` directly.

| Collection      | Accessors                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`         | `apps/api/src/modules/auth/store.ts:20`, `apps/workers/src/modules/resolution/store.ts:124`                                                                       |
| `refreshTokens` | `apps/api/src/modules/auth/store.ts:24`                                                                                                                           |
| `penkas`        | `apps/api/src/modules/penkas/store.ts:53`, `apps/backoffice-api/src/modules/admin/store.ts:78`, `apps/workers/src/modules/resolution/store.ts:104`                 |
| `entries`       | `apps/api/src/modules/penkas/store.ts:57`, `apps/backoffice-api/src/modules/admin/store.ts:82`, `apps/workers/src/modules/resolution/store.ts:108`                 |
| `matchdays`     | `apps/api/src/modules/penkas/store.ts:61`, `apps/backoffice-api/src/modules/admin/store.ts:86`, `apps/workers/src/modules/resolution/store.ts:112`                 |
| `matches`       | `apps/api/src/modules/penkas/store.ts:65`, `apps/backoffice-api/src/modules/admin/store.ts:90`, `apps/workers/src/modules/resolution/store.ts:116`                 |
| `picks`         | `apps/api/src/modules/game/store.ts:21`, `apps/backoffice-api/src/modules/admin/store.ts:94`, `apps/workers/src/modules/resolution/store.ts:120`                   |
| `resolutions`   | `apps/api/src/modules/game/store.ts:46`, `apps/workers/src/modules/resolution/store.ts:128`                                                                        |

### 2.2 Document types are declared per process, on purpose

Each app declares its own `PenkaDoc`/`EntryDoc`/`MatchdayDoc`/`MatchDoc`/`PickDoc` rather
than importing a shared one. `apps/api/src/modules/game/store.ts:29-33` states the rule:

```
 * The shape is declared twice on purpose, once per process, the same way the
 * back office declares its own `PenkaDoc`: a collection crossing an app boundary
 * is a contract about *bytes in Mongo*, and a shared TypeScript interface would
 * only make the two apps look coupled without making them agree.
```

`apps/api/src/modules/penkas/store.ts:4` names the other half of the rule:

```ts
/** Mongo document shapes — internal to the API; they never cross a contract boundary. */
```

Declaration sites: `apps/api/src/modules/penkas/store.ts:5,14,29,42`,
`apps/api/src/modules/auth/store.ts:5,12`, `apps/api/src/modules/game/store.ts:13,35`,
`apps/backoffice-api/src/modules/admin/store.ts:19,28,50,59,70`,
`apps/workers/src/modules/resolution/store.ts:24,33,44,53,69,77,93`.

### 2.3 Constructed `_id`s

Two collections have string `_id`s built by the contract's id functions; everything else
uses Mongo's `ObjectId`.

`apps/api/src/modules/penkas/store.ts:24-34`

```ts
/**
 * Matchdays and matches belong to a LEAGUE, not to a penka: every penka on a
 * league plays the same calendar. Their `_id`s are derived from the league and
 * matchday number so materializing twice is a no-op instead of a duplicate.
 */
export interface MatchdayDoc {
  _id: string;
  leagueId: string;
  number: number;
  status: MatchdayStatus;
  lockAt: Date;
}
```

`apps/api/src/modules/penkas/store.ts:42-49` — `MatchDoc._id: string`, same reason.

`apps/api/src/modules/game/store.ts:8-11` records the consequence for picks:

```
 * `matchdayId` is the derived league-scoped id (`copa-libertadores:md1`), so a
 * pick needs no penkaId of its own — the entry already names the penka.
```

### 2.4 Index-creation helpers

Four helpers, each called by its own process at boot.

`apps/api/src/modules/auth/store.ts:29-33` (`ensureAuthIndexes`)

```ts
    usersCollection(db).createIndex({ email: 1 }, { unique: true }),
    refreshTokensCollection(db).createIndex({ tokenHash: 1 }, { unique: true }),
    …
    refreshTokensCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
```

`apps/api/src/modules/penkas/store.ts:67-81` (`ensurePenkaIndexes`), with the comments that
explain which index is load-bearing:

```ts
export async function ensurePenkaIndexes(db: Db): Promise<void> {
  await Promise.all([
    // The join code is the whole security of joining, and the retry-on-collision
    // loop leans on this index to detect a taken code race-free.
    // When penkas gain an end state, this becomes a partial index over active
    // penkas so finished ones give their codes back.
    penkasCollection(db).createIndex({ joinCode: 1 }, { unique: true }),
    // One entry per user per penka: this is what makes joining idempotent.
    entriesCollection(db).createIndex({ penkaId: 1, userId: 1 }, { unique: true }),
    entriesCollection(db).createIndex({ userId: 1 }),
    matchdaysCollection(db).createIndex({ leagueId: 1, number: 1 }, { unique: true }),
    matchesCollection(db).createIndex({ matchdayId: 1 }),
    matchesCollection(db).createIndex({ leagueId: 1 }),
  ]);
}
```

`apps/api/src/modules/game/store.ts:50-55` (`ensureGameIndexes`)

```ts
  // One pick per entry per matchday. Submitting is an upsert that leans on this
  // index to settle a race: the loser gets a duplicate key and updates instead.
  // Its prefix also serves the board's read, which fetches a whole matchday's
  // picks by entry id.
  await picksCollection(db).createIndex({ entryId: 1, matchdayId: 1 }, { unique: true });
```

`apps/backoffice-api/src/modules/admin/store.ts:110-114` (`ensureAdminIndexes`) — read-path
indexes only:

```ts
    penkasCollection(db).createIndex({ leagueId: 1 }),
    picksCollection(db).createIndex({ matchdayId: 1 }),
```

`apps/workers/src/modules/resolution/store.ts:143-145` (`ensureWorkerIndexes`) — the
once-only-resolution index, owned by the process that writes the document:

```ts
  await resolutionsCollection(db).createIndex({ penkaId: 1, matchdayId: 1 }, { unique: true });
```

**Consequence for any test or tool that resets data**: dropping the database drops these
indexes, and they are the mechanism under test (§5.6).

### 2.5 Document → contract mappers

Mappers live beside the documents and are the only place a `Date` becomes an ISO string or
an `ObjectId` becomes a string id.

`apps/api/src/modules/penkas/store.ts:83` (`toPenka`), and further down the same file
`toEntry`; `apps/api/src/modules/game/store.ts` (`toMatchday`, `toMatch`, `toPlayerPick`,
`toResolution`); `apps/backoffice-api/src/modules/admin/store.ts:117,128,141,152`
(`toPenka`, `toEntry`, `toMatchday`, `toMatch`);
`apps/workers/src/modules/resolution/store.ts:147,160,171,183,193` (`toEntry`, `toMatchday`,
`toMatch`, `toPlayerPick`, `toResolution`).

`toMatchday` and `toMatch` take the document by value rather than as `WithId<…>` because the
`_id` is already the string id (`apps/api/src/modules/game/store.ts:58-60`).

### 2.6 Duplicate-key detection

One helper, `apps/api/src/lib/mongo-errors.ts:3-17`:

```ts
const DUPLICATE_KEY = 11000;
…
/**
 * … one of them is a duplicate key — an empty list does NOT qualify, since a
 * …
 */
export function isDuplicateKeyError(error: unknown): boolean {
```

It is bulk-aware: `insertMany({ ordered: false })` reports failures in `writeErrors`, so the
helper inspects the list as well as the top-level code.

Call sites: `apps/api/src/modules/auth/routes.ts:91` (register race on the unique email
index), `apps/api/src/modules/penkas/routes.ts:74` (join-code collision) and `:108`
(concurrent join), `apps/api/src/modules/penkas/materialize.ts:12` (concurrent calendar),
`apps/api/src/modules/game/routes.ts:196` (concurrent pick upsert).

`@penka/backoffice-api` and `@penka/workers` have no copy of this helper: neither inserts
into a uniquely-indexed collection on a contended path except through
`resolutions.insertOne`, which is handled by `finalizeMatchday`'s own branch.

### 2.7 Join codes

`apps/api/src/modules/penkas/join-code.ts` is 26 lines; the header is the trade-off record:

```ts
/**
 * 4 digits, 0000–9999, so a code can be read out loud across an office — a
 * DELIBERATE MVP ceiling, not an oversight. The trade-offs it buys:
 *   - 10,000 codes total, so a popular deployment eventually runs out of
 *     concurrent penkas and creation fails with join_code_space_exhausted;
 *   - the space is small enough to enumerate, which is why joining is rate
 *     limited per user AND per IP rather than trusting the code alone.
 * The production path is 6 alphanumeric characters (~2.2 billion codes), which
 * removes both problems and is a drop-in replacement for this generator.
 */
export const JOIN_CODE_SPACE = 10_000;

/** Give up after this many collisions and report the space as exhausted. */
export const MAX_JOIN_CODE_ATTEMPTS = 5;
```

`apps/api/src/modules/penkas/join-code.ts:20-26` — uniformity is explicit:

```ts
/**
 * Cryptographically random and uniform: `randomInt` rejection-samples, so no
 * code is likelier than another (a `% 10000` over random bytes would bias the
 * low end and make guessing measurably easier).
 */
export const generateJoinCode: JoinCodeGenerator = () =>
  randomInt(JOIN_CODE_SPACE).toString().padStart(4, '0');
```

The retry loop is `insertWithJoinCode` at `apps/api/src/modules/penkas/routes.ts:63-85`; the
index, not a pre-check, is the arbiter (`:58-62`), and exhaustion is a 503 with
`join_code_space_exhausted` (`:86-91`).

### 2.8 Idempotent join

`apps/api/src/modules/penkas/routes.ts:88-116` (`ensureEntry`):

```ts
/**
 * Add the user to the penka, or hand back the entry they already have —
 * joining twice is the same as joining once. `$setOnInsert` plus the unique
 * (penkaId, userId) index means a double-click cannot cost a player their
 * progress by resetting lives.
 */
```

The upsert uses `$setOnInsert` with `returnDocument: 'after'`, and falls back to a plain
`findOne` when the unique index rejects the loser of a race. The route answers **200** on a
repeat join, not 409 — see §3.6.

### 2.9 Rollback helper

`apps/api/src/modules/penkas/rollback.ts:5-15`

```ts
/**
 * Undo a penka whose creation could not be finished. A penka with no players
 * is invisible to every endpoint yet still occupies one of the 10,000 join
 * codes (see join-code.ts), so leaving it behind quietly shrinks the space for
 * everyone.
 *
 * The caller is already throwing the failure that triggered this rollback, so a
 * failure HERE cannot be raised — it is logged instead, with the id an operator
 * needs to reclaim the code by hand.
 */
export async function discardPenka(
```

It is invoked from the create handler, which runs the penka insert and the calendar
materialization concurrently with `Promise.allSettled` rather than `Promise.all`
(`apps/api/src/modules/penkas/routes.ts:196-201`): `all` would discard the handle needed to
compensate.

### 2.10 Calendar materialization

`apps/api/src/modules/penkas/materialize.ts:20-35` — the whole idempotency argument, plus
the completeness check:

```
 * Three things keep this idempotent, in order of how much they are relied on:
 *   1. the `_id`s are derived from the league and matchday, so re-inserting is
 *      a duplicate key rather than a second calendar;
 *   2. the unique index on (leagueId, number) enforces that at the database;
 *   3. the reads below are only a fast path that skips the write entirely.
 * Two creators racing on a fresh league therefore end with one calendar, and
 * whoever won sets the lock times for everyone.
 *
 * The fast path checks BOTH collections because they are written in two steps:
 * a run that inserted the matchdays and then died would otherwise leave the
 * league stranded forever, since every later call would find those matchdays
 * and return without ever inserting the matches.
```

`apps/api/src/modules/penkas/materialize.ts:44-52`

```ts
  const [existingMatchday, existingMatch] = await Promise.all([
    matchdaysCollection(db).findOne({ leagueId }, { projection: { _id: 1 } }),
    matchesCollection(db).findOne({ leagueId }, { projection: { _id: 1 } }),
  ]);
  if (existingMatchday !== null && existingMatch !== null) {
    return;
  }
```

Both inserts are `{ ordered: false }` so a partial calendar finishes instead of stopping at
the first document that already exists (`:53-56`).

Lock times are **relative to the moment of first materialization**: `buildLeagueCalendar`
(`apps/api/src/modules/penkas/calendar.ts`) resolves each template's `lockAtOffsetMinutes`
against the `now` it is handed, and `kickoffAt === lockAt`.

---

## 3. App wiring — `apps/api`

### 3.1 `buildApp` signature and options

`apps/api/src/app.ts:15-37`

```ts
export interface BuildAppOptions {
  config: AppConfig;
  logger?: boolean;
  /** Seam for tests that need deterministic join codes; production uses the default. */
  generateJoinCode?: JoinCodeGenerator;
}

/**
 * Composition root: wires the error handler, infrastructure plugins, and
 * routes. Constructing the app has no side effects — Mongo/Redis connections
 * open at ready()/listen() and fail fast there.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    // Rate limiting keys on request.ip, so forwarded headers are only honored
    // when a trusted proxy is actually in front of the API.
    trustProxy: config.trustProxy,
    // AJV strips unknown properties by default; that would silently defeat the
    // closed (additionalProperties: false) schemas in @penka/contracts.
    ajv: { customOptions: { removeAdditional: false } },
  });
```

Registration order, `apps/api/src/app.ts:39-63`: error handler, not-found handler, `mongo`,
`redis`, `rate-limit`, `auth`, `/health`, then `authRoutes`, `catalogRoutes`, `penkaRoutes`,
`gameRoutes` — all under `/api/v1`. The last line is load-bearing (`:62`):

```ts
  // After penkaRoutes: the game reads the calendar that module materializes.
```

### 3.2 Decorators registered on the instance

| Decorator        | Declared / set                                                   |
| ---------------- | ---------------------------------------------------------------- |
| `mongo`          | `apps/api/src/plugins/mongo.ts:4-5`, `:21`                        |
| `db`             | `apps/api/src/plugins/mongo.ts:22`                                |
| `redis`          | `apps/api/src/plugins/redis.ts:4-5`, `:21`                        |
| `tokens`         | `apps/api/src/plugins/auth.ts:6-7`, `:35`                         |
| `authenticate`   | `apps/api/src/plugins/auth.ts:36`                                 |
| `rateLimit`, `createRateLimit` | added by `@fastify/rate-limit` itself, registered at `apps/api/src/plugins/rate-limit.ts:20` |

### 3.3 Plugin metadata

| Plugin       | `name`         | `dependencies` | File                                     |
| ------------ | -------------- | -------------- | ---------------------------------------- |
| mongo        | `mongo`        | —              | `apps/api/src/plugins/mongo.ts:27`       |
| redis        | `redis`        | —              | `apps/api/src/plugins/redis.ts:30`       |
| rate-limit   | `rate-limit`   | `['redis']`    | `apps/api/src/plugins/rate-limit.ts:29`  |
| auth         | `auth`         | —              | `apps/api/src/plugins/auth.ts:48`        |

### 3.4 Per-route-module required-decorator assertions

Every route module asserts its own preconditions at registration time rather than failing on
the first request.

| Module                                        | `REQUIRED_DECORATORS`                                     |
| --------------------------------------------- | --------------------------------------------------------- |
| `apps/api/src/modules/auth/routes.ts:54`      | `['db', 'tokens', 'authenticate', 'rateLimit']`            |
| `apps/api/src/modules/penkas/routes.ts:36`    | `['db', 'authenticate', 'createRateLimit']`                |
| `apps/api/src/modules/game/routes.ts:52`      | `['db', 'redis', 'authenticate']`                          |
| `apps/backoffice-api/src/modules/admin/routes.ts:43` | `['db', 'redis', 'publisher', 'requireAdmin']`      |

The failure message names the plugins to register, e.g.
`apps/api/src/modules/penkas/routes.ts:125-127`:

```ts
        `penkaRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'rate-limit, and auth plugins before it',
```

`catalogRoutes` asserts nothing — it reads a hardcoded catalog and touches no decorator.

### 3.5 Rate limiting: the plugin and the two hand-counted budgets

`apps/api/src/plugins/rate-limit.ts:10-31` — registered once, globally off:

```ts
/**
 * Registered with global:false — only routes that opt in via
 * `config.rateLimit` (register and login) are limited, at `max` requests per
 * minute per IP. Counters live in Redis so the limit holds across instances.
 * The 429 body is the canonical error envelope with code rate_limited.
 */
export const rateLimitPlugin = fp<RateLimitPluginOptions>(
  async (app, options) => {
    await app.register(rateLimit, {
      global: false,
      max: options.max,
      timeWindow: '1 minute',
      redis: app.redis,
      // The builder's result travels through the app error handler, so return
      // an ApiError and let the handler shape the canonical envelope.
      errorResponseBuilder: (_request, context) =>
        new ApiError(429, ErrorCodes.rate_limited, `Rate limit exceeded, retry in ${context.after}`),
    });
  },
  { name: 'rate-limit', dependencies: ['redis'] },
);
```

Joining is limited **twice**, and deliberately not with a second `rateLimit` hook —
`apps/api/src/modules/penkas/routes.ts:132-152`:

```ts
  // Joining is the one guessable endpoint — 10,000 codes is small enough to
  // walk — so it carries two independent budgets: one per host and one per
  // account, so neither rotating IPs nor rotating logins buys extra attempts.
  //
  // These are createRateLimit checks rather than app.rateLimit() hooks on
  // purpose: a rateLimit() hook marks the request as limited and every later
  // one on the same route returns without counting, so the second budget would
  // silently never apply. Counting by hand also keeps the two Redis counters
  // apart — limiters built off the decorator carry no route information, so
  // their keys would collide without these prefixes.
  const perMinute = { max: config.rateLimitMax, timeWindow: '1 minute' } as const;
  const countByIp = app.createRateLimit({
    ...perMinute,
    keyGenerator: (request) => `join:ip:${request.ip}`,
  });
  const countByUser = app.createRateLimit({
    ...perMinute,
    // Runs after authenticate, so userId is set; the fallback is unreachable.
    keyGenerator: (request) => `join:user:${request.userId ?? request.ip}`,
  });
```

The `enforce` helper (`:154-168`) sets `retry-after` and throws the canonical
`ApiError(429, 'rate_limited', …)`.

### 3.6 Route table (actual `printRoutes()` dump)

Captured by booting `buildApp` and printing the tree.

```
@penka/api
├── /health (GET, HEAD)
├── /api/v1/auth/register (POST)
├── /api/v1/auth/refresh (POST)
├── /api/v1/auth/login (POST)
├── /api/v1/me (GET, HEAD)
│   └── /penkas (GET, HEAD)
├── /api/v1/catalog/leagues (GET, HEAD)
│   └── /:leagueId (GET, HEAD)
└── /api/v1/penkas (POST)
    ├── /join (POST)
    ├── /:penkaId/board (GET, HEAD)
    ├── /:penkaId/me (GET, HEAD)
    ├── /:penkaId/matchday/current (GET, HEAD)
    └── /:penkaId/picks (POST)
```

Notable shapes: joining is `POST /api/v1/penkas/join` with the code in the body (not a path
segment), and submitting a pick is `POST /api/v1/penkas/:penkaId/picks` with
`{ teamCode }` — a catalog code, never a match or team id.

### 3.7 `apps/backoffice-api`

`apps/backoffice-api/src/app.ts:12-24` — the options carry two test seams:

```ts
export interface BuildAppOptions {
  config: AppConfig;
  /**
   * `true` in production. Tests that assert on a log line — the resolve
   * rollback is only visible there — pass pino options with their own stream.
   */
  logger?: FastifyServerOptions['logger'];
  /**
   * Seam for tests that need to watch — or break — what gets published;
   * production connects to RabbitMQ through the plugin below.
   */
  publisher?: ResolutionPublisher;
}
```

`apps/backoffice-api/src/app.ts:33-40` — no `trustProxy`, with the reason:

```ts
    ajv: { customOptions: { removeAdditional: false } },
    // No trustProxy: this API is operator-only and keys nothing on the client
    // IP, so there is no header worth trusting (see src/config.ts).
```

`apps/backoffice-api/src/app.ts:46-52` — the publisher seam bypasses the plugin entirely:

```ts
  if (options.publisher === undefined) {
    app.register(rabbitPlugin, { url: config.rabbitUrl });
  } else {
    // Decorated here rather than through a plugin so an injected publisher is in
    // place before boot: nothing dials a broker that was never needed.
    app.decorate('publisher', options.publisher);
  }
```

`/health` sits **outside** the admin guard (`apps/backoffice-api/src/app.ts:55-61`):
"a load balancer has no admin key".

Decorators: `mongo`/`db` (`plugins/mongo.ts:21-22`), `redis` (`plugins/redis.ts:21`),
`publisher` (`plugins/rabbit.ts:31` or `app.ts:51`), `requireAdmin`
(`plugins/admin-auth.ts:47`). Plugin names: `mongo`, `redis`, `rabbit`, `admin-auth` — none
declares `dependencies`.

**Admin authentication**, `apps/backoffice-api/src/plugins/admin-auth.ts:17-53`. The header
name itself comes from the contract (`ADMIN_KEY_HEADER`, `api/admin.ts:22`), so the API and
its console cannot drift apart on it:

```ts
/**
 * Constant-time comparison. A plain `===` returns as soon as two bytes differ,
 * so an attacker who can time the answer learns the key one character at a
 * time; the length is hashed into the comparison by rejecting a mismatch up
 * front, which leaks only how long the key is.
 */
function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

and the trade-off, recorded in the plugin itself (`:31-43`):

```
 * This is a deliberate MVP decision, not a design: a shared secret has no
 * identity behind it, so an audit log could not say WHO closed a matchday, and
 * rotating it logs out every operator at once. The production path is
 * role-based users (the `users` collection already exists, and this API would
 * check a role claim on the same JWTs @penka/api issues) — at which point this
 * plugin is replaced, not extended.
```

Missing, malformed and wrong keys all get one answer: `401 unauthorized` (`:50-52`).

**Route table**, actual `printRoutes()` dump:

```
@penka/backoffice-api
├── /health (GET, HEAD)
├── /admin/v1/penkas (GET, HEAD)
├── /admin/v1/polling-profile (PUT)
├── /admin/v1/leagues/:leagueId/matchdays/:number (GET, HEAD)
│   ├── /close (POST)
│   └── /resolve (POST)
└── /admin/v1/matches/:matchId/result (POST)
```

Matchdays and the resolve trigger are addressed by **league + number**, not by penka: one
admin action fans out to every penka on the league. A `matchId` in the path contains colons
(§1.7), so clients must `encodeURIComponent` it — find-my-way decodes route params before
the handler runs, and the server never decodes a second time.

**Once-only resolve.** `apps/backoffice-api/src/modules/admin/resolve.ts:50-66` is the
reason the request timestamp is claimed before the penkas are read:

```
 * The timestamp is not decoration: `@penka/workers` counts the penkas of
 * `{ leagueId, createdAt <= requestedAt }` to decide the matchday is finished,
 * so the set of penkas that got a command and the set the workers wait for must
 * be derived from the SAME instant. A second press that minted a fresh `new
 * Date()` would build a wider set than the first — and a penka that joined in
 * between would be resolved by nobody, because the first fan-out has already
 * finished the matchday without it.
```

`claimResolveRequest` (`:68-92`) does it in one conditional `findOneAndUpdate`;
`requestResolution` (`:107-119`) compensates a failed publish by clearing **only its own**
claim, and `clearResolveRequest` (`:34-48`) logs rather than throws, because the caller is
already throwing the real cause.

### 3.8 `apps/workers`

There is no HTTP surface. `apps/workers/src/worker.ts:26-31`:

```
 * There is no HTTP here and there never will be — a worker that answered a
 * health check would be an API. Liveness is the process being up and the queue
 * draining, which is what an operator watches in the RabbitMQ console.
```

Boot order (`apps/workers/src/worker.ts:44-73`): Mongo connect → `ensureWorkerIndexes` →
Redis `ping` → AMQP connect → `declareTopology` → confirm channel → lifecycle watcher →
`startResolutionConsumer`. Two channels on one connection, because confirm mode is
per-channel and only the retry path needs it (`:32-35`).

`apps/workers/src/messaging/topology.ts:27` (`declareTopology`), mirrored byte for byte in
`apps/backoffice-api/src/messaging/topology.ts`:

```ts
await channel.assertExchange(SURVIVOR_COMMANDS_EXCHANGE, 'topic', { durable: true });
await channel.assertExchange(SURVIVOR_DLX, 'topic', { durable: true });
await channel.assertQueue(RESOLUTION_DLQ, { durable: true });
await channel.bindQueue(RESOLUTION_DLQ, SURVIVOR_DLX, RESOLUTION_DLQ);
await channel.assertQueue(RESOLUTION_QUEUE, {
  durable: true, deadLetterExchange: SURVIVOR_DLX, deadLetterRoutingKey: RESOLUTION_DLQ,
});
await channel.bindQueue(RESOLUTION_QUEUE, SURVIVOR_COMMANDS_EXCHANGE, RESOLUTION_BINDING_KEY);
```

`apps/workers/src/worker.ts:58-61` explains the duplication:

```ts
  // Declared here too, with the same arguments the back office uses. Whichever
  // process boots first creates the topology; a disagreement about the queue's
  // arguments is a PRECONDITION_FAILED at boot rather than a message that
  // quietly never arrives.
```

**Retry accounting** is a header the consumer writes, not the broker's `x-death` —
`apps/workers/src/messaging/consumer.ts:11-20`:

```
 * It exists because `nack(requeue: true)` cannot carry a counter: the broker's
 * own `x-death` array only accrues when a message is actually dead-lettered, so
 * a requeue loop is invisible and unbounded. A countable retry has to go back
 * through the exchange with the count written on it.
 */
export const ATTEMPT_HEADER = 'x-attempt';
```

Retries republish through the exchange, never straight to the queue, and there is
deliberately no backoff (`apps/workers/src/messaging/consumer.ts:63-72`).

**`prefetch = 1` is an ordering guarantee, not a throughput setting** —
`apps/workers/src/messaging/consumer.ts:108-114`:

```
 * `prefetch(1)` keeps one delivery in flight at a time. That is what gives a
 * penka's matchdays a defined order with a single consumer, and it is a
 * deliberate MVP limit: the scale path is a consistent-hash exchange keyed on
 * the penka (or one queue per shard), not a larger prefetch, which would let two
 * matchdays of the same penka resolve concurrently.
```

Three delivery outcomes are enumerated at `:93-107`: done → ack; poison (not JSON, or not
the command schema) → `nack(requeue:false)` straight to the DLQ; not-yet → counted retry up
to `maxAttempts`, then a real `nack(requeue:false)` so the **broker** writes the `x-death`
trail.

Handler pipeline: `loadResolutionState` (`modules/resolution/load.ts:49`) → engine →
`applyOutcome` (`apply.ts:92`) → `finalizeMatchday` (`finalize.ts:48`) → `refreshBoard`
(`board.ts:65`). `createResolutionHandler` (`handler.ts:95`) returns a discriminated
`ResolutionResult` (`handler.ts:26`) the consumer branches on — it never throws to signal a
retry.

---

## 4. `@penka/game-engine`

### 4.1 Entrypoint

`packages/game-engine/src/index.ts`, verbatim and complete:

```ts
export * from './types';
export * from './time';
export * from './validate-pick';
export * from './current-matchday';
export * from './resolve-matchday';
export * from './standings';
export * from './board';
export * from './pick-result';
```

`packages/game-engine/src/test-support/build.ts` is not exported.

### 4.2 Exported signatures

| Signature                                                                              | File:line                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `type PickRejectionCode = Extract<…>`                                                  | `src/types.ts:7`                                     |
| `type ResolveRejectionCode = Extract<…>`                                                | `src/types.ts:12`                                    |
| `type PickValidation = { ok: true } \| { ok: false; code: PickRejectionCode }`           | `src/types.ts:17`                                    |
| `interface EntryEffect`                                                                  | `src/types.ts:20`                                    |
| `type PickResult = 'won' \| 'lost' \| 'void'`                                            | `src/types.ts:37`                                    |
| `interface ResolutionSummary` / `interface ResolutionOutcome`                            | `src/types.ts:39`, `:53`                             |
| `type ResolveMatchdayResult = …`                                                         | `src/types.ts:63`                                    |
| `function isoToEpochMs(iso: string): number`                                             | `src/time.ts:6`                                      |
| `function tryIsoToEpochMs(iso: string): number \| null`                                  | `src/time.ts:15`                                     |
| `function validatePick(input: ValidatePickInput): PickValidation`                        | `src/validate-pick.ts:24`                            |
| `function selectCurrentMatchday<T extends MatchdayProgress>(…)`                          | `src/current-matchday.ts:19`                         |
| `function didTeamWin(matches: readonly Match[], teamCode: string): boolean`              | `src/resolve-matchday.ts:33`                         |
| `function resolveMatchday(input: ResolveMatchdayInput): ResolveMatchdayResult`           | `src/resolve-matchday.ts:113`                        |
| `function computeStandings(entries: readonly Entry[]): Standings`                        | `src/standings.ts:29`                                |
| `function rankWinners(entries: readonly Entry[]): Entry[]`                               | `src/standings.ts:41`                                |
| `function isMatchdayLocked(matchday: Matchday, now: Date): boolean`                      | `src/board.ts:47`                                    |
| `function buildBoard(input: BuildBoardInput): Board`                                     | `src/board.ts:61`                                    |
| `function pickResultOf(effect: EntryEffect): PickResult`                                 | `src/pick-result.ts:16`                              |

The engine has no runtime dependencies and no I/O: every function takes plain contract
values and a `now: Date` where time matters.

`resolveMatchday` returns a **Result**, not a thrown error (`src/types.ts:63`): the worker
branches on it, which is what lets a "not yet" answer become a counted retry rather than a
crash.

`pickResultOf` exists so the player app never re-derives whether a pick won —
`apps/web` asks the engine (commit `2c08288`).

### 4.3 Which matchday is "current"

`packages/game-engine/src/current-matchday.ts:19` — `selectCurrentMatchday` returns the
lowest-numbered matchday that is **still unresolved**.

Consequences a reader must know before writing an assertion against a board:

- After a matchday resolves, the board **advances**: `matchday` increments, `isResolved`
  goes back to `false`, and every `pick` is `null` again.
- The resolved matchday moves into `board.history`, which is therefore the observable
  end-of-pipeline signal, not `isResolved`.
- Picks become visible on **close** (`isLocked === true`), not on resolve.

---

## 5. Test harness

### 5.1 `makeTestConfig`

Two copies, one per app with integration tests, both taking `Partial<AppConfig>` overrides.

`apps/api/test/integration/harness.ts:30-44`

```ts
export function makeTestConfig(infra: TestInfra, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    mongoUrl: infra.mongoUrl,
    mongoDbName: `penka-test-${randomUUID().slice(0, 8)}`,
    redisUrl: infra.redisUrl,
    jwtSecret: 'integration-test-secret-0123456789abcdef',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    // High enough that functional tests never trip it; rate-limit tests build
    // their own app with a tiny max on an isolated Redis database.
    rateLimitMax: 1000,
    trustProxy: false,
    ...overrides,
  };
}
```

`apps/backoffice-api/test/integration/harness.ts:49-64` adds `rabbitUrl` and
`adminApiKey: TEST_ADMIN_KEY` (`'integration-test-admin-key-0123456789'`, `:50`).

### 5.2 How a test gets a database name

`penka-test-${randomUUID().slice(0, 8)}`, minted per `makeTestConfig` call, so every test
file — and every app built inside one — gets its own database on the shared container.

### 5.3 Testcontainers helpers

`apps/api/test/integration/harness.ts:13-27` starts `mongo:7` and `redis:7` in parallel on
random host ports, "Same images as infra/docker-compose.yml".

`apps/backoffice-api/test/integration/harness.ts:8-14` explains why the broker lives in this
package and not a shared one:

```
 * This package's own harness, deliberately a sibling of @penka/api's rather
 * than a shared module: an app cannot import from another app's test folder,
 * and only this one publishes anything. Keeping the broker here means the
 * public API's suite never pays RabbitMQ's ~15s boot for tests that have no
 * queue in them, while every test in THIS package runs against a real broker
 * with the real topology — no flag to forget, no second code path.
```

RabbitMQ needs an explicit wait strategy (`:33-38`):

```ts
    // The AMQP port accepts connections before the broker will serve them, so
    // wait for the line that says it is actually up.
    new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .withStartupTimeout(120_000)
```

Other helpers: `failNextInsert` (`apps/api/test/integration/harness.ts:53-78`) patches
`db.collection` through a `Proxy` to make one insert reject; `connectTestBroker`
(`apps/backoffice-api/test/integration/harness.ts:87-119`) opens a second connection that
declares the same topology and drains the queue; `captureLogs` (`:127-141`) turns Fastify's
logger into an array of parsed lines; `startStack`
(`apps/workers/test/integration/harness.ts:152-171`) boots a real worker against a
numbered Redis database.

### 5.4 Redis DB indexes actually claimed

There is no allocator — a claim is a comment at the top of the suite that made it, and
every suite restates the whole table. `apps/api/test/integration/game.int.test.ts:1-5`:

```
 * Redis databases: this module claims `/7` and `/8` for throttled app instances.
 * `/1`–`/4` belong to auth.int.test.ts and `/5`–`/6` to penkas.int.test.ts (there
 * is no allocator, so the claim is this comment). No game route is throttled
 * today, so nothing here overrides the default database yet.
```

Claimed versus actually used:

| Index       | Claimed by                                                        | Used?                                                                     |
| ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `/1`–`/4`   | `apps/api/test/integration/auth.int.test.ts`                       | yes — `:318,342,363,389`                                                   |
| `/5`–`/6`   | `apps/api/test/integration/penkas.int.test.ts`                     | yes — `:486,509`                                                            |
| `/7`–`/8`   | `apps/api/test/integration/game.int.test.ts:1`                     | no — reserved; no game route is throttled                                   |
| `/9`–`/10`  | `apps/backoffice-api/test/integration/admin.int.test.ts:1`         | no — reserved; no admin route is throttled                                  |
| `/11`–`/12` | `apps/workers/test/integration/resolution.int.test.ts:60`          | `/11` only (`const REDIS_DB = 11`, `:68`); `/12` reserved for the next suite |

Mongo is split differently: per **test** rather than per module.
`apps/workers/test/integration/harness.ts` generates one database name and hands it to the
worker *and* to both APIs, because a worker resolving a different database than the test
seeded is a green test that proves nothing.

### 5.5 Vitest configuration

`packages/config/vitest.js`, verbatim and complete:

```js
export const unitTestConfig = {
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
  },
};

export const integrationTestConfig = {
  test: {
    include: ['test/**/*.int.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
};
```

The two suites cannot see each other's files: unit tests are `src/**/*.test.ts` and
integration tests are `test/**/*.int.test.ts`, matched by different configs and run by
different scripts.

### 5.6 The `e2e` workspace

`e2e/package.json` — a workspace package with **no `test` script**, so `turbo run test` never
launches a browser. Its scripts are `e2e` (`playwright test`), `e2e:install`, `build`
(`tsc --noEmit`) and `lint`.

`e2e/playwright.config.ts` — `fullyParallel: false`, `workers: 1`, `retries: 0`,
`timeout: 5 * 60_000`, `globalSetup: './support/global-setup.ts'`, one chromium project,
`use.baseURL = env.webUrl`. There is no Playwright `webServer`: the suite asserts against a
stack the operator started with `pnpm demo`, workers included.

`e2e/support/reset.ts` wipes documents with `deleteMany({})` per collection and deletes the
Redis keys `penka:*:board`, `ops:pollingProfile` and `fastify-rate-limit-*`. It never drops
the database, because dropping would take the unique indexes of §2.4 with it — the very
mechanisms under test. The wipe is also required for determinism: lock offsets are relative
to first materialization (§2.10), so only a fresh calendar guarantees an open matchday.

`e2e/support/api.ts` decodes every response through `Value.Check` against the
`@penka/contracts` schema, so contract drift fails the suite with the offending field named.

`e2e/tsconfig.json` widens `lib` to `["ES2022", "DOM"]` — the shared `node.json` preset has
no DOM, and the callbacks handed to `page.addInitScript` are compiled here but run in the
browser.

---

## 6. Commands

### 6.1 Root `package.json`

```json
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "demo": "node scripts/demo.mjs",
    "e2e": "pnpm --filter @penka/e2e e2e",
    "e2e:install": "pnpm --filter @penka/e2e e2e:install",
    "infra:up": "docker compose -f infra/docker-compose.yml up -d --wait",
    "infra:down": "docker compose -f infra/docker-compose.yml down"
  },
```

`packageManager` is `pnpm@9.15.9`; `engines.node` is `>=20`.

### 6.2 Workspace scripts

| Package                 | `dev`                  | `build`         | `test`        | `test:integration`                                | `lint`      |
| ----------------------- | ---------------------- | --------------- | ------------- | -------------------------------------------------- | ----------- |
| `@penka/api`            | `tsx watch src/server.ts` | `tsc --noEmit` | `vitest run` | `vitest run --config vitest.integration.config.ts` | `eslint .` |
| `@penka/backoffice-api` | `tsx watch src/server.ts` | `tsc --noEmit` | `vitest run` | `vitest run --config vitest.integration.config.ts` | `eslint .` |
| `@penka/workers`        | `tsx watch src/index.ts`  | `tsc --noEmit` | `vitest run` | `vitest run --config vitest.integration.config.ts` | `eslint .` |
| `@penka/web`            | `vite`                 | `vite build`    | `vitest run` | —                                                   | `eslint .` |
| `@penka/backoffice-web` | `vite`                 | `vite build`    | `vitest run` | —                                                   | `eslint .` |
| `@penka/contracts`      | —                      | `tsc --noEmit`  | `vitest run` | —                                                   | `eslint .` |
| `@penka/game-engine`    | —                      | `tsc --noEmit`  | `vitest run` (+ `test:coverage`) | —                               | `eslint .` |
| `@penka/config`         | —                      | —               | `vitest run` | —                                                   | `eslint .` |
| `@penka/e2e`            | —                      | `tsc --noEmit`  | **none**     | —                                                   | `eslint .` |

`build` is a **typecheck** for every Node package and a real bundle only for the two Vue
apps.

### 6.3 `turbo.json`

`globalPassThroughEnv`, verbatim:

```json
    "JWT_SECRET", "PORT", "MONGO_URL", "MONGO_DB", "REDIS_URL",
    "RATE_LIMIT_MAX", "TRUST_PROXY", "RABBITMQ_URL", "ADMIN_API_KEY",
    "PREFETCH", "MAX_ATTEMPTS", "LOG_LEVEL",
    "VITE_API_BASE_URL", "VITE_ADMIN_API_BASE_URL",
    "VITE_ADMIN_API_KEY", "VITE_ADMIN_RESET_ENDPOINT"
```

Tasks: `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**"]`), `dev`
(`cache: false, persistent: true`), `test`, `test:coverage` (`outputs: ["coverage/**"]`),
`test:integration` (`cache: false`), `lint`.

### 6.4 `pnpm demo`

`scripts/demo.mjs` is plain Node ESM with no dependencies. In order: copy `.env.example` →
`.env` when absent (announcing that the values are dev-only), load `.env` **without**
overwriting already-exported variables, validate `JWT_SECRET` and `ADMIN_API_KEY` (present,
≥32 characters) and exit non-zero listing every problem with the app that needs the
variable, then `docker compose -f infra/docker-compose.yml up -d --wait`, then
`pnpm exec turbo run dev` with stdio inherited while a concurrent poller prints the URL map
once all four HTTP services answer.

### 6.5 CI

`.github/workflows/ci.yml` — two jobs on `push`: `lint-and-unit` (`pnpm lint`, `pnpm test`)
and `integration` (`pnpm test:integration`), both on `ubuntu-latest` with Node 22 and
`pnpm install --frozen-lockfile`.

---

## 7. Frontends

Both Vue apps are Vite + Vue 3 + Pinia and talk to their API through a dev proxy.
`apps/web/vite.config.ts:22` and `apps/backoffice-web/vite.config.ts:24` both set
`strictPort: true`, and both configure `server.proxy` with a comment noting that setting
`VITE_API_BASE_URL` (resp. `VITE_ADMIN_API_BASE_URL`) bypasses the proxy entirely.

Neither API registers CORS (see "Not found"), which is why the proxy — and therefore the
fixed ports — are load-bearing for local development and for the `e2e` suite.

`apps/web` stores its session in `localStorage` under `penka.survivor.auth` as
`{ tokens, user }`. `apps/backoffice-web` keeps the operator's admin key under
`penka.survivor.adminKey` (`api/client.ts:29`) and sends it in `ADMIN_KEY_HEADER`, imported
from `@penka/contracts` — the same constant the API compares against.

---

## Not found / ambiguous

- **No CORS plugin anywhere.** `@fastify/cors` appears in no `package.json` and is imported
  by no file. Both browsers reach their API through the Vite dev proxy; a deployment that
  serves the SPAs from a different origin would need it.
- ~~**`ADMIN_KEY_HEADER` is declared twice and exported by neither package's public
  surface.**~~ **Resolved.** It now lives in `packages/contracts/src/api/admin.ts:22` and is
  imported by the API (`plugins/admin-auth.ts:4`), the console (`api/client.ts:3`), the
  integration harness and the `e2e` suite. The remaining literals are in
  `apps/backoffice-api/src/plugins/admin-auth.test.ts`, which asserts the wire spelling on
  purpose — including one deliberately capitalized `X-Admin-Key` proving HTTP header
  matching is case-insensitive.
- **No OpenAPI/Swagger.** No `@fastify/swagger`, no generated spec. The TypeBox schemas are
  the only machine-readable description of the API.
- **No Dockerfiles.** `infra/docker-compose.yml` provisions Mongo/Redis/RabbitMQ only; the
  apps are run from source by `turbo run dev`. There is no production image or deployment
  manifest in the repository.
- **CI does not run `pnpm build` or `pnpm e2e`.** `.github/workflows/ci.yml` runs lint, unit
  and integration tests. A type error that only `tsc --noEmit` catches, or a broken demo
  flow, would pass CI.
- **`/7`–`/10` and `/12` are reserved but unused** (§5.4). The comments claiming them are
  accurate about intent and about the absence of an allocator, but no test uses them today —
  a reader taking the table as a description of running code would be misled.
- **No `test` script for `@penka/e2e` is deliberate**, not an omission — but it also means
  `turbo run test` gives the e2e suite no coverage gate of any kind.
- **Penkas have no end state.** Nothing in the repository marks a penka finished, which is
  why the join-code index is a plain unique index and not a partial one over active penkas
  (`apps/api/src/modules/penkas/store.ts:69-72` names this as the future change).

---

## Accepted as-is

Decisions that look like gaps and are documented in the code as choices:

| Decision                                         | Recorded at                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| 4-digit join codes, 10,000-code ceiling          | `apps/api/src/modules/penkas/join-code.ts:3-12`                   |
| One shared admin API key, no operator identity    | `apps/backoffice-api/src/plugins/admin-auth.ts:31-43`             |
| One global polling profile, not per penka         | `packages/contracts/src/ops.ts:4-18`                              |
| 60-second board cache, not invalidated on close   | `packages/contracts/src/ops.ts:41-51`                             |
| `prefetch = 1` as an ordering guarantee           | `apps/workers/src/messaging/consumer.ts:108-114`                  |
| No retry backoff                                  | `apps/workers/src/messaging/consumer.ts:63-72`                    |
| Document shapes duplicated per process            | `apps/api/src/modules/game/store.ts:29-33`                        |
| Team codes instead of team documents              | `apps/api/src/modules/penkas/store.ts:36-40`                      |
| Idempotent join answers 200, not 409              | `apps/api/src/modules/penkas/routes.ts:88-93`                     |
| No health endpoint on the workers                 | `apps/workers/src/worker.ts:26-31`                                |

### Superseded by earlier editions of this document

The previous edition audited `c56bf74` and described a repository with four workspace
packages, no game module, no `picks`/`resolutions` collections, no id builders in the
contract, and no back office, workers or frontends. Every section above replaces the
corresponding one; nothing from that edition should be quoted as current.
