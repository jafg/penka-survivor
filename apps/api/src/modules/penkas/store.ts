import type { Collection, Db, WithId } from 'mongodb';
import type { Entry, EntryStatus, MatchOutcome, MatchdayStatus, Penka } from '@penka/contracts';

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
