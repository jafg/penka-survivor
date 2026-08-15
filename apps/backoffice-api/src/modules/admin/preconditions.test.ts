import { describe, expect, it } from 'vitest';
import type { Match, Matchday } from '@penka/contracts';
import { countPending, whyNotResolvable } from './preconditions';

const matchday: Matchday = {
  id: 'copa-libertadores:md1',
  leagueId: 'copa-libertadores',
  number: 1,
  status: 'locked',
  lockAt: '2026-08-21T18:45:00.000Z',
};

function match(id: string, outcome: Match['outcome'] = 'home'): Match {
  return {
    id: `copa-libertadores:md1:${id}`,
    matchdayId: 'copa-libertadores:md1',
    homeTeamCode: 'RIV',
    awayTeamCode: 'BOC',
    kickoffAt: '2026-08-21T18:45:00.000Z',
    outcome,
  };
}

describe('whyNotResolvable', () => {
  it('accepts a locked matchday whose results are all in', () => {
    expect(whyNotResolvable(matchday, [match('RIV-BOC'), match('IND-PEN', 'draw')])).toBeNull();
  });

  it('refuses a matchday that is still open for picks', () => {
    // Lock is a precondition of resolution in the engine, so the API says so at
    // its boundary instead of publishing work the workers would reject.
    expect(whyNotResolvable({ ...matchday, status: 'open' }, [match('RIV-BOC')])).toBe(
      'matchday_not_locked',
    );
  });

  it('refuses a matchday that was already resolved', () => {
    expect(whyNotResolvable({ ...matchday, status: 'resolved' }, [match('RIV-BOC')])).toBe(
      'already_resolved',
    );
  });

  it('refuses while any match still has no result', () => {
    expect(whyNotResolvable(matchday, [match('RIV-BOC'), match('IND-PEN', null)])).toBe(
      'results_missing',
    );
  });

  it('checks lock before results, so an open matchday is never called incomplete', () => {
    // Both are wrong here; the operator's next step is to close the matchday,
    // and telling them "results missing" would send them the other way.
    expect(whyNotResolvable({ ...matchday, status: 'open' }, [match('RIV-BOC', null)])).toBe(
      'matchday_not_locked',
    );
  });

  it('has no opinion about a matchday with no fixtures', () => {
    // The engine accepts it (nothing is missing), and a matchday with no matches
    // is a half-materialized calendar, not a game situation. The route catches
    // that before it ever gets here — see loadMatches in routes.ts.
    expect(whyNotResolvable(matchday, [])).toBeNull();
  });

  it('ignores matches belonging to another matchday', () => {
    const otherMatchday = { ...match('RIV-BOC', null), matchdayId: 'copa-libertadores:md2' };

    expect(whyNotResolvable(matchday, [match('IND-PEN'), otherMatchday])).toBeNull();
  });
});

describe('countPending', () => {
  it('counts the matches still waiting for a result', () => {
    expect(countPending([match('RIV-BOC'), match('IND-PEN', null), match('SAO-FLA', null)])).toBe(
      2,
    );
  });

  it('is zero once every result is in', () => {
    expect(countPending([match('RIV-BOC'), match('IND-PEN', 'away')])).toBe(0);
    expect(countPending([])).toBe(0);
  });
});
