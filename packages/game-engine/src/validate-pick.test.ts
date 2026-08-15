import { describe, expect, it } from 'vitest';
import { validatePick } from './validate-pick';
import { buildEntry, buildMatch, buildMatchday, buildSettings, deepFreeze } from './test-support/build';

const BEFORE_LOCK = '2026-08-21T18:00:00.000Z';
const AT_LOCK = '2026-08-21T18:45:00.000Z';
const AFTER_LOCK = '2026-08-21T19:30:00.000Z';

function baseInput() {
  return {
    entry: buildEntry(),
    matchday: buildMatchday(),
    matches: [buildMatch()],
    teamId: 'team-home',
    now: BEFORE_LOCK,
    settings: buildSettings(),
  };
}

describe('validatePick', () => {
  it('accepts an alive entry picking a playing, unused team before lock', () => {
    expect(validatePick(baseInput())).toEqual({ ok: true });
  });

  it('accepts picking the away side of a match', () => {
    expect(validatePick({ ...baseInput(), teamId: 'team-away' })).toEqual({ ok: true });
  });

  it('accepts an island entry picking when the island is enabled', () => {
    const input = { ...baseInput(), entry: buildEntry({ status: 'island', lives: 0 }) };
    expect(validatePick(input)).toEqual({ ok: true });
  });

  describe('matchday_locked', () => {
    it('rejects when now is exactly lockAt', () => {
      const input = { ...baseInput(), now: AT_LOCK };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });

    it('rejects when now is after lockAt', () => {
      const input = { ...baseInput(), now: AFTER_LOCK };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });

    it('rejects a locked matchday even before lockAt', () => {
      const input = { ...baseInput(), matchday: buildMatchday({ status: 'locked' }) };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });

    it('rejects a resolved matchday', () => {
      const input = { ...baseInput(), matchday: buildMatchday({ status: 'resolved' }) };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });

    it('compares instants, not strings: an offset timestamp before lock is accepted', () => {
      // 20:00+03:00 is 17:00Z — before an 18:45Z lock despite sorting after it as a string.
      const input = { ...baseInput(), now: '2026-08-21T20:00:00+03:00' };
      expect(validatePick(input)).toEqual({ ok: true });
    });

    it('wins over every other rejection', () => {
      const input = {
        ...baseInput(),
        now: AFTER_LOCK,
        entry: buildEntry({ status: 'island', lives: 0, usedTeams: ['team-home'] }),
        settings: buildSettings({ islandEnabled: false }),
        teamId: 'team-unknown',
      };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });
  });

  describe('on_island', () => {
    it('rejects an island entry when the island is disabled', () => {
      const input = {
        ...baseInput(),
        entry: buildEntry({ status: 'island', lives: 0 }),
        settings: buildSettings({ islandEnabled: false }),
      };
      expect(validatePick(input)).toEqual({ ok: false, code: 'on_island' });
    });

    it('wins over team rejections', () => {
      const input = {
        ...baseInput(),
        entry: buildEntry({ status: 'island', lives: 0, usedTeams: ['team-home'] }),
        settings: buildSettings({ islandEnabled: false }),
        teamId: 'team-unknown',
      };
      expect(validatePick(input)).toEqual({ ok: false, code: 'on_island' });
    });
  });

  describe('team_not_playing', () => {
    it('rejects a team with no match this matchday', () => {
      const input = { ...baseInput(), teamId: 'team-elsewhere' };
      expect(validatePick(input)).toEqual({ ok: false, code: 'team_not_playing' });
    });

    it('ignores matches that belong to another matchday', () => {
      const input = { ...baseInput(), matches: [buildMatch({ matchdayId: 'md-2' })] };
      expect(validatePick(input)).toEqual({ ok: false, code: 'team_not_playing' });
    });

    it('wins over team_already_used', () => {
      const input = {
        ...baseInput(),
        entry: buildEntry({ usedTeams: ['team-elsewhere'] }),
        teamId: 'team-elsewhere',
      };
      expect(validatePick(input)).toEqual({ ok: false, code: 'team_not_playing' });
    });
  });

  describe('validation_failed', () => {
    it('rejects a malformed now instead of throwing', () => {
      const input = { ...baseInput(), now: 'not-a-timestamp' };
      expect(validatePick(input)).toEqual({ ok: false, code: 'validation_failed' });
    });

    it('rejects a malformed lockAt instead of throwing', () => {
      const input = { ...baseInput(), matchday: buildMatchday({ lockAt: 'garbage' }) };
      expect(validatePick(input)).toEqual({ ok: false, code: 'validation_failed' });
    });

    it('loses to a non-open matchday status, which needs no timestamps', () => {
      const input = {
        ...baseInput(),
        matchday: buildMatchday({ status: 'locked' }),
        now: 'not-a-timestamp',
      };
      expect(validatePick(input)).toEqual({ ok: false, code: 'matchday_locked' });
    });
  });

  describe('team_already_used', () => {
    it('rejects repeating a team the entry already consumed', () => {
      const input = { ...baseInput(), entry: buildEntry({ usedTeams: ['team-home'] }) };
      expect(validatePick(input)).toEqual({ ok: false, code: 'team_already_used' });
    });
  });

  it('does not mutate its input', () => {
    const input = deepFreeze(baseInput());
    expect(validatePick(input)).toEqual({ ok: true });
  });
});
