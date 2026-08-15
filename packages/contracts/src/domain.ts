import { Type, type Static } from '@sinclair/typebox';
import { StrictObject } from './strict';

/** Non-empty string identifier (Mongo ObjectId, UUID — storage decides later). */
export const IdSchema = Type.String({ minLength: 1 });

/** ISO-8601 timestamp (date, time, and zone required) carried as a string over the wire. */
export const IsoDateTimeSchema = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$',
});

export const EmailSchema = Type.String({ pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' });

// ── Catalog ────────────────────────────────────────────────────────────────

export const TeamSchema = StrictObject({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  shortCode: Type.String({ minLength: 2, maxLength: 5 }),
});
export type Team = Static<typeof TeamSchema>;

export const LeagueSchema = StrictObject({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  season: Type.String({ minLength: 1 }),
});
export type League = Static<typeof LeagueSchema>;

/** Per-matchday template: when picks lock relative to the first kickoff. */
export const FixtureTemplateSchema = StrictObject({
  id: IdSchema,
  leagueId: IdSchema,
  matchday: Type.Integer({ minimum: 1 }),
  lockAtOffsetMinutes: Type.Integer(),
});
export type FixtureTemplate = Static<typeof FixtureTemplateSchema>;

// ── Fixtures & results ─────────────────────────────────────────────────────

export const MatchOutcomeSchema = Type.Union([
  Type.Literal('home'),
  Type.Literal('draw'),
  Type.Literal('away'),
]);
export type MatchOutcome = Static<typeof MatchOutcomeSchema>;

export const MatchSchema = StrictObject({
  id: IdSchema,
  matchdayId: IdSchema,
  homeTeamId: IdSchema,
  awayTeamId: IdSchema,
  kickoffAt: IsoDateTimeSchema,
  outcome: Type.Union([MatchOutcomeSchema, Type.Null()]),
});
export type Match = Static<typeof MatchSchema>;

export const MatchdayStatusSchema = Type.Union([
  Type.Literal('open'),
  Type.Literal('locked'),
  Type.Literal('resolved'),
]);
export type MatchdayStatus = Static<typeof MatchdayStatusSchema>;

export const MatchdaySchema = StrictObject({
  id: IdSchema,
  leagueId: IdSchema,
  number: Type.Integer({ minimum: 1 }),
  status: MatchdayStatusSchema,
  lockAt: IsoDateTimeSchema,
});
export type Matchday = Static<typeof MatchdaySchema>;

// ── Users ──────────────────────────────────────────────────────────────────

/** Public user shape. Credentials (passwordHash) never cross a contract boundary. */
export const UserSchema = StrictObject({
  id: IdSchema,
  email: EmailSchema,
  displayName: Type.String({ minLength: 1 }),
  createdAt: IsoDateTimeSchema,
});
export type User = Static<typeof UserSchema>;

// ── Penkas & entries ───────────────────────────────────────────────────────

export const PenkaSettingsSchema = StrictObject({
  lives: Type.Integer({ minimum: 1 }),
  islandEnabled: Type.Boolean(),
});
export type PenkaSettings = Static<typeof PenkaSettingsSchema>;

export const PenkaSchema = StrictObject({
  id: IdSchema,
  leagueId: IdSchema,
  name: Type.String({ minLength: 1 }),
  joinCode: Type.String({ minLength: 1 }),
  settings: PenkaSettingsSchema,
  createdAt: IsoDateTimeSchema,
});
export type Penka = Static<typeof PenkaSchema>;

export const EntryStatusSchema = Type.Union([Type.Literal('alive'), Type.Literal('island')]);
export type EntryStatus = Static<typeof EntryStatusSchema>;

export const EntrySchema = StrictObject({
  id: IdSchema,
  penkaId: IdSchema,
  userId: IdSchema,
  lives: Type.Integer({ minimum: 0 }),
  status: EntryStatusSchema,
  usedTeams: Type.Array(IdSchema),
  points: Type.Integer({ minimum: 0 }),
});
export type Entry = Static<typeof EntrySchema>;

// Named PlayerPick (not Pick) so the exported type never shadows TypeScript's Pick<T, K>.
export const PlayerPickSchema = StrictObject({
  id: IdSchema,
  entryId: IdSchema,
  matchdayId: IdSchema,
  teamId: IdSchema,
  createdAt: IsoDateTimeSchema,
});
export type PlayerPick = Static<typeof PlayerPickSchema>;

export const ResolutionSchema = StrictObject({
  id: IdSchema,
  penkaId: IdSchema,
  matchdayId: IdSchema,
  resolvedAt: IsoDateTimeSchema,
  eliminatedEntryIds: Type.Array(IdSchema),
  islandEntryIds: Type.Array(IdSchema),
});
export type Resolution = Static<typeof ResolutionSchema>;

// ── Read models ────────────────────────────────────────────────────────────

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
export type BoardHistoryItem = Static<typeof BoardHistoryItemSchema>;

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

/** Personal delta layered on top of the public board for the authenticated player. */
export const MyEntrySchema = StrictObject({
  lives: Type.Integer({ minimum: 0 }),
  status: EntryStatusSchema,
  myPick: Type.Union([IdSchema, Type.Null()]),
  usedTeams: Type.Array(IdSchema),
});
export type MyEntry = Static<typeof MyEntrySchema>;
