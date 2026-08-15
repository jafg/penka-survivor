import { describe, expect, it } from 'vitest';
import {
  computeStandings,
  isoToEpochMs,
  rankWinners,
  resolveMatchday,
  validatePick,
} from './index';
import {
  buildEntry,
  buildMatch,
  buildMatchday,
  buildPick,
  buildSettings,
} from './test-support/build';

describe('public API (barrel)', () => {
  it('exposes the whole engine and plays one matchday end to end', () => {
    const matchday = buildMatchday();
    const matches = [buildMatch({ outcome: 'home' })];
    const entry = buildEntry({ lives: 1 });
    const settings = buildSettings();

    expect(isoToEpochMs(matchday.lockAt)).toBeTypeOf('number');
    expect(
      validatePick({ entry, matchday, matches, teamId: 'team-home', now: '2026-08-21T18:00:00Z', settings }),
    ).toEqual({ ok: true });

    const result = resolveMatchday({
      matchday: buildMatchday({ status: 'locked' }),
      entries: [entry],
      picks: [buildPick({ teamId: 'team-away' })],
      matches,
      settings,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.eliminatedEntryIds).toEqual(['entry-1']);
      const after = buildEntry({ lives: 0, status: 'island' });
      expect(computeStandings([after]).island).toHaveLength(1);
      expect(rankWinners([after])).toHaveLength(1);
    }
  });
});
