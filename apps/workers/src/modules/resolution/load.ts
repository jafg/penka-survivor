import { ObjectId, type Db } from 'mongodb';
import {
  matchdayId as buildMatchdayId,
  type Entry,
  type Match,
  type Matchday,
  type PenkaSettings,
  type PlayerPick,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import {
  entriesCollection,
  matchdaysCollection,
  matchesCollection,
  penkasCollection,
  picksCollection,
  toEntry,
  toMatch,
  toMatchday,
  toPlayerPick,
} from './store';

/**
 * Everything `resolveMatchday` needs, in **contract** types: ISO strings for
 * timestamps and hex strings for ids. The engine never sees an `ObjectId` or a
 * `Date`, which is what keeps it pure and what lets an integration test replay
 * the same input through it and compare.
 */
export interface ResolutionState {
  matchday: Matchday;
  matches: Match[];
  entries: Entry[];
  picks: PlayerPick[];
  settings: PenkaSettings;
}

/**
 * Read the state one resolution command refers to, or `null` when the command
 * refers to something that is not there.
 *
 * `null` is not a failure to retry: a deleted penka, a matchday the calendar
 * never had, or a message whose penka and league disagree will read the same way
 * on every redelivery. The caller acks and logs rather than looping.
 *
 * These are reads, so `Promise.all` is right here — nothing is written, so
 * there is no partial state for a short-circuit to hide. (The write path uses
 * `Promise.allSettled` for exactly that reason; see `apply.ts`.)
 */
export async function loadResolutionState(
  db: Db,
  command: ResolveMatchdayCommand,
): Promise<ResolutionState | null> {
  const matchdayDocId = buildMatchdayId(command.leagueId, command.matchday);

  // `IdSchema` is any non-empty string on purpose — contracts do not commit to
  // Mongo's id format — so the command schema lets a value through that the
  // driver refuses. Letting it throw would read as "retry" and burn every
  // delivery on a string that will never be an ObjectId; it is unfixable in
  // exactly the way the rest of this function's `null` cases are.
  if (!ObjectId.isValid(command.penkaId)) {
    return null;
  }

  const [penkaDoc, matchdayDoc, matchDocs, entryDocs] = await Promise.all([
    penkasCollection(db).findOne({ _id: ObjectId.createFromHexString(command.penkaId) }),
    matchdaysCollection(db).findOne({ _id: matchdayDocId }),
    matchesCollection(db).find({ matchdayId: matchdayDocId }).toArray(),
    entriesCollection(db).find({ penkaId: command.penkaId }).toArray(),
  ]);

  if (penkaDoc === null || matchdayDoc === null) {
    return null;
  }
  // The penka id and the league id are two independent claims in one message.
  // If they disagree, the matchday addressed is not the one this penka plays.
  if (penkaDoc.leagueId !== command.leagueId) {
    return null;
  }

  const entryIds = entryDocs.map((doc) => doc._id.toHexString());
  const pickDocs =
    entryIds.length === 0
      ? []
      : await picksCollection(db)
          .find({ entryId: { $in: entryIds }, matchdayId: matchdayDocId })
          .toArray();

  return {
    matchday: toMatchday(matchdayDoc),
    matches: matchDocs.map(toMatch),
    entries: entryDocs.map(toEntry),
    picks: pickDocs.map(toPlayerPick),
    settings: penkaDoc.settings,
  };
}
