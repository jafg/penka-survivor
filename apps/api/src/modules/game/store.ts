import type { Collection, Db, WithId } from 'mongodb';
import type { Match, Matchday, PlayerPick } from '@penka/contracts';
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

/**
 * The matchday every endpoint means by "now": the lowest-numbered one still
 * unresolved. Once the whole calendar has been resolved there is nothing left
 * to play, so the last matchday stays on screen with its final board instead of
 * the penka going blank.
 */
export function selectCurrentMatchday(
  matchdays: readonly MatchdayDoc[],
): MatchdayDoc | undefined {
  const unplayed = matchdays.filter((matchday) => matchday.status !== 'resolved');
  if (unplayed.length > 0) {
    return unplayed.reduce((current, matchday) =>
      matchday.number < current.number ? matchday : current,
    );
  }
  return matchdays.reduce<MatchdayDoc | undefined>(
    (current, matchday) =>
      current === undefined || matchday.number > current.number ? matchday : current,
    undefined,
  );
}
