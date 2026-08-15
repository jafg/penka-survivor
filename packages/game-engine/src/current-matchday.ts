import type { MatchdayStatus } from '@penka/contracts';

/** The little a matchday must expose for this rule; callers pass their own documents. */
export interface MatchdayProgress {
  number: number;
  status: MatchdayStatus;
}

/**
 * The matchday every caller means by "now": the lowest-numbered one still
 * unresolved. Once the whole calendar has been resolved there is nothing left
 * to play, so the last matchday stays on screen with its final board instead of
 * the penka going blank.
 *
 * It is generic over the caller's document so the public API can pass a
 * MatchdayDoc and the back office its own — both get their own object back,
 * with whatever fields they need to read next.
 */
export function selectCurrentMatchday<T extends MatchdayProgress>(
  matchdays: readonly T[],
): T | undefined {
  const unplayed = matchdays.filter((matchday) => matchday.status !== 'resolved');
  if (unplayed.length > 0) {
    return unplayed.reduce((current, matchday) =>
      matchday.number < current.number ? matchday : current,
    );
  }
  return matchdays.reduce<T | undefined>(
    (current, matchday) =>
      current === undefined || matchday.number > current.number ? matchday : current,
    undefined,
  );
}
