import { describe, expect, it } from 'vitest';
import * as fixtures from '../test-support/fixtures';
import { validateMyPick, type MyPickContext } from './pick';

const BEFORE = new Date('2026-08-21T19:00:00.000Z');
const AFTER = new Date('2026-08-21T21:00:00.000Z');

function context(overrides: Partial<MyPickContext> = {}): MyPickContext {
  return {
    myEntry: fixtures.myEntry(),
    settings: { lives: 2, islandEnabled: true },
    matchday: fixtures.matchday(),
    matches: fixtures.matches(),
    now: BEFORE,
    ...overrides,
  };
}

describe('validateMyPick', () => {
  it('accepts an unused team that is playing, before the lock', () => {
    expect(validateMyPick(context(), 'RIV')).toEqual({ ok: true });
  });

  it('rejects a team the player already spent', () => {
    const input = context({ myEntry: fixtures.myEntry({ usedTeams: ['RIV'] }) });

    expect(validateMyPick(input, 'RIV')).toEqual({ ok: false, code: 'team_already_used' });
  });

  it('rejects a team that is not in this matchday', () => {
    expect(validateMyPick(context(), 'PEN')).toEqual({ ok: false, code: 'team_not_playing' });
  });

  it('rejects everything once the clock passes the lock', () => {
    expect(validateMyPick(context({ now: AFTER }), 'RIV')).toEqual({
      ok: false,
      code: 'matchday_locked',
    });
  });

  it('rejects everything once an operator locked the matchday', () => {
    const input = context({ matchday: fixtures.matchday({ status: 'locked' }) });

    expect(validateMyPick(input, 'RIV')).toEqual({ ok: false, code: 'matchday_locked' });
  });

  it('lets an island player keep picking while the penka has the island on', () => {
    // The engine's rule, and the API's: island players earn a point per hit.
    // The prototype's mock disabled their buttons — it predates the island
    // setting, and the real rule wins.
    const input = context({ myEntry: fixtures.myEntry({ lives: 0, status: 'island' }) });

    expect(validateMyPick(input, 'RIV')).toEqual({ ok: true });
  });

  it('stops an island player when the penka has the island off', () => {
    const input = context({
      myEntry: fixtures.myEntry({ lives: 0, status: 'island' }),
      settings: { lives: 2, islandEnabled: false },
    });

    expect(validateMyPick(input, 'RIV')).toEqual({ ok: false, code: 'on_island' });
  });

  it('never throws on an unreadable timestamp', () => {
    const input = context({ matchday: fixtures.matchday({ lockAt: 'mañana' }) });

    expect(validateMyPick(input, 'RIV')).toEqual({ ok: false, code: 'validation_failed' });
  });
});
