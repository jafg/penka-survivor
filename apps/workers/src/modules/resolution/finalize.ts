import type { Db } from 'mongodb';
import type { Logger } from '../../logger';
import { matchdaysCollection, penkasCollection, resolutionsCollection } from './store';

export interface FinalizeMatchdayInput {
  db: Db;
  log: Logger;
  leagueId: string;
  matchdayId: string;
  /** When the operator pressed resolve — the message's own `requestedAt`. */
  requestedAt: Date;
}

export interface FinalizeMatchdayResult {
  /** True only when this call is the one that advanced the shared document. */
  resolved: boolean;
  /** Penkas whose cached board the flip just made stale. Empty unless it flipped. */
  penkaIds: string[];
}

/**
 * Advance the league's matchday to `resolved` — but only once every penka that
 * was told to resolve it has.
 *
 * **Why this exists at all.** Nothing else in the system writes that status. The
 * back office deliberately refuses to (`resolveRequestedAt` is bookkeeping, not
 * a state), and the engine reads `resolved` to answer `already_resolved`, so
 * without this the calendar would never advance: `selectCurrentMatchday` would
 * hand every player matchday 1 forever.
 *
 * **Why it counts.** A matchday is league-scoped and shared by every penka on
 * that league; a resolution is penka-scoped. Flipping the shared document after
 * the first penka finished would turn every sibling penka's command into an
 * `already_resolved` no-op, silently skipping their players. So the flip waits
 * for the whole fan-out.
 *
 * **Which penkas count.** Exactly the ones the back office published a command
 * for: those that existed when the operator pressed resolve. Comparing against
 * the message's own `requestedAt` is what keeps a penka created a second after
 * the fan-out from stranding the matchday as locked forever.
 *
 * **This is bookkeeping, not a rule.** It decides when a shared document has
 * finished being written, not what resolution does to anyone — that stayed in
 * `@penka/game-engine`.
 *
 * Never throws: the penka's own resolution is already durable when this runs.
 */
export async function finalizeMatchday(
  input: FinalizeMatchdayInput,
): Promise<FinalizeMatchdayResult> {
  const { db, log, leagueId, matchdayId, requestedAt } = input;
  const nothingChanged: FinalizeMatchdayResult = { resolved: false, penkaIds: [] };

  try {
    const docs = await penkasCollection(db)
      .find({ leagueId, createdAt: { $lte: requestedAt } })
      .project<{ _id: unknown }>({ _id: 1 })
      .toArray();
    const penkaIds = docs.map((doc) => String(doc._id));
    if (penkaIds.length === 0) {
      // Not "all zero are done": a league nobody plays has no matchday to finish.
      return nothingChanged;
    }

    const resolved = await resolutionsCollection(db).countDocuments({
      matchdayId,
      penkaId: { $in: penkaIds },
    });
    if (resolved < penkaIds.length) {
      log.debug(
        { matchdayId, resolved, expected: penkaIds.length },
        'matchday still has penkas to resolve',
      );
      return nothingChanged;
    }

    // `status: 'locked'` in the filter makes a concurrent second finalizer a
    // no-op rather than a competing write, and refuses to skip an open matchday.
    const result = await matchdaysCollection(db).updateOne(
      { _id: matchdayId, status: 'locked' },
      { $set: { status: 'resolved' } },
    );
    if (result.modifiedCount === 0) {
      // Already resolved — every redelivery of a finished matchday lands here.
      return nothingChanged;
    }
    log.info({ matchdayId, penkas: penkaIds.length }, 'matchday resolved for every penka');
    return { resolved: true, penkaIds };
  } catch (error) {
    // Deliberately swallowed. The caller has already applied and marked this
    // penka's resolution; failing the message now would redeliver a matchday
    // whose eliminations are durable. The next command for this matchday — or
    // the gate's no-op path on a redelivery — runs this again.
    log.error({ err: error, matchdayId }, 'could not finalize the shared matchday status');
    return nothingChanged;
  }
}
