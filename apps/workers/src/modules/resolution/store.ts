import type { Collection, Db, WithId } from 'mongodb';
import type {
  Entry,
  EntryStatus,
  Match,
  MatchOutcome,
  Matchday,
  MatchdayStatus,
  PenkaSettings,
  PlayerPick,
  Resolution,
} from '@penka/contracts';
import type { PickResult } from '@penka/game-engine';

/**
 * Mongo document shapes. Every collection below except `resolutions` is written
 * by @penka/api, so these declarations must stay identical to the ones in
 * `apps/api/src/modules/penkas/store.ts` and `.../game/store.ts` field for
 * field — the same duplication @penka/backoffice-api carries, for the same
 * reason: the three processes share a database, never a module.
 *
 * They are internal. Nothing here crosses a contract boundary without a mapper.
 */
export interface PenkaDoc {
  name: string;
  leagueId: string;
  joinCode: string;
  settings: PenkaSettings;
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

/** `resolveRequestedAt` is the back office's; this worker neither reads nor clears it. */
export interface MatchdayDoc {
  _id: string;
  leagueId: string;
  number: number;
  status: MatchdayStatus;
  lockAt: Date;
  resolveRequestedAt?: Date;
}

export interface MatchDoc {
  _id: string;
  matchdayId: string;
  leagueId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAt: Date;
  outcome: MatchOutcome | null;
}

/**
 * `result` is the ONE field this worker adds to a document @penka/api owns: the
 * label a resolution leaves on the pick it settled. It is deliberately not in
 * `PlayerPickSchema` — that shape is what the picks endpoint returns, and no
 * endpoint serves a settled pick yet — so `toPlayerPick` never emits it.
 */
export interface PickDoc {
  entryId: string;
  matchdayId: string;
  teamCode: string;
  createdAt: Date;
  result?: PickResult;
}

export interface UserDoc {
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: Date;
}

/**
 * A resolved matchday — the one collection this worker owns and the only one it
 * creates. It is also the **idempotency marker**: it is written last, and the
 * unique `(penkaId, matchdayId)` index below is what makes a redelivered
 * command a no-op instead of a second elimination.
 *
 * @penka/api declares the same shape to read the board's history and never
 * writes one.
 */
export interface ResolutionDoc {
  penkaId: string;
  matchdayId: string;
  resolvedAt: Date;
  /** Entries this matchday knocked out — the ones the board's history names. */
  eliminatedEntryIds: string[];
  /** Every entry on the island once this matchday was applied. */
  islandEntryIds: string[];
}

export function penkasCollection(db: Db): Collection<PenkaDoc> {
  return db.collection<PenkaDoc>('penkas');
}

export function entriesCollection(db: Db): Collection<EntryDoc> {
  return db.collection<EntryDoc>('entries');
}

export function matchdaysCollection(db: Db): Collection<MatchdayDoc> {
  return db.collection<MatchdayDoc>('matchdays');
}

export function matchesCollection(db: Db): Collection<MatchDoc> {
  return db.collection<MatchDoc>('matches');
}

export function picksCollection(db: Db): Collection<PickDoc> {
  return db.collection<PickDoc>('picks');
}

export function usersCollection(db: Db): Collection<UserDoc> {
  return db.collection<UserDoc>('users');
}

export function resolutionsCollection(db: Db): Collection<ResolutionDoc> {
  return db.collection<ResolutionDoc>('resolutions');
}

/**
 * The index this worker's correctness rests on. One resolution per penka per
 * matchday, enforced by the database: the handler's "have I already done this?"
 * read can be raced by a redelivery, a unique key cannot, so the gate is the
 * fast path and this is the guarantee.
 *
 * Its prefix (`penkaId`) is also the access path @penka/api uses to build a
 * board's history.
 *
 * Declaring an index that already exists is a no-op, so this runs on every boot
 * (the pattern the two APIs use) rather than behind a migration.
 */
export async function ensureWorkerIndexes(db: Db): Promise<void> {
  await resolutionsCollection(db).createIndex({ penkaId: 1, matchdayId: 1 }, { unique: true });
}

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

/** `resolveRequestedAt` stays behind: the contract has three matchday states. */
export function toMatchday(doc: MatchdayDoc): Matchday {
  return {
    id: doc._id,
    leagueId: doc.leagueId,
    number: doc.number,
    status: doc.status,
    lockAt: doc.lockAt.toISOString(),
  };
}

/** The stored `leagueId` stays behind: a match is reached through its matchday. */
export function toMatch(doc: MatchDoc): Match {
  return {
    id: doc._id,
    matchdayId: doc.matchdayId,
    homeTeamCode: doc.homeTeamCode,
    awayTeamCode: doc.awayTeamCode,
    kickoffAt: doc.kickoffAt.toISOString(),
    outcome: doc.outcome,
  };
}

/** `result` stays behind: PlayerPickSchema is a closed shape and does not carry it. */
export function toPlayerPick(doc: WithId<PickDoc>): PlayerPick {
  return {
    id: doc._id.toHexString(),
    entryId: doc.entryId,
    matchdayId: doc.matchdayId,
    teamCode: doc.teamCode,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toResolution(doc: WithId<ResolutionDoc>): Resolution {
  return {
    id: doc._id.toHexString(),
    penkaId: doc.penkaId,
    matchdayId: doc.matchdayId,
    resolvedAt: doc.resolvedAt.toISOString(),
    eliminatedEntryIds: doc.eliminatedEntryIds,
    islandEntryIds: doc.islandEntryIds,
  };
}
