import type {
  Board,
  BoardHistoryItem,
  BoardPlayer,
  Entry,
  Matchday,
  PlayerPick,
  Resolution,
} from '@penka/contracts';
import { computeStandings } from './standings';
import { tryIsoToEpochMs } from './time';

/**
 * Shown when a player's user document is gone. The board carries no ids, so
 * there is nothing else to fall back to — and dropping the row instead would
 * quietly change how many players a penka appears to have.
 */
const UNKNOWN_PLAYER = 'Jugador';

export interface BuildBoardInput {
  matchday: Matchday;
  entries: readonly Entry[];
  /** userId → display name. The board names players; it never identifies them. */
  displayNames: ReadonlyMap<string, string>;
  /** Every pick recorded for this matchday. Ignored entirely before lock. */
  picks: readonly PlayerPick[];
  /** Every matchday this penka has already resolved, in any order. */
  resolutions: readonly Resolution[];
  /**
   * matchdayId → number. A resolution points at a matchday by id, and the
   * history shows a number; the caller has the calendar loaded already, so it
   * passes the mapping rather than making this function re-derive an id.
   */
  matchdayNumbers: ReadonlyMap<string, number>;
  now: Date;
  nextPollInSec: number;
}

/**
 * Are picks in for this matchday? The stored status wins when an operator has
 * already closed it; otherwise the clock decides, since the MVP locks at
 * kickoff and nothing flips the status on its own. An unreadable `lockAt`
 * leaves the matchday open — this function reveals picks, so corrupt data must
 * fail closed. (Whether a pick is *accepted* is validatePick's call, not this
 * one; it rejects the same unreadable timestamp.)
 */
export function isMatchdayLocked(matchday: Matchday, now: Date): boolean {
  if (matchday.status !== 'open') {
    return true;
  }
  const lockAtMs = tryIsoToEpochMs(matchday.lockAt);
  return lockAtMs !== null && now.getTime() >= lockAtMs;
}

/**
 * The public board, shared by every viewer of a penka. This is where the
 * invariant BoardSchema documents is enforced: a pick is secret until the
 * matchday locks, and the schema cannot express that gate, so nothing about a
 * pick leaves here before lock — however loudly the caller passed one in.
 */
export function buildBoard(input: BuildBoardInput): Board {
  const {
    matchday,
    entries,
    displayNames,
    picks,
    resolutions,
    matchdayNumbers,
    now,
    nextPollInSec,
  } = input;
  const isLocked = isMatchdayLocked(matchday, now);
  const pickByEntryId = new Map(picks.map((pick) => [pick.entryId, pick.teamCode]));
  const nameByEntryId = new Map(
    entries.map((entry) => [entry.id, displayNames.get(entry.userId) ?? UNKNOWN_PLAYER]),
  );

  const toPlayer = (entry: Entry): BoardPlayer => ({
    displayName: displayNames.get(entry.userId) ?? UNKNOWN_PLAYER,
    lives: entry.lives,
    points: entry.points,
    // Before lock: null, always. After lock: what they played, or null when
    // they never picked — clients tell the two apart by reading isLocked.
    pick: isLocked ? (pickByEntryId.get(entry.id) ?? null) : null,
  });

  const { alive, island } = computeStandings(entries);
  return {
    matchday: matchday.number,
    lockAt: matchday.lockAt,
    isLocked,
    isResolved: matchday.status === 'resolved',
    alive: alive.map(toPlayer),
    island: island.map(toPlayer),
    history: buildHistory(resolutions, matchdayNumbers, nameByEntryId),
    nextPollInSec,
  };
}

/**
 * What happened before this matchday: one row per resolution, oldest first,
 * naming the players it knocked out. Like the rest of the board it carries
 * names and never ids — a viewer who is not in the penka reads it too.
 *
 * A resolution whose matchday this league cannot number is **dropped**. It can
 * only happen if a resolution outlived its calendar, and a row claiming the
 * wrong matchday number is worse than a missing one: players read the history
 * as the story of the competition they are playing.
 */
function buildHistory(
  resolutions: readonly Resolution[],
  matchdayNumbers: ReadonlyMap<string, number>,
  nameByEntryId: ReadonlyMap<string, string>,
): BoardHistoryItem[] {
  return resolutions
    .flatMap((resolution) => {
      const number = matchdayNumbers.get(resolution.matchdayId);
      if (number === undefined) {
        return [];
      }
      return [
        {
          matchday: number,
          // An entry the board did not load is still a player who went out;
          // the placeholder keeps the row true without inventing an identity.
          eliminated: resolution.eliminatedEntryIds.map(
            (entryId) => nameByEntryId.get(entryId) ?? UNKNOWN_PLAYER,
          ),
          resolvedAt: resolution.resolvedAt,
        },
      ];
    })
    .sort((a, b) => a.matchday - b.matchday);
}
