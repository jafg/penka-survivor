import { describe, expect, it } from 'vitest';
import type { MatchdayStatus } from '@penka/contracts';
import { selectCurrentMatchday } from './current-matchday';

function matchday(number: number, status: MatchdayStatus = 'open') {
  return { number, status };
}

describe('selectCurrentMatchday', () => {
  it('is the lowest-numbered matchday nobody has resolved yet', () => {
    const matchdays = [matchday(3), matchday(1, 'resolved'), matchday(2, 'locked')];

    expect(selectCurrentMatchday(matchdays)?.number).toBe(2);
  });

  it('does not depend on the order the database hands them back', () => {
    const ascending = [matchday(1), matchday(2), matchday(3)];

    expect(selectCurrentMatchday(ascending)?.number).toBe(1);
    expect(selectCurrentMatchday([...ascending].reverse())?.number).toBe(1);
  });

  it('stays on the last matchday once the whole calendar is resolved', () => {
    const played = [matchday(2, 'resolved'), matchday(3, 'resolved'), matchday(1, 'resolved')];

    expect(selectCurrentMatchday(played)?.number).toBe(3);
  });

  it('has no answer for a league whose calendar was never materialized', () => {
    expect(selectCurrentMatchday([])).toBeUndefined();
  });

  it('returns the document the caller passed, not a view of it', () => {
    // Callers pass their storage documents and use what comes back (its id, its
    // lock time), so this must be the same object, not a { number, status } pair.
    const locked = { number: 1, status: 'locked' as const, _id: 'la-liga:md1' };

    expect(selectCurrentMatchday([locked])).toBe(locked);
  });
});
