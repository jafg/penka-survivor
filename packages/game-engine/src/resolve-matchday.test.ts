import { describe, expect, it } from 'vitest';
import { didTeamWin, resolveMatchday } from './resolve-matchday';
import type { ResolveMatchdayInput } from './resolve-matchday';
import {
  buildEntry,
  buildMatch,
  buildMatchday,
  buildPick,
  buildSettings,
  deepFreeze,
} from './test-support/build';

function baseInput(overrides: Partial<ResolveMatchdayInput> = {}): ResolveMatchdayInput {
  return {
    matchday: buildMatchday({ status: 'locked' }),
    entries: [buildEntry()],
    picks: [buildPick()],
    matches: [buildMatch()],
    settings: buildSettings(),
    ...overrides,
  };
}

function effectsOf(input: ResolveMatchdayInput) {
  const result = resolveMatchday(input);
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result.outcome;
}

describe('resolveMatchday', () => {
  describe('life outcomes for alive entries', () => {
    it('win: survives with no life lost and earns a correct-pick point', () => {
      const outcome = effectsOf(baseInput({ matches: [buildMatch({ outcome: 'home' })] }));
      expect(outcome.effects).toEqual([
        {
          entryId: 'entry-1',
          livesDelta: 0,
          pointsDelta: 1,
          newLives: 2,
          newStatus: 'alive',
          teamConsumed: 'HOME',
        },
      ]);
      expect(outcome.eliminatedEntryIds).toEqual([]);
    });

    it('win: an away pick wins when the outcome is away', () => {
      const outcome = effectsOf(
        baseInput({
          matches: [buildMatch({ outcome: 'away' })],
          picks: [buildPick({ teamCode: 'AWAY' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: 0,
        pointsDelta: 1,
        teamConsumed: 'AWAY',
      });
    });

    it('draw: loses one life', () => {
      const outcome = effectsOf(baseInput({ matches: [buildMatch({ outcome: 'draw' })] }));
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: -1,
        pointsDelta: 0,
        newLives: 1,
        newStatus: 'alive',
        teamConsumed: 'HOME',
      });
    });

    it('loss: loses one life', () => {
      const outcome = effectsOf(
        baseInput({
          matches: [buildMatch({ outcome: 'home' })],
          picks: [buildPick({ teamCode: 'AWAY' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: -1,
        newLives: 1,
        teamConsumed: 'AWAY',
      });
    });

    it('no pick submitted: loses one life and consumes no team', () => {
      const outcome = effectsOf(baseInput({ picks: [] }));
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: -1,
        pointsDelta: 0,
        newLives: 1,
        newStatus: 'alive',
        teamConsumed: null,
      });
    });

    it('when duplicate picks exist for one entry, the first submitted pick wins', () => {
      const outcome = effectsOf(
        baseInput({
          picks: [
            buildPick({ id: 'p-first', teamCode: 'HOME' }),
            buildPick({ id: 'p-second', teamCode: 'AWAY' }),
          ],
          matches: [buildMatch({ outcome: 'home' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ pointsDelta: 1, teamConsumed: 'HOME' });
    });

    it("a pick for another matchday does not count as this matchday's pick", () => {
      const outcome = effectsOf(baseInput({ picks: [buildPick({ matchdayId: 'md-2' })] }));
      expect(outcome.effects[0]).toMatchObject({ livesDelta: -1, teamConsumed: null });
    });

    it('a pick for a team not playing counts as a missed pick and consumes no team', () => {
      const outcome = effectsOf(baseInput({ picks: [buildPick({ teamCode: 'GHOST' })] }));
      expect(outcome.effects[0]).toMatchObject({ livesDelta: -1, teamConsumed: null });
    });
  });

  describe('elimination', () => {
    it('moves an alive entry to the island exactly at 0 lives', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [buildEntry({ lives: 1 })],
          matches: [buildMatch({ outcome: 'draw' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ newLives: 0, newStatus: 'island' });
      expect(outcome.eliminatedEntryIds).toEqual(['entry-1']);
    });

    it('does not eliminate an entry that still has lives left', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [buildEntry({ lives: 2 })],
          matches: [buildMatch({ outcome: 'draw' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ newLives: 1, newStatus: 'alive' });
      expect(outcome.eliminatedEntryIds).toEqual([]);
    });

    it('never drives lives negative, even for a degenerate 0-life alive entry', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [buildEntry({ lives: 0 })],
          picks: [],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ livesDelta: 0, newLives: 0, newStatus: 'island' });
    });

    it('does not report a degenerate 0-life alive entry as newly eliminated', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [buildEntry({ lives: 0 })],
          picks: [],
        }),
      );
      expect(outcome.eliminatedEntryIds).toEqual([]);
      expect(outcome.summary.eliminated).toBe(0);
    });
  });

  describe('island entries', () => {
    const islander = buildEntry({ id: 'entry-isla', status: 'island', lives: 0 });

    it('gains a point for a correct pick and never loses lives', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [islander],
          picks: [buildPick({ entryId: 'entry-isla' })],
          matches: [buildMatch({ outcome: 'home' })],
        }),
      );
      expect(outcome.effects[0]).toEqual({
        entryId: 'entry-isla',
        livesDelta: 0,
        pointsDelta: 1,
        newLives: 0,
        newStatus: 'island',
        teamConsumed: 'HOME',
      });
    });

    it('loses nothing on a wrong pick', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [islander],
          picks: [buildPick({ entryId: 'entry-isla' })],
          matches: [buildMatch({ outcome: 'away' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: 0,
        pointsDelta: 0,
        newStatus: 'island',
        teamConsumed: 'HOME',
      });
    });

    it('loses nothing when it did not pick', () => {
      const outcome = effectsOf(baseInput({ entries: [islander], picks: [] }));
      expect(outcome.effects[0]).toMatchObject({
        livesDelta: 0,
        pointsDelta: 0,
        newStatus: 'island',
        teamConsumed: null,
      });
    });

    it('a pick for a team not playing earns nothing and consumes nothing', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [islander],
          picks: [buildPick({ entryId: 'entry-isla', teamCode: 'GHOST' })],
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ pointsDelta: 0, teamConsumed: null });
    });

    it('ignores island picks entirely when the island is disabled', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [islander],
          picks: [buildPick({ entryId: 'entry-isla' })],
          matches: [buildMatch({ outcome: 'home' })],
          settings: buildSettings({ islandEnabled: false }),
        }),
      );
      expect(outcome.effects[0]).toMatchObject({ pointsDelta: 0, teamConsumed: null });
    });
  });

  describe('rejections', () => {
    it('rejects when any match of the matchday is missing its result', () => {
      const result = resolveMatchday(
        baseInput({
          matches: [
            buildMatch(),
            buildMatch({ id: 'match-2', homeTeamCode: 'CC', awayTeamCode: 'DD', outcome: null }),
          ],
        }),
      );
      expect(result).toEqual({ ok: false, code: 'results_missing' });
    });

    it("ignores unresolved matches from other matchdays", () => {
      const result = resolveMatchday(
        baseInput({
          matches: [buildMatch(), buildMatch({ id: 'match-x', matchdayId: 'md-2', outcome: null })],
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('rejects an already resolved matchday so callers can enforce idempotency', () => {
      const result = resolveMatchday(baseInput({ matchday: buildMatchday({ status: 'resolved' }) }));
      expect(result).toEqual({ ok: false, code: 'already_resolved' });
    });

    it('rejects a matchday that is still open — players could still be picking', () => {
      const result = resolveMatchday(baseInput({ matchday: buildMatchday({ status: 'open' }) }));
      expect(result).toEqual({ ok: false, code: 'matchday_not_locked' });
    });
  });

  describe('outcome identity and summary', () => {
    it('carries the matchday id and number so persistence can detect double resolution', () => {
      const outcome = effectsOf(
        baseInput({ matchday: buildMatchday({ id: 'md-7', number: 7, status: 'locked' }) }),
      );
      expect(outcome.matchdayId).toBe('md-7');
      expect(outcome.matchdayNumber).toBe(7);
    });

    it('summarises entry movements deterministically', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [
            buildEntry({ id: 'e-win' }),
            buildEntry({ id: 'e-out', lives: 1 }),
            buildEntry({ id: 'e-isla', status: 'island', lives: 0 }),
          ],
          picks: [buildPick({ id: 'p1', entryId: 'e-win', teamCode: 'HOME' })],
          matches: [buildMatch({ outcome: 'home' })],
        }),
      );
      expect(outcome.summary).toEqual({
        totalEntries: 3,
        aliveBefore: 2,
        aliveAfter: 1,
        islandBefore: 1,
        islandAfter: 2,
        eliminated: 1,
      });
      expect(outcome.eliminatedEntryIds).toEqual(['e-out']);
    });

    it('returns effects in input entry order', () => {
      const outcome = effectsOf(
        baseInput({
          entries: [buildEntry({ id: 'e-b' }), buildEntry({ id: 'e-a' })],
          picks: [],
        }),
      );
      expect(outcome.effects.map((effect) => effect.entryId)).toEqual(['e-b', 'e-a']);
    });
  });

  describe('purity', () => {
    it('is deterministic: same input, deep-equal outcome', () => {
      const input = baseInput({
        entries: [buildEntry(), buildEntry({ id: 'entry-2', lives: 1 })],
        picks: [buildPick()],
      });
      expect(resolveMatchday(input)).toEqual(resolveMatchday(input));
    });

    it('does not mutate deeply frozen input', () => {
      const input = deepFreeze(
        baseInput({
          entries: [buildEntry({ lives: 1 })],
          matches: [buildMatch({ outcome: 'draw' })],
        }),
      );
      const result = resolveMatchday(input);
      expect(result.ok).toBe(true);
      expect(input.entries[0]).toEqual(buildEntry({ lives: 1 }));
    });
  });
});

describe('didTeamWin', () => {
  // The pick screen has to tell a player whether their pick survived, and that
  // is the same question resolution asks. Exported so no app answers it twice.
  it('is true for the home team of a home win', () => {
    expect(didTeamWin([buildMatch({ outcome: 'home' })], 'HOME')).toBe(true);
  });

  it('is true for the away team of an away win', () => {
    expect(didTeamWin([buildMatch({ outcome: 'away' })], 'AWAY')).toBe(true);
  });

  it('is false for the loser', () => {
    expect(didTeamWin([buildMatch({ outcome: 'home' })], 'AWAY')).toBe(false);
  });

  it('is false for a draw, on both sides', () => {
    const drawn = [buildMatch({ outcome: 'draw' })];
    expect(didTeamWin(drawn, 'HOME')).toBe(false);
    expect(didTeamWin(drawn, 'AWAY')).toBe(false);
  });

  it('is false while the match has no outcome', () => {
    expect(didTeamWin([buildMatch({ outcome: null })], 'HOME')).toBe(false);
  });

  it('is false for a team that is not in the list', () => {
    expect(didTeamWin([buildMatch()], 'OTHER')).toBe(false);
  });

  it('finds the team match among several', () => {
    const matches = [
      buildMatch({ id: 'match-1', outcome: 'home' }),
      buildMatch({ id: 'match-2', homeTeamCode: 'RIV', awayTeamCode: 'BOC', outcome: 'away' }),
    ];
    expect(didTeamWin(matches, 'BOC')).toBe(true);
    expect(didTeamWin(matches, 'RIV')).toBe(false);
  });
});
