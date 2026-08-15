import type { Match, Matchday, PenkaSettings } from '@penka/contracts';
import { resolveMatchday, type ResolveRejectionCode } from '@penka/game-engine';

/**
 * Settings the dry run below never reads. `resolveMatchday` checks all three
 * preconditions before it looks at a single entry, and settings only ever shape
 * per-entry effects — with no entries, nothing can reach them. Naming that here
 * is cheaper than pretending to fetch a penka's real settings for a question
 * that does not depend on them.
 */
const UNREAD_SETTINGS: PenkaSettings = { lives: 1, islandEnabled: false };

/**
 * Why resolution would be refused, or null if it would be accepted.
 *
 * This asks the ENGINE rather than re-checking "locked and complete" here: the
 * preconditions of resolution are a game rule, and the worker will run exactly
 * this check for real. Passing no entries and no picks makes it a dry run —
 * the engine rejects before it touches them — so the API boundary and the
 * worker can never disagree about what "resolvable" means.
 */
export function whyNotResolvable(
  matchday: Matchday,
  matches: readonly Match[],
): ResolveRejectionCode | null {
  const result = resolveMatchday({
    matchday,
    entries: [],
    picks: [],
    matches,
    settings: UNREAD_SETTINGS,
  });
  return result.ok ? null : result.code;
}

/** How many of these matches still have no result. */
export function countPending(matches: readonly Match[]): number {
  return matches.filter((match) => match.outcome === null).length;
}
