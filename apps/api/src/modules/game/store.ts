import type { Collection, Db, WithId } from 'mongodb';
import type { Match, Matchday, PlayerPick, Resolution } from '@penka/contracts';
import type { MatchDoc, MatchdayDoc } from '../penkas/store';

/**
 * Mongo document shape — internal to the API; it never crosses a contract
 * boundary. A pick points at an ENTRY, not a user: the same person playing two
 * penkas on one league has two entries, and their picks are independent.
 *
 * `matchdayId` is the derived league-scoped id (`copa-libertadores:md1`), so a
 * pick needs no penkaId of its own — the entry already names the penka.
 */
export interface PickDoc {
  entryId: string;
  matchdayId: string;
  teamCode: string;
  createdAt: Date;
}

export function picksCollection(db: Db): Collection<PickDoc> {
  return db.collection<PickDoc>('picks');
}

/**
 * A resolved matchday, written by `@penka/workers` and read here to build the
 * board's history. **This app never writes one** — resolution is asynchronous
 * and the worker owns both the write and the unique `(penkaId, matchdayId)`
 * index that makes it idempotent.
 *
 * The shape is declared twice on purpose, once per process, the same way the
 * back office declares its own `PenkaDoc`: a collection crossing an app boundary
 * is a contract about *bytes in Mongo*, and a shared TypeScript interface would
 * only make the two apps look coupled without making them agree.
 */
export interface ResolutionDoc {
  penkaId: string;
  matchdayId: string;
  resolvedAt: Date;
  /** Entries this matchday knocked out — the ones the history names. */
  eliminatedEntryIds: string[];
  /** Every entry on the island once this matchday was applied. */
  islandEntryIds: string[];
}

export function resolutionsCollection(db: Db): Collection<ResolutionDoc> {
  return db.collection<ResolutionDoc>('resolutions');
}

export async function ensureGameIndexes(db: Db): Promise<void> {
  // One pick per entry per matchday. Submitting is an upsert that leans on this
  // index to settle a race: the loser gets a duplicate key and updates instead.
  // Its prefix also serves the board's read, which fetches a whole matchday's
  // picks by entry id.
  await picksCollection(db).createIndex({ entryId: 1, matchdayId: 1 }, { unique: true });
}

/**
 * Matchdays and matches are league-scoped documents owned by the penkas module
 * (see its store), so this module reuses those typed accessors and only adds
 * the mappers the game endpoints need — `_id` is already the derived string id.
 */
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
