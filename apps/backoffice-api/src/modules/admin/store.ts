import type { Collection, Db, WithId } from 'mongodb';
import type {
  Entry,
  EntryStatus,
  Match,
  MatchOutcome,
  Matchday,
  MatchdayStatus,
  Penka,
} from '@penka/contracts';

/**
 * Mongo document shapes. These collections are written by @penka/api and read
 * (and, for results and status, written) here: the two apps share a database,
 * so these declarations must stay identical to the ones in
 * `apps/api/src/modules/penkas/store.ts` field for field. They are internal —
 * nothing here crosses a contract boundary without going through a mapper.
 */
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
 * league plays the same calendar, and their `_id`s are derived from the league
 * and the matchday number (`matchdayId`, `matchId` in @penka/contracts).
 *
 * `resolveRequestedAt` is the ONE field this app adds. `MatchdayStatus` is a
 * closed set of three — open, locked, resolved — and "an operator pressed
 * resolve and the workers have not finished" is not one of them: it is not a
 * state of the game, it is bookkeeping about a request in flight. Making it a
 * status would put a fourth value in front of every player-facing client.
 * @penka/api never reads this field, and no mapper ever emits it.
 */
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

/** Picks live in their own collection, keyed by entry and matchday (see @penka/api). */
export interface PickDoc {
  entryId: string;
  matchdayId: string;
  teamCode: string;
  createdAt: Date;
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

/**
 * Indexes this app's own reads need. Everything else it queries is already
 * indexed by @penka/api (which owns the unique keys); these two are the
 * back-office-only access paths:
 *
 * - `penkas.leagueId` — resolving a matchday fans out to every penka of a
 *   league, so this collection scan happens on the operator's critical path.
 * - `picks.matchdayId` — counting the picks in for a matchday across every
 *   entry, which no player-facing query ever does.
 *
 * Declaring an index that already exists is a no-op, so calling this on route
 * registration is safe however many processes boot at once.
 */
export async function ensureAdminIndexes(db: Db): Promise<void> {
  await Promise.all([
    penkasCollection(db).createIndex({ leagueId: 1 }),
    picksCollection(db).createIndex({ matchdayId: 1 }),
  ]);
}

export function toPenka(doc: WithId<PenkaDoc>): Penka {
  return {
    id: doc._id.toHexString(),
    leagueId: doc.leagueId,
    name: doc.name,
    joinCode: doc.joinCode,
    settings: doc.settings,
    createdAt: doc.createdAt.toISOString(),
  };
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
