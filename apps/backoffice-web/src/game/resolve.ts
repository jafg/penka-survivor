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
 * Deliberately the SAME dry run the admin API runs behind `readyToResolve`, and
 * for the same reason: the preconditions of resolution are a game rule, so
 * neither this app nor that one may re-check "locked and complete" by hand. With
 * no entries and no picks the engine rejects before it touches them, which makes
 * this pure.
 *
 * The console needs its own copy because it must know the answer BEFORE any call
 * — the resolve button's enabled state is a question about a matchday sitting in
 * a store, not about a response. When a set-result response does arrive, its
 * `readyToResolve` is the same predicate and simply agrees.
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
