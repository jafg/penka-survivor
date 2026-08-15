import type { Db } from 'mongodb';
import type { CatalogLeague } from '../catalog/catalog';
import { buildLeagueCalendar } from './calendar';
import { isDuplicateKeyError } from './mongo-errors';
import { matchdaysCollection, matchesCollection } from './store';

/** A concurrent creator got there first — their documents are the ones we want. */
async function insertOnce(insert: () => Promise<unknown>): Promise<void> {
  try {
    await insert();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return;
    }
    throw error;
  }
}

/**
 * Materialize a league's calendar the first time any penka needs it, and do
 * nothing on every call after that: matchdays and matches are per LEAGUE, so
 * every penka on the same league plays the same fixtures on the same dates.
 *
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
 */
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
