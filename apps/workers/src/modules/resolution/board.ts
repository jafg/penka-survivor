import { ObjectId, type Db, type WithId } from 'mongodb';
import type { Redis } from 'ioredis';
import {
  BOARD_CACHE_TTL_SECONDS,
  POLLING_PROFILE_KEY,
  boardCacheKey,
  nextPollInSec,
  toPollingProfile,
  type Board,
} from '@penka/contracts';
import { buildBoard, selectCurrentMatchday } from '@penka/game-engine';
import type { Logger } from '../../logger';
import {
  entriesCollection,
  matchdaysCollection,
  picksCollection,
  resolutionsCollection,
  toEntry,
  toMatchday,
  toPlayerPick,
  toResolution,
  usersCollection,
  type EntryDoc,
} from './store';

export interface RefreshBoardInput {
  db: Db;
  redis: Redis;
  log: Logger;
  penkaId: string;
  leagueId: string;
  now: Date;
}

/** Display names for the board. Never widen this projection — it is a user document. */
async function loadDisplayNames(
  db: Db,
  entries: readonly WithId<EntryDoc>[],
): Promise<Map<string, string>> {
  const userIds = entries.flatMap((entry) =>
    ObjectId.isValid(entry.userId) ? [new ObjectId(entry.userId)] : [],
  );
  if (userIds.length === 0) {
    return new Map();
  }
  const users = await usersCollection(db)
    .find({ _id: { $in: userIds } }, { projection: { displayName: 1 } })
    .toArray();
  return new Map(users.map((user) => [user._id.toHexString(), user.displayName]));
}

/**
 * Rebuild one penka's public board and put it in the cache @penka/api serves
 * from, so the first poll after a resolution sees the new state instead of
 * waiting out the previous entry's TTL.
 *
 * **The shape is not this worker's to choose.** `buildBoard` lives in
 * `@penka/game-engine` and both processes call it with the same inputs — the
 * whole calendar for the history captions, the entries, their display names,
 * the current matchday's picks, and this penka's resolutions. Two builders would
 * eventually serve two different boards from the same key.
 *
 * Returns the board it wrote, or `null` when the league has no calendar to show.
 */
export async function refreshBoard(input: RefreshBoardInput): Promise<Board | null> {
  const { db, redis, log, penkaId, leagueId, now } = input;

  const matchdays = await matchdaysCollection(db).find({ leagueId }).toArray();
  const matchday = selectCurrentMatchday(matchdays);
  if (matchday === undefined) {
    log.warn({ penkaId, leagueId }, 'no calendar to build a board from');
    return null;
  }

  const entries = await entriesCollection(db).find({ penkaId }).toArray();
  const [displayNames, picks, resolutions, profile] = await Promise.all([
    loadDisplayNames(db, entries),
    // Fetched whether or not the matchday is locked: the builder is the one
    // place that decides what a viewer may see, so it decides here too.
    picksCollection(db)
      .find({
        matchdayId: matchday._id,
        entryId: { $in: entries.map((entry) => entry._id.toHexString()) },
      })
      .toArray(),
    resolutionsCollection(db).find({ penkaId }).toArray(),
    redis.get(POLLING_PROFILE_KEY),
  ]);

  const board = buildBoard({
    matchday: toMatchday(matchday),
    entries: entries.map(toEntry),
    displayNames,
    picks: picks.map(toPlayerPick),
    resolutions: resolutions.map(toResolution),
    matchdayNumbers: new Map(matchdays.map((each) => [each._id, each.number])),
    now,
    nextPollInSec: nextPollInSec({
      profile: toPollingProfile(profile),
      now,
      lockAt: matchday.lockAt,
    }),
  });

  await redis.set(boardCacheKey(penkaId), JSON.stringify(board), 'EX', BOARD_CACHE_TTL_SECONDS);
  return board;
}

/**
 * Forget the cached boards of penkas this worker did not rebuild.
 *
 * Used when the shared matchday status advances: sibling penkas on the league
 * had their board built while the matchday was still locked, so their cached
 * copy is now a minute of stale truth. Dropping the key makes the next poll
 * rebuild it through @penka/api, which is cheaper and simpler than this worker
 * building a board for a penka whose message it never received.
 */
export async function dropCachedBoards(redis: Redis, penkaIds: readonly string[]): Promise<void> {
  if (penkaIds.length === 0) {
    // `DEL` with no keys is an error, not a no-op.
    return;
  }
  await redis.del(...penkaIds.map(boardCacheKey));
}
