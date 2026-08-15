# Codebase conventions — factual inventory

Read-only audit of `penka-survivor` at commit `c56bf74` (working tree clean).
Every claim below cites `file:line` and quotes the code as it exists. Nothing here is
inferred from naming or from `CLAUDE.md`; where something does not exist it is recorded as
**NOT FOUND** in the last section.

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

`packages/contracts/src/index.ts:1-8` — the complete entrypoint, verbatim:

```ts
export * from './errors';
export * from './domain';
export * from './health';
export * from './api/auth';
export * from './api/catalog';
export * from './api/penkas';
export * from './api/game';
export * from './api/admin';
```

`./strict` is **not** re-exported. `StrictObject` is defined at
`packages/contracts/src/strict.ts:7` and is reachable only by deep import:

```ts
export function StrictObject<T extends TProperties>(properties: T, options?: ObjectOptions) {
```

`packages/contracts/src/test-support/fixtures.ts` is also not re-exported from the
entrypoint; it is imported by relative path from contract tests only
(`packages/contracts/src/domain.test.ts:21`, `packages/contracts/src/api/game.test.ts:11`,
and four sibling test files).

### 1.2 Full export list

Every `^export` in each re-exported module, with its line.

**`packages/contracts/src/errors.ts`**

| Line | Export |
| --- | --- |
| 9 | `const ErrorCodes` |
| 37 | `type ErrorCode` |
| 39 | `const ErrorCodeSchema` |
| 44 | `const ApiErrorSchema` |
| 50 | `type ApiError` |

**`packages/contracts/src/domain.ts`**

| Line | Export |
| --- | --- |
| 5 | `const IdSchema` |
| 8 | `const IsoDateTimeSchema` |
| 12 | `const EmailSchema` |
| 17 | `const RegionSchema` |
| 22 | `type Region` |
| 32 | `const TeamCodeSchema` |
| 38 | `const TeamSchema` |
| 44 | `type Team` |
| 46 | `const LeagueSchema` |
| 52 | `type League` |
| 55 | `const FixtureMatchupSchema` |
| 59 | `type FixtureMatchup` |
| 61 | `const FixtureTemplateMatchdaySchema` |
| 67 | `type FixtureTemplateMatchday` |
| 74 | `const FixtureTemplateSchema` |
| 78 | `type FixtureTemplate` |
| 82 | `const MatchOutcomeSchema` |
| 87 | `type MatchOutcome` |
| 96 | `const MatchSchema` |
| 104 | `type Match` |
| 106 | `const MatchdayStatusSchema` |
| 111 | `type MatchdayStatus` |
| 113 | `const MatchdaySchema` |
| 120 | `type Matchday` |
| 125 | `const UserSchema` |
| 131 | `type User` |
| 135 | `const PenkaSettingsSchema` |
| 140 | `type PenkaSettings` |
| 142 | `const PenkaSchema` |
| 150 | `type Penka` |
| 152 | `const EntryStatusSchema` |
| 153 | `type EntryStatus` |
| 155 | `const EntrySchema` |
| 165 | `type Entry` |
| 168 | `const PlayerPickSchema` |
| 176 | `type PlayerPick` |
| 178 | `const ResolutionSchema` |
| 186 | `type Resolution` |
| 191 | `const BoardPlayerSchema` |
| 195 | `type BoardPlayer` |
| 197 | `const BoardHistoryItemSchema` |
| 202 | `type BoardHistoryItem` |
| 209 | `const BoardSchema` |
| 219 | `type Board` |
| 222 | `const MyEntrySchema` |
| 228 | `type MyEntry` |

**`packages/contracts/src/health.ts`** — 4: `const HealthResponseSchema`; 8: `type HealthResponse`.

**`packages/contracts/src/api/auth.ts`**

| Line | Export |
| --- | --- |
| 5 | `const RefreshTokenSchema` |
| 7 | `const AuthTokensSchema` |
| 11 | `type AuthTokens` |
| 14 | `const RegisterRequestSchema` |
| 19 | `type RegisterRequest` |
| 21 | `const RegisterResponseSchema` |
| 25 | `type RegisterResponse` |
| 28 | `const LoginRequestSchema` |
| 32 | `type LoginRequest` |
| 34 | `const LoginResponseSchema` |
| 38 | `type LoginResponse` |
| 41 | `const RefreshRequestSchema` |
| 44 | `type RefreshRequest` |
| 46 | `const RefreshResponseSchema` |
| 49 | `type RefreshResponse` |
| 52 | `const MeResponseSchema` |
| 55 | `type MeResponse` |

**`packages/contracts/src/api/catalog.ts`**

| Line | Export |
| --- | --- |
| 5 | `const LeagueParamsSchema` |
| 8 | `type LeagueParams` |
| 11 | `const LeagueSummarySchema` |
| 17 | `type LeagueSummary` |
| 21 | `const ListLeaguesQuerySchema` |
| 24 | `type ListLeaguesQuery` |
| 26 | `const ListLeaguesResponseSchema` |
| 29 | `type ListLeaguesResponse` |
| 32 | `const LeagueDetailResponseSchema` |
| 37 | `type LeagueDetailResponse` |

**`packages/contracts/src/api/penkas.ts`**

| Line | Export |
| --- | --- |
| 6 | `const DEFAULT_PENKA_SETTINGS` |
| 10 | `const CreatePenkaSettingsSchema` |
| 16 | `type CreatePenkaSettings` |
| 18 | `const CreatePenkaRequestSchema` |
| 23 | `type CreatePenkaRequest` |
| 25 | `const CreatePenkaResponseSchema` |
| 28 | `type CreatePenkaResponse` |
| 31 | `const JoinPenkaRequestSchema` |
| 40 | `type JoinPenkaRequest` |
| 42 | `const JoinPenkaResponseSchema` |
| 46 | `type JoinPenkaResponse` |
| 49 | `const MyPenkaItemSchema` |
| 53 | `type MyPenkaItem` |
| 55 | `const MyPenkasResponseSchema` |
| 58 | `type MyPenkasResponse` |

**`packages/contracts/src/api/game.ts`**

| Line | Export |
| --- | --- |
| 12 | `const PenkaParamsSchema` |
| 15 | `type PenkaParams` |
| 18 | `const BoardResponseSchema` |
| 21 | `type BoardResponse` |
| 24 | `const MyEntryResponseSchema` |
| 27 | `type MyEntryResponse` |
| 30 | `const CurrentMatchdayResponseSchema` |
| 34 | `type CurrentMatchdayResponse` |
| 37 | `const SubmitPickRequestSchema` |
| 40 | `type SubmitPickRequest` |
| 42 | `const SubmitPickResponseSchema` |
| 45 | `type SubmitPickResponse` |

**`packages/contracts/src/api/admin.ts`**

| Line | Export |
| --- | --- |
| 12 | `const PollingProfileSchema` |
| 17 | `type PollingProfile` |
| 19 | `const MatchdayParamsSchema` |
| 22 | `type MatchdayParams` |
| 25 | `const AdminPoolSummarySchema` |
| 31 | `type AdminPoolSummary` |
| 33 | `const AdminPoolsResponseSchema` |
| 36 | `type AdminPoolsResponse` |
| 39 | `const AdminMatchdayDetailResponseSchema` |
| 43 | `type AdminMatchdayDetailResponse` |
| 46 | `const SetResultRequestSchema` |
| 50 | `type SetResultRequest` |
| 52 | `const SetResultResponseSchema` |
| 55 | `type SetResultResponse` |
| 58 | `const CloseMatchdayResponseSchema` |
| 61 | `type CloseMatchdayResponse` |
| 64 | `const ResolveMatchdayResponseSchema` |
| 68 | `type ResolveMatchdayResponse` |
| 71 | `const SetPollingProfileRequestSchema` |
| 74 | `type SetPollingProfileRequest` |
| 76 | `const SetPollingProfileResponseSchema` |
| 79 | `type SetPollingProfileResponse` |

### 1.3 Collisions with TypeScript utility types

Grep over `packages/contracts/src` for exports named exactly `Pick`, `Omit`, `Record`,
`Exclude`, `Partial`, `Readonly` returns **no matches** (exit 1). No exported schema or
type shadows a TypeScript utility type.

Exports whose names *contain* one of those words:

- `packages/contracts/src/domain.ts:168` `export const PlayerPickSchema`
- `packages/contracts/src/domain.ts:176` `export type PlayerPick`
- `packages/contracts/src/api/game.ts:37` `export const SubmitPickRequestSchema`
- `packages/contracts/src/api/game.ts:40` `export type SubmitPickRequest`
- `packages/contracts/src/api/game.ts:42` `export const SubmitPickResponseSchema`
- `packages/contracts/src/api/game.ts:45` `export type SubmitPickResponse`

**A pick is called `PlayerPick`** (schema: `PlayerPickSchema`). Not `Pick`.
`packages/contracts/src/domain.ts:167` states the reason in the source:

```ts
// Named PlayerPick (not Pick) so the exported type never shadows TypeScript's Pick<T, K>.
```

One non-exported local helper is named `omit`: `packages/contracts/src/test-support/fixtures.ts:6`
`export function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {` —
in `test-support`, which is not re-exported from the entrypoint (§1.1).

### 1.4 `TeamCodeSchema`, verbatim

`packages/contracts/src/domain.ts:24-36`:

```ts
/**
 * Stable short code, unique within its league. The catalog is fixed data, so a
 * code — not a generated id — is how a team is referenced inside a league.
 *
 * The alphabet is uppercase letters and digits only: storage derives document
 * ids by joining parts with `:` and `-` (`la-liga:md1:RIV-BOC`), so a code
 * carrying a separator would make those ids ambiguous.
 */
export const TeamCodeSchema = Type.String({
  minLength: 2,
  maxLength: 5,
  pattern: '^[A-Z0-9]{2,5}$',
});
```

### 1.5 Requested request/response schemas, verbatim

**Submit pick** — `packages/contracts/src/api/game.ts:36-45`:

```ts
// POST /penkas/:penkaId/picks — the team is named by catalog code (see MatchSchema)
export const SubmitPickRequestSchema = StrictObject({
  teamCode: TeamCodeSchema,
});
export type SubmitPickRequest = Static<typeof SubmitPickRequestSchema>;

export const SubmitPickResponseSchema = StrictObject({
  myEntry: MyEntrySchema,
});
export type SubmitPickResponse = Static<typeof SubmitPickResponseSchema>;
```

The route path is a comment only; see §3.5 for the actual route table.

**Create penka** — `packages/contracts/src/api/penkas.ts:5-28`:

```ts
/** Applied when a create request leaves a setting out. */
export const DEFAULT_PENKA_SETTINGS = { lives: 2, islandEnabled: true } as const;

// POST /penkas
/** Both settings are optional on the way in; the stored penka always has both. */
export const CreatePenkaSettingsSchema = StrictObject({
  lives: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 3, default: DEFAULT_PENKA_SETTINGS.lives }),
  ),
  islandEnabled: Type.Optional(Type.Boolean({ default: DEFAULT_PENKA_SETTINGS.islandEnabled })),
});
export type CreatePenkaSettings = Static<typeof CreatePenkaSettingsSchema>;

export const CreatePenkaRequestSchema = StrictObject({
  name: Type.String({ minLength: 1 }),
  leagueId: IdSchema,
  settings: CreatePenkaSettingsSchema,
});
export type CreatePenkaRequest = Static<typeof CreatePenkaRequestSchema>;

export const CreatePenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
});
export type CreatePenkaResponse = Static<typeof CreatePenkaResponseSchema>;
```

Note the shape as written: `settings` itself is **not** `Type.Optional`; only the two
fields inside it are.

**Join penka** — `packages/contracts/src/api/penkas.ts:30-46`:

```ts
// POST /penkas/join
export const JoinPenkaRequestSchema = StrictObject({
  /**
   * Deliberately loose: the route answers 404 invalid_join_code for unknown AND
   * malformed codes, so a guesser cannot tell "wrong shape" from "wrong code".
   * A 400 from schema validation would give that away. The cap only stops a
   * client from posting a novel as a join code.
   */
  joinCode: Type.String({ maxLength: 64 }),
});
export type JoinPenkaRequest = Static<typeof JoinPenkaRequestSchema>;

export const JoinPenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type JoinPenkaResponse = Static<typeof JoinPenkaResponseSchema>;
```

**List my penkas** — `packages/contracts/src/api/penkas.ts:48-58`:

```ts
// GET /me/penkas
export const MyPenkaItemSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type MyPenkaItem = Static<typeof MyPenkaItemSchema>;

export const MyPenkasResponseSchema = StrictObject({
  penkas: Type.Array(MyPenkaItemSchema),
});
export type MyPenkasResponse = Static<typeof MyPenkasResponseSchema>;
```

There is no request schema for this endpoint.

**Board** — response envelope at `packages/contracts/src/api/game.ts:17-21`, params at
`packages/contracts/src/api/game.ts:12-15`:

```ts
export const PenkaParamsSchema = StrictObject({
  penkaId: IdSchema,
});
export type PenkaParams = Static<typeof PenkaParamsSchema>;

// GET /penkas/:penkaId/board — public read model, no personal data (see BoardSchema)
export const BoardResponseSchema = StrictObject({
  board: BoardSchema,
});
```

The payload itself, `packages/contracts/src/domain.ts:204-219`:

```ts
/**
 * Public board read model. It is shared by every viewer of a penka and must
 * NEVER carry personal data (no picks, no used teams, no emails, no ids that
 * identify a viewer). Personal state travels separately as MyEntry.
 */
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
export type Board = Static<typeof BoardSchema>;
```

with `packages/contracts/src/domain.ts:191-202`:

```ts
/** What the public board shows about a player: display name and lives, nothing else. */
export const BoardPlayerSchema = StrictObject({
  displayName: Type.String({ minLength: 1 }),
  lives: Type.Integer({ minimum: 0 }),
});
export type BoardPlayer = Static<typeof BoardPlayerSchema>;

export const BoardHistoryItemSchema = StrictObject({
  matchday: Type.Integer({ minimum: 1 }),
  eliminated: Type.Array(Type.String({ minLength: 1 })),
  resolvedAt: IsoDateTimeSchema,
});
```

`BoardHistoryItemSchema.eliminated` is `Type.Array(Type.String({ minLength: 1 }))` — not
`IdSchema`, not `TeamCodeSchema`.

**My entry** — envelope at `packages/contracts/src/api/game.ts:23-27`:

```ts
// GET /penkas/:penkaId/me — the authenticated player's personal delta
export const MyEntryResponseSchema = StrictObject({
  myEntry: MyEntrySchema,
});
export type MyEntryResponse = Static<typeof MyEntryResponseSchema>;
```

payload at `packages/contracts/src/domain.ts:221-228`:

```ts
/** Personal delta layered on top of the public board for the authenticated player. */
export const MyEntrySchema = StrictObject({
  lives: Type.Integer({ minimum: 0 }),
  status: EntryStatusSchema,
  myPick: Type.Union([TeamCodeSchema, Type.Null()]),
  usedTeams: Type.Array(TeamCodeSchema),
});
export type MyEntry = Static<typeof MyEntrySchema>;
```

### 1.6 Complete error-code list

`packages/contracts/src/errors.ts:4-41`, verbatim:

```ts
/**
 * Canonical error codes — the exhaustive, closed set. Every API error response
 * uses one of these; never invent ad-hoc codes in an app. Extending this set is
 * a deliberate, reviewed decision.
 */
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

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorCodeSchema = Type.Union(
  Object.values(ErrorCodes).map((code) => Type.Literal(code)),
);
```

22 codes. The error envelope, `packages/contracts/src/errors.ts:43-50`:

```ts
/** Canonical error envelope for every non-2xx API response. */
export const ApiErrorSchema = StrictObject({
  status: Type.Integer({ minimum: 400, maximum: 599 }),
  code: ErrorCodeSchema,
  message: Type.String({ minLength: 1 }),
});

export type ApiError = Static<typeof ApiErrorSchema>;
```

---

## 2. Persistence

### 2.1 `db.collection(...)` call sites

Grep for `.collection<` and `.collection(` across `apps/` and `packages/` (excluding
`node_modules`). Production call sites — all typed:

| File:line | Call |
| --- | --- |
| `apps/api/src/modules/penkas/store.ts:53` | `db.collection<PenkaDoc>('penkas')` |
| `apps/api/src/modules/penkas/store.ts:57` | `db.collection<EntryDoc>('entries')` |
| `apps/api/src/modules/penkas/store.ts:61` | `db.collection<MatchdayDoc>('matchdays')` |
| `apps/api/src/modules/penkas/store.ts:65` | `db.collection<MatchDoc>('matches')` |
| `apps/api/src/modules/auth/store.ts:20` | `db.collection<UserDoc>('users')` |
| `apps/api/src/modules/auth/store.ts:24` | `db.collection<RefreshTokenDoc>('refreshTokens')` |

Six collections: `penkas`, `entries`, `matchdays`, `matches`, `users`, `refreshTokens`.

Test call sites, all **untyped** except one — they bypass the accessors and name the
collection as a string literal:

- `apps/api/test/integration/auth.int.test.ts:432` `db.collection('users')`
- `apps/api/test/integration/auth.int.test.ts:438` `.collection('refreshTokens')`
- `apps/api/test/integration/penkas.int.test.ts:154, 267, 328` `collection('penkas')`
- `apps/api/test/integration/penkas.int.test.ts:197, 206, 221, 242` `collection('matchdays')`
- `apps/api/test/integration/penkas.int.test.ts:198, 208, 225, 236, 245` `collection('matches')`
- `apps/api/test/integration/penkas.int.test.ts:374, 388, 442` `collection('entries')`
- `apps/api/test/integration/penkas.int.test.ts:283` `.collection<{ _id: string; lockAt: Date }>('matchdays')` — an ad-hoc inline type parameter, not `MatchdayDoc`

### 2.2 Document types and `_id`s

`apps/api/src/modules/penkas/store.ts:4-50`, verbatim:

```ts
/** Mongo document shapes — internal to the API; they never cross a contract boundary. */
export interface PenkaDoc {
  name: string;
  leagueId: string;
  joinCode: string;
  settings: { lives: number; islandEnabled: boolean };
  createdBy: string;
  createdAt: Date;
}

export interface EntryDoc {
  penkaId: string;
  userId: string;
  lives: number;
  status: EntryStatus;
  usedTeams: string[];
  points: number;
  createdAt: Date;
}

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

/**
 * Teams are stored as catalog codes, never as generated ids. A match belongs to
 * one league, and codes are unique inside a league, so a code identifies a team
 * unambiguously — the MVP creates no separate team documents.
 */
export interface MatchDoc {
  _id: string;
  matchdayId: string;
  leagueId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAt: Date;
  outcome: MatchOutcome | null;
}
```

`apps/api/src/modules/auth/store.ts:4-17`:

```ts
/** Mongo document shapes — internal to the API; they never cross a contract boundary. */
export interface UserDoc {
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
}

export interface RefreshTokenDoc {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}
```

`_id` types:

| Collection | Doc type | `_id` |
| --- | --- | --- |
| `penkas` | `PenkaDoc` | no `_id` field declared; driver default `ObjectId` — read back as `doc._id.toHexString()` at `store.ts:86` |
| `entries` | `EntryDoc` | no `_id` field declared; driver default `ObjectId` — `store.ts:97` |
| `matchdays` | `MatchdayDoc` | `_id: string` (`store.ts:30`) |
| `matches` | `MatchDoc` | `_id: string` (`store.ts:43`) |
| `users` | `UserDoc` | no `_id` field declared; driver default `ObjectId` — `auth/store.ts:40` |
| `refreshTokens` | `RefreshTokenDoc` | no `_id` field declared; driver default `ObjectId` |

### 2.3 Constructed `_id`s

`apps/api/src/modules/penkas/calendar.ts:9-12` — the only named id builder:

```ts
/** Derived, not generated: the same league always names its matchdays the same way. */
export function matchdayId(leagueId: string, number: number): string {
  return `${leagueId}:md${number}`;
}
```

Match `_id`s are built inline, not by a named function —
`apps/api/src/modules/penkas/calendar.ts:28-44`:

```ts
  for (const template of entry.fixtureTemplate.matchdays) {
    const _id = matchdayId(leagueId, template.number);
    const lockAt = new Date(now.getTime() + template.lockAtOffsetMinutes * 60_000);
    matchdays.push({ _id, leagueId, number: template.number, status: 'open', lockAt });

    for (const { homeTeamCode, awayTeamCode } of template.matchups) {
      matches.push({
        _id: `${_id}:${homeTeamCode}-${awayTeamCode}`,
        matchdayId: _id,
        leagueId,
        homeTeamCode,
        awayTeamCode,
        // The MVP locks picks at kickoff: one instant per matchday.
        kickoffAt: lockAt,
        outcome: null,
      });
    }
  }
```

So a match id is `` `${leagueId}:md${number}:${homeTeamCode}-${awayTeamCode}` ``, e.g.
`copa-libertadores:md1:RIV-BOC`. `kickoffAt` is assigned the same `Date` object as the
matchday's `lockAt` (`calendar.ts:41`).

### 2.4 Index-creation helpers

Two exist. Neither is called from `buildApp`; each is called by its route module (§3.4).

**`ensurePenkaIndexes(db: Db): Promise<void>`** — `apps/api/src/modules/penkas/store.ts:68-82`, verbatim:

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

Six indexes: `penkas {joinCode:1} unique`; `entries {penkaId:1,userId:1} unique`;
`entries {userId:1}`; `matchdays {leagueId:1,number:1} unique`; `matches {matchdayId:1}`;
`matches {leagueId:1}`.

**`ensureAuthIndexes(db: Db): Promise<void>`** — `apps/api/src/modules/auth/store.ts:27-35`, verbatim:

```ts
export async function ensureAuthIndexes(db: Db): Promise<void> {
  await Promise.all([
    usersCollection(db).createIndex({ email: 1 }, { unique: true }),
    refreshTokensCollection(db).createIndex({ tokenHash: 1 }, { unique: true }),
    // Mongo's TTL sweeper garbage-collects expired refresh tokens; expiry is
    // still enforced at read time because the sweeper only runs every ~60s.
    refreshTokensCollection(db).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
```

Three indexes: `users {email:1} unique`; `refreshTokens {tokenHash:1} unique`;
`refreshTokens {expiresAt:1}` TTL with `expireAfterSeconds: 0`.

### 2.5 Document → contract mappers

`apps/api/src/modules/penkas/store.ts:84-105` (`toPenka`, `toEntry`) and
`apps/api/src/modules/auth/store.ts:37-45` (`toPublicUser`). All three convert `_id` with
`.toHexString()` and `Date` fields with `.toISOString()`. Example, `store.ts:95-105`:

```ts
export function toEntry(doc: WithId<EntryDoc>): Entry {
  return {
    id: doc._id.toHexString(),
    penkaId: doc.penkaId,
    userId: doc.userId,
    lives: doc.lives,
    status: doc.status,
    usedTeams: doc.usedTeams,
    points: doc.points,
  };
}
```

### 2.6 Duplicate-key detection

`apps/api/src/modules/penkas/mongo-errors.ts:3-23`, verbatim:

```ts
const DUPLICATE_KEY = 11000;

/**
 * Did this write fail *only* because the documents were already there? Both
 * writers in this module lean on unique indexes as the arbiter of a race, so
 * they need to tell "someone beat me to it" from a genuine failure.
 *
 * A bulk write reports one error per document, and qualifies only when every
 * one of them is a duplicate key — an empty list does NOT qualify, since a
 * bulk error with no per-document failures (a write-concern error, say) means
 * the write did not land.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error instanceof MongoBulkWriteError) {
    const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
    return (
      writeErrors.length > 0 && writeErrors.every((writeError) => writeError.code === DUPLICATE_KEY)
    );
  }
  return error instanceof MongoServerError && error.code === DUPLICATE_KEY;
}
```

`apps/api/src/modules/auth/routes.ts:88-93` does **not** use this helper; it inlines the
check:

```ts
      } catch (error) {
        // The unique index is the race-safe duplicate check.
        if (error instanceof MongoServerError && error.code === 11000) {
          throw new ApiError(409, 'email_taken', 'Email is already registered');
        }
        throw error;
      }
```

The two places disagree on mechanism (shared helper vs. inline literal `11000`); both are
recorded here as-is.

### 2.7 Join codes

`apps/api/src/modules/penkas/join-code.ts:3-26`, verbatim:

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

export type JoinCodeGenerator = () => string;

/**
 * Cryptographically random and uniform: `randomInt` rejection-samples, so no
 * code is likelier than another (a `% 10000` over random bytes would bias the
 * low end and make guessing measurably easier).
 */
export const generateJoinCode: JoinCodeGenerator = () =>
  randomInt(JOIN_CODE_SPACE).toString().padStart(4, '0');
```

### 2.8 Rollback helper

`apps/api/src/modules/penkas/rollback.ts:15-28`:

```ts
export async function discardPenka(
  db: Db,
  log: FastifyBaseLogger,
  penkaId: ObjectId,
): Promise<void> {
  try {
    await penkasCollection(db).deleteOne({ _id: penkaId });
  } catch (error) {
    log.error(
      { err: error, penkaId: penkaId.toHexString() },
      'could not roll back a half-created penka; it is orphaned and still holds a join code',
    );
  }
}
```

### 2.9 Calendar materialization

`apps/api/src/modules/penkas/materialize.ts:37-56`:

```ts
export async function ensureLeagueMaterialized(
  db: Db,
  entry: CatalogLeague,
  now: Date,
): Promise<void> {
  const leagueId = entry.league.id;
  const [existingMatchday, existingMatch] = await Promise.all([
    matchdaysCollection(db).findOne({ leagueId }, { projection: { _id: 1 } }),
    matchesCollection(db).findOne({ leagueId }, { projection: { _id: 1 } }),
  ]);
  if (existingMatchday !== null && existingMatch !== null) {
    return;
  }

  const { matchdays, matches } = buildLeagueCalendar(entry, now);
  // Unordered: a partial calendar from an interrupted run finishes here instead
  // of stopping at the first document that already exists.
  await insertOnce(() => matchdaysCollection(db).insertMany(matchdays, { ordered: false }));
  await insertOnce(() => matchesCollection(db).insertMany(matches, { ordered: false }));
}
```

---

## 3. App wiring (`apps/api`)

### 3.1 `buildApp` signature and options

`apps/api/src/app.ts:14-36`, verbatim:

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

Three options exactly: `config` (required), `logger` (default `false`),
`generateJoinCode` (optional). Registration order, `apps/api/src/app.ts:38-60`:

```ts
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(mongoPlugin, { url: config.mongoUrl, dbName: config.mongoDbName });
  app.register(redisPlugin, { url: config.redisUrl });
  app.register(rateLimitPlugin, { max: config.rateLimitMax });
  app.register(authPlugin, {
    secret: config.jwtSecret,
    accessTtlSeconds: config.accessTokenTtlSeconds,
  });

  app.get(
    '/health',
    { schema: { response: { 200: HealthResponseSchema } } },
    async (): Promise<HealthResponse> => ({ status: 'ok' }),
  );

  app.register(authRoutes, { prefix: '/api/v1', config });
  app.register(catalogRoutes, { prefix: '/api/v1' });
  app.register(penkaRoutes, {
    prefix: '/api/v1',
    config,
    generateJoinCode: options.generateJoinCode,
  });
```

`AppConfig` — `apps/api/src/config.ts:15-26`:

```ts
export interface AppConfig {
  port: number;
  mongoUrl: string;
  mongoDbName: string;
  redisUrl: string;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  rateLimitMax: number;
  /** Fastify's trustProxy: false, true, a hop count, or a proxy IP/CIDR list. */
  trustProxy: boolean | number | string;
}
```

### 3.2 Decorators registered on the instance

Grep for `.decorate(` / `decorateRequest(` across `apps/` and `packages/`. Application code:

| File:line | Decorator | Type |
| --- | --- | --- |
| `apps/api/src/plugins/mongo.ts:21` | `mongo` | `MongoClient` (`plugins/mongo.ts:6`) |
| `apps/api/src/plugins/mongo.ts:22` | `db` | `Db` (`plugins/mongo.ts:7`) |
| `apps/api/src/plugins/redis.ts:21` | `redis` | `Redis` (`plugins/redis.ts:6`) |
| `apps/api/src/plugins/auth.ts:35` | `tokens` | `TokenService` (`plugins/auth.ts:8`) |
| `apps/api/src/plugins/auth.ts:36` | `authenticate` | `(request: FastifyRequest) => Promise<void>` (`plugins/auth.ts:9`) |

`apps/api/src/plugins/auth.ts:11-13` also augments the request type:

```ts
  interface FastifyRequest {
    userId?: string;
  }
```

Two more decorators are **not** registered by application code — they come from
`@fastify/rate-limit` (installed `10.3.0`, declared `^10.2.2` at
`apps/api/package.json:14`), at
`node_modules/.pnpm/@fastify+rate-limit@10.3.0/node_modules/@fastify/rate-limit/index.js:128-140`:

```js
  if (!fastify.hasDecorator('createRateLimit')) {
    fastify.decorate('createRateLimit', (options) => {
      const args = createLimiterArgs(pluginComponent, globalParams, options)
      return (req) => applyRateLimit.apply(this, args.concat(req))
    })
  }

  if (!fastify.hasDecorator('rateLimit')) {
    fastify.decorate('rateLimit', (options) => {
      const args = createLimiterArgs(pluginComponent, globalParams, options)
      return rateLimitRequestHandler(...args)
    })
  }
```

plus `decorateRequest` at index.js:126.

Test-only fakes (unit tests, never in the boot path):
`apps/api/src/modules/penkas/routes.test.ts:28-31` decorate `db`, `authenticate`,
`createRateLimit`; `apps/api/src/modules/auth/routes.test.ts:28-38` decorate `db`,
`tokens`, `authenticate`, `rateLimit`.

### 3.3 Plugin metadata

| Plugin | File:line | `fp` name / dependencies |
| --- | --- | --- |
| mongo | `apps/api/src/plugins/mongo.ts:27` | `{ name: 'mongo' }` |
| redis | `apps/api/src/plugins/redis.ts:30` | `{ name: 'redis' }` |
| rate-limit | `apps/api/src/plugins/rate-limit.ts:29` | `{ name: 'rate-limit', dependencies: ['redis'] }` |
| auth | `apps/api/src/plugins/auth.ts:48` | `{ name: 'auth' }` |

### 3.4 Per-route-module required-decorator assertions

**`penkaRoutes`** — `apps/api/src/modules/penkas/routes.ts:35-36`:

```ts
/** See the note in authRoutes: a plain plugin must assert its decorators itself. */
const REQUIRED_DECORATORS = ['db', 'authenticate', 'createRateLimit'] as const;
```

enforced at `apps/api/src/modules/penkas/routes.ts:122-129`:

```ts
  for (const decorator of REQUIRED_DECORATORS) {
    if (!instance.hasDecorator(decorator)) {
      throw new Error(
        `penkaRoutes requires the "${decorator}" decorator: register the mongo, redis, ` +
          'rate-limit, and auth plugins before it',
      );
    }
  }
```

It then calls `await ensurePenkaIndexes(app.db);` (`routes.ts:131`).

**`authRoutes`** — `apps/api/src/modules/auth/routes.ts:46-53`:

```ts
/**
 * Decorators this module reads. It is a plain (non fastify-plugin) plugin, so
 * Fastify cannot check plugin dependencies for it: assert them explicitly so a
 * registration-order mistake fails at boot with a clear message instead of
 * crashing cryptically — or, for `rateLimit`, leaving login silently
 * unthrottled because @fastify/rate-limit only sees routes registered after it.
 */
const REQUIRED_DECORATORS = ['db', 'tokens', 'authenticate', 'rateLimit'] as const;
```

enforced at `apps/api/src/modules/auth/routes.ts:57-64`, followed by
`await ensureAuthIndexes(app.db);` (`routes.ts:66`).

**`catalogRoutes`** — no assertion. `apps/api/src/modules/catalog/routes.ts:12-17` in full:

```ts
/**
 * The catalog is public, hardcoded and read-only: no auth, no database, no
 * rate limiting — every response is served from memory.
 */
export const catalogRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
```

Its options type is `FastifyPluginAsync` with no options interface, unlike
`AuthRoutesOptions` (`auth/routes.ts:24-26`) and `PenkaRoutesOptions`
(`penkas/routes.ts:29-33`).

### 3.5 Rate-limit helpers

Three distinct mechanisms are in use.

**(a) Plugin registration** — `apps/api/src/plugins/rate-limit.ts:6-30`, verbatim:

```ts
export interface RateLimitPluginOptions {
  max: number;
}

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

**(b) Route-level `config.rateLimit`** — used by `authRoutes` only.
`apps/api/src/modules/auth/routes.ts:68`:

```ts
  const rateLimited = { rateLimit: { max: config.rateLimitMax, timeWindow: '1 minute' } };
```

applied at `auth/routes.ts:73` (`/auth/register`) and `auth/routes.ts:114` (`/auth/login`)
as `config: rateLimited`. Note: `authRoutes` asserts the `rateLimit` **decorator**
(§3.4) but never calls `app.rateLimit(...)`; a repo-wide grep for `.rateLimit(` returns
only comments in `penkas/routes.ts:137` and the `createRateLimit` calls below.

**(c) `app.createRateLimit(...)`** — used by `penkaRoutes` only.
`apps/api/src/modules/penkas/routes.ts:133-152`, verbatim:

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

with the enforcement wrapper at `penkas/routes.ts:154-176`:

```ts
  async function enforce(
    check: RateLimitCheck,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await check(request);
    if (result.isAllowed || !result.isExceeded) {
      return;
    }
    void reply.header('retry-after', result.ttlInSeconds);
    throw new ApiError(
      429,
      'rate_limited',
      `Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`,
    );
  }
```

and the preHandler chain at `penkas/routes.ts:249`:

```ts
      preHandler: [limitByIp, app.authenticate, limitByUser],
```

The difference between (b)/`rateLimit` and (c)/`createRateLimit` is visible in the library
source. `rateLimit` produces a hook that short-circuits on a per-request flag —
`@fastify/rate-limit/index.js:277-285`:

```js
function rateLimitRequestHandler (pluginComponent, params) {
  const { rateLimitRan } = pluginComponent

  return async (req, res) => {
    if (req[rateLimitRan]) {
      return
    }

    req[rateLimitRan] = true
```

`createRateLimit` returns a bare per-request function with no such flag —
`@fastify/rate-limit/index.js:129-132`:

```js
    fastify.decorate('createRateLimit', (options) => {
      const args = createLimiterArgs(pluginComponent, globalParams, options)
      return (req) => applyRateLimit.apply(this, args.concat(req))
    })
```

`errorResponseBuilder` (a) shapes the 429 for (b); path (c) throws its own `ApiError`
(`penkas/routes.ts:164-168`), so the two 429 messages differ in wording —
`Rate limit exceeded, retry in ${context.after}` vs.
`Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`.

### 3.6 Route table (actual `printRoutes()` dump)

Produced by booting `buildApp({ config: makeTestConfig(infra) })` against Testcontainers
Mongo + Redis, calling `await app.ready()`, then printing. No source file was modified; the
script lived in the scratchpad.

`app.printRoutes({ commonPrefix: false })`:

```
├── /health (GET, HEAD)
├── /api/v1/auth/register (POST)
├── /api/v1/auth/refresh (POST)
├── /api/v1/auth/login (POST)
├── /api/v1/me (GET, HEAD)
│   └── /penkas (GET, HEAD)
├── /api/v1/catalog/leagues (GET, HEAD)
│   └── /:leagueId (GET, HEAD)
└── /api/v1/penkas (POST)
    └── /join (POST)
```

`app.printRoutes()` (default radix view):

```
└── /
    ├── health (GET, HEAD)
    └── api/v1/
        ├── auth/
        │   ├── re
        │   │   ├── gister (POST)
        │   │   └── fresh (POST)
        │   └── login (POST)
        ├── me (GET, HEAD)
        │   └── /penkas (GET, HEAD)
        ├── catalog/leagues (GET, HEAD)
        │   └── /
        │       └── :leagueId (GET, HEAD)
        └── penkas (POST)
            └── /join (POST)
```

Nine route entries in total:

| Method | Path |
| --- | --- |
| GET, HEAD | `/health` |
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/login` |
| GET, HEAD | `/api/v1/me` |
| GET, HEAD | `/api/v1/me/penkas` |
| GET, HEAD | `/api/v1/catalog/leagues` |
| GET, HEAD | `/api/v1/catalog/leagues/:leagueId` |
| POST | `/api/v1/penkas` |
| POST | `/api/v1/penkas/join` |

No route exists for board, my-entry, current-matchday, or submit-pick, although the schemas
for all four are exported from `@penka/contracts` (§1.5). No admin route exists in this app.

`app.printPlugins()` from the same boot:

```
root 96 ms
├── bound _after 1 ms
├── bound _after 0 ms
├── mongo 13 ms
├── redis 7 ms
├─┬ rate-limit 2 ms
│ ├── @fastify/rate-limit 1 ms
│ └── bound _after 0 ms
├── auth 0 ms
├── bound _after 0 ms
├── bound _after 0 ms
├─┬ authRoutes 28 ms
│ ├── bound _after 0 ms
│ ├── bound _after 0 ms
│ ├── bound _after 0 ms
│ ├── bound _after 0 ms
│ └── bound _after 0 ms
├─┬ catalogRoutes 1 ms
│ ├── bound _after 0 ms
│ ├── bound _after 0 ms
│ ├── bound _after 0 ms
│ └── bound _after 0 ms
└─┬ penkaRoutes 40 ms
  ├── bound _after 0 ms
  ├── bound _after 0 ms
  ├── bound _after 0 ms
  └── bound _after 0 ms
```

---

## 4. `@penka/game-engine`

### 4.1 Entrypoint

`packages/game-engine/package.json:6-10`:

```json
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
```

`packages/game-engine/src/index.ts:1-5`, verbatim:

```ts
export * from './types';
export * from './time';
export * from './validate-pick';
export * from './resolve-matchday';
export * from './standings';
```

`src/test-support/build.ts` is **not** exported from the entrypoint. It is imported by
relative path from the engine's own tests only (`src/index.test.ts:15`,
`src/resolve-matchday.test.ts:11`, `src/validate-pick.test.ts:3`, `src/property.test.ts:13`,
`src/standings.test.ts:3`) and by nothing in `apps/`.

The package has zero runtime dependencies (`packages/game-engine/package.json:17-25`:
only `devDependencies`); `@penka/contracts` is imported type-only, e.g.
`packages/game-engine/src/types.ts:1`:

```ts
import type { EntryStatus, ErrorCode } from '@penka/contracts';
```

### 4.2 Exported function signatures, verbatim

```ts
// packages/game-engine/src/time.ts:6
export function isoToEpochMs(iso: string): number

// packages/game-engine/src/time.ts:15
export function tryIsoToEpochMs(iso: string): number | null

// packages/game-engine/src/validate-pick.ts:24
export function validatePick(input: ValidatePickInput): PickValidation

// packages/game-engine/src/resolve-matchday.ts:98
export function resolveMatchday(input: ResolveMatchdayInput): ResolveMatchdayResult

// packages/game-engine/src/standings.ts:29
export function computeStandings(entries: readonly Entry[]): Standings

// packages/game-engine/src/standings.ts:41
export function rankWinners(entries: readonly Entry[]): Entry[]
```

Both engine entry points take a single input object; neither takes positional domain
arguments.

Input and output types, verbatim.

`packages/game-engine/src/validate-pick.ts:5-13`:

```ts
export interface ValidatePickInput {
  entry: Entry;
  matchday: Matchday;
  matches: readonly Match[];
  teamCode: string;
  /** The caller's clock as an ISO-8601 instant — the engine never reads the system clock. */
  now: string;
  settings: PenkaSettings;
}
```

`packages/game-engine/src/resolve-matchday.ts:4-10`:

```ts
export interface ResolveMatchdayInput {
  matchday: Matchday;
  entries: readonly Entry[];
  picks: readonly PlayerPick[];
  matches: readonly Match[];
  settings: PenkaSettings;
}
```

`packages/game-engine/src/standings.ts:3-6`:

```ts
export interface Standings {
  alive: Entry[];
  island: Entry[];
}
```

`packages/game-engine/src/types.ts:7-58`:

```ts
export type PickRejectionCode = Extract<
  ErrorCode,
  'matchday_locked' | 'on_island' | 'team_not_playing' | 'team_already_used' | 'validation_failed'
>;

export type ResolveRejectionCode = Extract<
  ErrorCode,
  'results_missing' | 'already_resolved' | 'matchday_not_locked'
>;

export type PickValidation = { ok: true } | { ok: false; code: PickRejectionCode };

/** What resolution does to one entry. Deltas only — persistence applies them. */
export interface EntryEffect {
  entryId: string;
  /** -1 on a lost matchday for an alive entry, otherwise 0. Never drives lives negative. */
  livesDelta: 0 | -1;
  /** 1 for a correct pick (any status — points count total correct picks), otherwise 0. */
  pointsDelta: 0 | 1;
  newLives: number;
  newStatus: EntryStatus;
  /** Team code to append to the entry's usedTeams, or null when no valid pick was played. */
  teamConsumed: string | null;
}

export interface ResolutionSummary {
  totalEntries: number;
  aliveBefore: number;
  aliveAfter: number;
  islandBefore: number;
  islandAfter: number;
  eliminated: number;
}

/**
 * Deterministic result of resolving one matchday. Carries the matchday's id and
 * number so the persistence layer can enforce idempotency (refuse to apply the
 * same matchday's effects twice).
 */
export interface ResolutionOutcome {
  matchdayId: string;
  matchdayNumber: number;
  /** One effect per input entry, in input order. */
  effects: EntryEffect[];
  /** Entries that went from alive to island this matchday. */
  eliminatedEntryIds: string[];
  summary: ResolutionSummary;
}

export type ResolveMatchdayResult =
  | { ok: true; outcome: ResolutionOutcome }
  | { ok: false; code: ResolveRejectionCode };
```

The effect field is named `teamConsumed` (`types.ts:29`), typed `string | null` — not
`teamCodeConsumed`. Engine-side team parameters are plain `string`, not the branded
`TeamCodeSchema` type (`validate-pick.ts:9`, `types.ts:29`).

### 4.3 Fixture team codes

`packages/game-engine/src/test-support/build.ts:16-50`:

```ts
export function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    matchdayId: 'md-1',
    homeTeamCode: 'HOME',
    awayTeamCode: 'AWAY',
    kickoffAt: '2026-08-21T19:00:00.000Z',
    outcome: 'home',
    ...overrides,
  };
}
...
export function buildPick(overrides: Partial<PlayerPick> = {}): PlayerPick {
  return {
    id: 'pick-1',
    entryId: 'entry-1',
    matchdayId: 'md-1',
    teamCode: 'HOME',
    createdAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}
```

Codes appearing in engine tests, with lines:

| Code | Where |
| --- | --- |
| `HOME` | `build.ts:20`, `build.ts:46`; `resolve-matchday.test.ts:101, 286`; `validate-pick.test.ts:14, 65, 86, 138`; `index.test.ts:26` |
| `AWAY` | `build.ts:21`; `resolve-matchday.test.ts:51, 76, 102`; `validate-pick.test.ts:26`; `index.test.ts:32` |
| `GHOST` | `resolve-matchday.test.ts:116, 217` |
| `CC`, `DD` | `resolve-matchday.test.ts:242` |
| `UNKN` | `validate-pick.test.ts:67, 88` |
| `ELSE` | `validate-pick.test.ts:96, 108, 109` |
| `T0`, `T1`, … (`` `T${2 * i}` ``) | `property.test.ts:27-28, 49` |

`HOME`, `AWAY`, `GHOST`, `ELSE` are 4–5 characters of `[A-Z]`; they satisfy
`TeamCodeSchema` (§1.4) but the engine never validates against it.

Other fixture builders: `buildMatchday` (`build.ts:5`), `buildEntry` (`build.ts:28`),
`buildSettings` (`build.ts:52`, returns `{ lives: 2, islandEnabled: true }`),
`deepFreeze` (`build.ts:57`), `createRng` (`build.ts:68`, seeded LCG).

Contracts fixtures use a different alphabet — `packages/contracts/src/test-support/fixtures.ts:44-49`:

```ts
/**
 * A catalog team code. Teams are identified by their stable, league-scoped
 * `code` everywhere — matches, picks and used-team lists all carry codes, never
 * a generated id.
 */
export const teamCode = 'RIV';
```

with `RIV` / `BOC` throughout (`fixtures.ts:12, 34, 39, 54-55, 92, 100, 129-130`).

---

## 5. Test harness

### 5.1 `makeTestConfig`

`apps/api/test/integration/harness.ts:28-44`, verbatim:

```ts
/** A valid AppConfig against the started containers, with a fresh database per call. */
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

Signature: `makeTestConfig(infra: TestInfra, overrides: Partial<AppConfig> = {}): AppConfig`.
Defaults as listed above. `randomUUID` is imported at `harness.ts:1`.

### 5.2 How a test gets a database name

Each `makeTestConfig(infra)` call generates `penka-test-<8 hex chars>` — a fresh database
per call, not per file (`harness.ts:33`). Two tests deliberately override it to share a
database with the main app instance:

- `apps/api/test/integration/penkas.int.test.ts:484` `mongoDbName: config.mongoDbName,`
- `apps/api/test/integration/penkas.int.test.ts:507` `mongoDbName: config.mongoDbName,`

The fixed `jwtSecret` (`harness.ts:35`) is what makes tokens minted by one app instance
valid on another.

### 5.3 Testcontainers helpers

`apps/api/test/integration/harness.ts:6-26`, verbatim:

```ts
export interface TestInfra {
  mongoUrl: string;
  redisUrl: string;
  stop(): Promise<void>;
}

/** Same images as infra/docker-compose.yml, on random host ports. */
export async function startInfra(): Promise<TestInfra> {
  const [mongo, redis] = await Promise.all([
    new GenericContainer('mongo:7').withExposedPorts(27017).start(),
    new GenericContainer('redis:7').withExposedPorts(6379).start(),
  ]);

  return {
    mongoUrl: `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}`,
    redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    stop: async () => {
      await Promise.all([mongo.stop(), redis.stop()]);
    },
  };
}
```

Third helper — `apps/api/test/integration/harness.ts:46-76`:

```ts
type CollectionFactory = Db['collection'];

/**
 * Make the next insert into `collectionName` reject, simulating a transient
 * Mongo write failure. Returns a restore function; call it in a finally block.
 */
export function failNextInsert(db: Db, collectionName: string): () => void {
```

It patches `db.collection` with a proxy that rejects the next `insertOne` on the named
collection and returns a restore function (`harness.ts:72-75`). Used at
`apps/api/test/integration/auth.int.test.ts:133` and `:242`, both with `'refreshTokens'`.

The complete harness export list is: `TestInfra` (6), `startInfra` (13),
`makeTestConfig` (29), `failNextInsert` (52). There is no per-test DB cleanup helper and no
`buildTestApp` wrapper — each file calls `buildApp` directly, e.g.
`apps/api/test/integration/health.int.test.ts:10-19`:

```ts
  beforeAll(async () => {
    infra = await startInfra();
    app = buildApp({ config: makeTestConfig(infra) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });
```

Every integration file starts its **own** containers in `beforeAll` (`auth.int.test.ts:58-59`,
`catalog.int.test.ts:16-18`, `health.int.test.ts:10-13`, `penkas.int.test.ts` — same
pattern). There is no shared global setup file.

### 5.4 Redis DB indexes already claimed

`grep -rn "redisUrl" apps/api/test` — every claimed index, with the test that claims it:

| Redis DB | File:line | Test |
| --- | --- | --- |
| default (no suffix) | `harness.ts:34` | every app built from `makeTestConfig` without an override |
| `/1` | `auth.int.test.ts:318` | `'throttles login with 429 rate_limited after the configured burst'` (`auth.int.test.ts:316`) |
| `/2` | `auth.int.test.ts:342` | `'throttles register with 429 rate_limited after the configured burst'` (`auth.int.test.ts:340`) |
| `/3` | `auth.int.test.ts:363` | `'buckets per forwarded client IP when trustProxy is configured'` (`auth.int.test.ts:359`) |
| `/4` | `auth.int.test.ts:389` | `'ignores forwarded IP headers when trustProxy is off'` (`auth.int.test.ts:387`) |
| `/5` | `penkas.int.test.ts:486` | `'throttles per IP, so one host cannot walk the code space'` (`penkas.int.test.ts:479`) |
| `/6` | `penkas.int.test.ts:509` | `'throttles per user, so switching IP does not buy a fresh budget'` (`penkas.int.test.ts:503`) |

Indexes are hand-allocated as string suffixes on the URL, e.g.
`penkas.int.test.ts:486`:

```ts
          redisUrl: `${infra.redisUrl}/5`,
```

There is no allocator function and no central registry of claimed indexes.

### 5.5 Vitest configuration

`packages/config/vitest.js:1-21`, verbatim:

```js
/**
 * Shared Vitest presets. Spread into `defineConfig()` in each package:
 *
 *   import { defineConfig } from 'vitest/config';
 *   import { unitTestConfig } from '@penka/config/vitest';
 *   export default defineConfig(unitTestConfig);
 */
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

`apps/api/vitest.config.ts:1-4` and `apps/api/vitest.integration.config.ts:1-4` each spread
one preset unchanged. `packages/game-engine/vitest.config.ts:4-15` extends the unit preset
with coverage thresholds:

```ts
export default defineConfig({
  ...unitTestConfig,
  test: {
    ...unitTestConfig.test,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-support/**'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
```

---

## 6. Commands

### 6.1 Root `package.json`

`package.json:1-22`, verbatim:

```json
{
  "name": "penka-survivor",
  "private": true,
  "packageManager": "pnpm@9.15.9",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "infra:up": "docker compose -f infra/docker-compose.yml up -d --wait",
    "infra:down": "docker compose -f infra/docker-compose.yml down"
  },
  "devDependencies": {
    "prettier": "^3.4.2",
    "turbo": "^2.3.4"
  }
}
```

### 6.2 Workspace scripts

`pnpm-workspace.yaml:1-3`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

| Workspace | `dev` | `build` | `test` | `test:integration` | `test:coverage` | `lint` |
| --- | --- | --- | --- | --- | --- | --- |
| `@penka/api` (`apps/api/package.json:6-12`) | `tsx watch src/server.ts` | `tsc --noEmit` | `vitest run` | `vitest run --config vitest.integration.config.ts` | — | `eslint .` |
| `@penka/backoffice-api` (`apps/backoffice-api/package.json:6-12`) | `tsx watch src/server.ts` | `tsc --noEmit` | `vitest run` | `vitest run --config vitest.integration.config.ts` | — | `eslint .` |
| `@penka/workers` (`apps/workers/package.json:6-11`) | `tsx watch src/index.ts` | `tsc --noEmit` | `vitest run` | — | — | `eslint .` |
| `@penka/web` (`apps/web/package.json:6-11`) | `vite` | `vite build` | `vitest run` | — | — | `eslint .` |
| `@penka/backoffice-web` (`apps/backoffice-web/package.json:6-11`) | `vite` | `vite build` | `vitest run` | — | — | `eslint .` |
| `@penka/contracts` (`packages/contracts/package.json:11-15`) | — | `tsc --noEmit` | `vitest run` | — | — | `eslint .` |
| `@penka/game-engine` (`packages/game-engine/package.json:11-16`) | — | `tsc --noEmit` | `vitest run` | — | `vitest run --coverage` | `eslint .` |
| `@penka/config` (`packages/config/package.json:14-17`) | — | — | `vitest run` | — | — | `eslint .` |

`test:coverage` is defined in exactly one workspace (`@penka/game-engine`);
`pnpm test:coverage` at the root therefore runs one package. `@penka/config` defines no
`build`.

`@penka/config` exports (`packages/config/package.json:6-13`):

```json
  "exports": {
    "./eslint": "./eslint.js",
    "./eslint-vue": "./eslint-vue.js",
    "./vitest": "./vitest.js",
    "./tsconfig/base.json": "./tsconfig/base.json",
    "./tsconfig/node.json": "./tsconfig/node.json",
    "./tsconfig/vue.json": "./tsconfig/vue.json"
  },
```

### 6.3 `turbo.json`

`turbo.json:1-23`, complete and verbatim:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": []
    },
    "test:coverage": {
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "cache": false
    },
    "lint": {}
  }
}
```

There is no `env`, `globalEnv`, `passThroughEnv`, `globalDependencies`, or `inputs` key
anywhere in the file — **no env passthrough is configured**.

---

## 7. Recent history

`git log --oneline -30` (the repository has 9 commits total):

```
c56bf74 Make penka creation survive its own partial failures
66df0f6 Harden penka materialization and duplicate-key detection
fca356b Identify teams by catalog code everywhere, not by a generated id
e923e18 Build the penkas module: create, join by code, and my penkas
a1cd1da Build the catalog module: hardcoded leagues, teams and fixture templates
4eb7f8e Build @penka/api bootstrap and authentication
91a9fe9 Build @penka/game-engine: pure Survivor rules with 100% coverage
25cd4c1 Build @penka/contracts: domain schemas, API contracts, canonical errors
63a194b Bootstrap penka-survivor monorepo skeleton
```

`git status`:

```
On branch main
nothing to commit, working tree clean
```

(Captured before this document was written; `docs/CODEBASE-CONVENTIONS.md` is new and
untracked.)

---

## Not found / ambiguous

**Not found**

1. **`StrictObject` on the public surface.** Defined at `packages/contracts/src/strict.ts:7`
   but `packages/contracts/src/index.ts:1-8` does not re-export `./strict`. Reachable only
   via deep import.
2. **Any exported schema or type named `Pick`, `Omit`, `Record`, `Exclude`, `Partial`, or
   `Readonly`** in `@penka/contracts`. Grep returns no matches.
3. **Routes for board, my-entry, current-matchday, submit-pick.** The schemas exist
   (`packages/contracts/src/api/game.ts:12-45`) but the `printRoutes()` dump (§3.6) contains
   no such paths, and there is no `apps/api/src/modules/game/` directory.
4. **Any admin route in `apps/api`.** `packages/contracts/src/api/admin.ts` exports 21
   symbols; `apps/backoffice-api/src` contains only `app.ts`, `app.test.ts`, `server.ts`.
5. **A decorator-assertion list in `catalogRoutes`** (`apps/api/src/modules/catalog/routes.ts:16`)
   — it declares no `REQUIRED_DECORATORS` and takes no options.
6. **A named builder function for match `_id`s.** Only `matchdayId` is a function
   (`calendar.ts:10`); the match id is an inline template literal at `calendar.ts:35`.
7. **A `teams` collection.** Only six collections appear in `db.collection(...)` calls (§2.1).
8. **Env passthrough in `turbo.json`** — no `env` / `globalEnv` / `passThroughEnv` keys.
9. **A `test:coverage` script in any workspace except `@penka/game-engine`**, and a
   `build` script in `@penka/config`.
10. **`packages/game-engine/src/test-support/build.ts` on the package's public surface** —
    `index.ts:1-5` does not export it.
11. **A shared Vitest global-setup / container-reuse file.** Each integration test file calls
    `startInfra()` in its own `beforeAll`.
12. **A Redis DB-index allocator.** Indexes 1–6 are hard-coded string suffixes (§5.4).

**Ambiguous / two places disagree**

13. **Duplicate-key detection has two implementations.**
    `apps/api/src/modules/penkas/mongo-errors.ts:15-23` exports `isDuplicateKeyError`
    (handles `MongoBulkWriteError` and `MongoServerError`), while
    `apps/api/src/modules/auth/routes.ts:90` inlines
    `error instanceof MongoServerError && error.code === 11000`. Both are present in the
    codebase as written.
14. **Two different 429 messages.** `apps/api/src/plugins/rate-limit.ts:26` produces
    `` `Rate limit exceeded, retry in ${context.after}` ``; `apps/api/src/modules/penkas/routes.ts:167`
    produces `` `Rate limit exceeded, retry in ${result.ttlInSeconds} seconds` ``. Both carry
    code `rate_limited`.
15. **`authRoutes` asserts the `rateLimit` decorator but never calls it.**
    `apps/api/src/modules/auth/routes.ts:53` requires `'rateLimit'`; the routes opt in via
    `config: rateLimited` (`auth/routes.ts:68, 73, 114`), which is the plugin's `onRoute`
    path. A repo-wide grep for `.rateLimit(` finds no call site.
16. **`@fastify/rate-limit` version.** Declared `^10.2.2` (`apps/api/package.json:14`);
    installed `10.3.0` (`node_modules/.pnpm/@fastify+rate-limit@10.3.0`). The
    `createRateLimit` / `rateLimit` decorators quoted in §3.2 and §3.5 are from the
    installed 10.3.0.
17. **Test collection access bypasses the typed accessors.** Integration tests call
    `db.collection('penkas')` etc. with no type parameter (13 sites listed in §2.1), and once
    with an ad-hoc inline type (`penkas.int.test.ts:283`), rather than
    `penkasCollection(db)` / `matchdaysCollection(db)`.
18. **Team codes are `string` in the engine, `TeamCodeSchema` in contracts.**
    `validate-pick.ts:9` (`teamCode: string`) and `types.ts:29` (`teamConsumed: string | null`)
    versus `domain.ts:32-36`. The engine's own fixtures use `HOME`/`AWAY`/`GHOST`/`ELSE`
    while the contracts fixtures use `RIV`/`BOC`.
19. **`CreatePenkaRequestSchema.settings` is required** (`packages/contracts/src/api/penkas.ts:21`)
    even though both of its fields are optional; a create request must still send
    `settings: {}`. The comment above it (`api/penkas.ts:9`) speaks only to the fields.
20. **Defaults are applied twice.** `CreatePenkaSettingsSchema` declares AJV `default`s
    (`api/penkas.ts:11-14`) and the handler re-applies them
    (`apps/api/src/modules/penkas/routes.ts:190-195`), with the comment
    "The schema fills these in, but the request type keeps them optional — apply the same
    documented defaults rather than trusting AJV to have run."
21. **`ensurePenkaIndexes` / `ensureAuthIndexes` run at route-plugin registration, not at
    app boot.** `penkas/routes.ts:131` and `auth/routes.ts:66`; `apps/api/src/app.ts` never
    calls either.
22. **The environment header for this session reported "Is a git repository: false"**, yet
    `git log` and `git status` both work in `/Users/agustinfarias/projects/penka/penka-survivor`.

---

## Accepted as-is

Inconsistencies recorded above that are **deliberate**, not defects awaiting a fix. Anyone
reading the ambiguity list should stop here before "unifying" them.

1. **Two different 429 message wordings** (ambiguity #14): the plugin builder says
   `Rate limit exceeded, retry in ${context.after}` (a humanized string like "1 minute"),
   the join route says `Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`.
   Both carry code `rate_limited` and a `retry-after` header, which is what clients act on;
   the message is human-facing prose, so a single wording would buy nothing and would mean
   reimplementing one path's formatting inside the other.
2. **Engine team params are plain `string` while contracts brand `TeamCodeSchema`**
   (ambiguity #18): `validate-pick.ts:9` and `types.ts:29` take `string`, `domain.ts:32-36`
   constrains `^[A-Z0-9]{2,5}$`. The engine validates game rules, not payload shape — the
   code alphabet exists so derived document ids stay unambiguous, which is a storage and
   wire concern enforced at the API boundary. Keeping the engine on `string` is what lets
   it stay dependency-free and lets its fixtures use readable codes (`HOME`, `AWAY`,
   `GHOST`) instead of catalog ones.

### Superseded by later commits

This document is a snapshot at `c56bf74`; the quotes above are left as captured. Three
claims no longer describe the tree:

- **Ambiguity #13 (duplicate-key detection has two implementations)** — resolved.
  `isDuplicateKeyError` moved to `apps/api/src/lib/mongo-errors.ts`; `auth/routes.ts` calls
  it instead of inlining `error.code === 11000`. §2.6's file path is now `src/lib/`.
- **§1.4 / §1.5 `BoardPlayerSchema`** — it now carries `points` and `pick` as well as
  `displayName` and `lives`, and `BoardSchema`'s invariant comment was rewritten in the
  same commit: a pick is public from the moment the matchday locks, and the board builder
  writes `null` before lock.
- **§6.3 and not-found #8 (no env passthrough in `turbo.json`)** — resolved.
  `globalPassThroughEnv` now lists `JWT_SECRET`, `PORT`, `MONGO_URL`, `MONGO_DB`,
  `REDIS_URL`, `RATE_LIMIT_MAX`, `TRUST_PROXY` (the exact set `apps/api/src/config.ts`
  reads), so `pnpm dev --filter @penka/api` boots from exported shell env.
    Section 7 reports the actual command output.