import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  FixtureTemplateSchema,
  LeagueSchema,
  LeagueSummarySchema,
  TeamSchema,
} from '@penka/contracts';
import { CATALOG, LOCK_OFFSET_MINUTES, findLeague, listLeagues } from './catalog';

/**
 * The catalog the demo ships with. Pinned here so a change to the hardcoded
 * data is a deliberate edit of this table, not a silent drift.
 */
const EXPECTED_LEAGUES = [
  { id: 'copa-america', region: 'america', teamCount: 12 },
  { id: 'copa-libertadores', region: 'america', teamCount: 8 },
  { id: 'champions-league', region: 'europe', teamCount: 8 },
  { id: 'premier-league', region: 'europe', teamCount: 8 },
  { id: 'la-liga', region: 'europe', teamCount: 8 },
  { id: 'fifa-world-cup', region: 'world', teamCount: 16 },
];

describe('catalog', () => {
  it('ships the leagues the demo advertises', () => {
    expect(
      CATALOG.map((entry) => ({
        id: entry.league.id,
        region: entry.league.region,
        teamCount: entry.teams.length,
      })),
    ).toEqual(EXPECTED_LEAGUES);
  });

  it('has unique league ids', () => {
    const ids = CATALOG.map((entry) => entry.league.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('locks matchday 1 at +2h, matchday 2 at +26h and matchday 3 at +50h', () => {
    expect(LOCK_OFFSET_MINUTES).toEqual([120, 1560, 3000]);
  });
});

// Data-integrity sweep: every league in the catalog, every rule, on every edit.
for (const { league, teams, fixtureTemplate } of CATALOG) {
  describe(`catalog data: ${league.id}`, () => {
    const teamCodes = teams.map((team) => team.code);

    it('matches the League contract', () => {
      expect(Value.Check(LeagueSchema, league)).toBe(true);
    });

    it('has teams that match the Team contract', () => {
      for (const team of teams) {
        expect(Value.Check(TeamSchema, team), `${team.code} is not a valid Team`).toBe(true);
      }
    });

    it('has unique, non-empty team codes', () => {
      expect(new Set(teamCodes).size).toBe(teamCodes.length);
      for (const code of teamCodes) {
        expect(code.trim()).toBe(code);
        expect(code.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('has an even number of teams so every matchday can pair them all', () => {
      expect(teams.length % 2).toBe(0);
      expect(teams.length).toBeGreaterThanOrEqual(2);
    });

    it('matches the FixtureTemplate contract and points at its own league', () => {
      expect(Value.Check(FixtureTemplateSchema, fixtureTemplate)).toBe(true);
      expect(fixtureTemplate.leagueId).toBe(league.id);
    });

    it('schedules three matchdays with the relative lock offsets', () => {
      expect(fixtureTemplate.matchdays.map((matchday) => matchday.number)).toEqual([1, 2, 3]);
      expect(fixtureTemplate.matchdays.map((matchday) => matchday.lockAtOffsetMinutes)).toEqual([
        ...LOCK_OFFSET_MINUTES,
      ]);
    });

    it('pairs every team exactly once per matchday', () => {
      for (const matchday of fixtureTemplate.matchdays) {
        const played = matchday.matchups.flatMap((matchup) => [
          matchup.homeTeamCode,
          matchup.awayTeamCode,
        ]);
        expect(
          [...played].sort(),
          `matchday ${matchday.number} does not pair every team exactly once`,
        ).toEqual([...teamCodes].sort());
      }
    });

    it('only references team codes that exist in the league', () => {
      const known = new Set(teamCodes);
      for (const matchday of fixtureTemplate.matchdays) {
        for (const { homeTeamCode, awayTeamCode } of matchday.matchups) {
          expect(known.has(homeTeamCode), `unknown home team ${homeTeamCode}`).toBe(true);
          expect(known.has(awayTeamCode), `unknown away team ${awayTeamCode}`).toBe(true);
          expect(homeTeamCode).not.toBe(awayTeamCode);
        }
      }
    });

    it('never repeats a pairing across matchdays', () => {
      const pairings = fixtureTemplate.matchdays.flatMap((matchday) =>
        matchday.matchups.map(({ homeTeamCode, awayTeamCode }) =>
          [homeTeamCode, awayTeamCode].sort().join('-'),
        ),
      );
      expect(new Set(pairings).size).toBe(pairings.length);
    });
  });
}

describe('listLeagues', () => {
  it('summarizes every league, team count included', () => {
    const summaries = listLeagues();
    expect(summaries).toHaveLength(CATALOG.length);
    for (const summary of summaries) {
      expect(Value.Check(LeagueSummarySchema, summary)).toBe(true);
      const entry = findLeague(summary.id);
      expect(summary.teamCount).toBe(entry?.teams.length);
      expect(summary.name).toBe(entry?.league.name);
    }
  });

  it('filters by region', () => {
    expect(listLeagues('america').map((summary) => summary.id)).toEqual([
      'copa-america',
      'copa-libertadores',
    ]);
    expect(listLeagues('europe').map((summary) => summary.id)).toEqual([
      'champions-league',
      'premier-league',
      'la-liga',
    ]);
    expect(listLeagues('world').map((summary) => summary.id)).toEqual(['fifa-world-cup']);
  });
});

describe('findLeague', () => {
  it('finds a league by id', () => {
    expect(findLeague('la-liga')?.league.name).toBe('LaLiga');
  });

  it('returns undefined for an unknown id', () => {
    expect(findLeague('serie-a')).toBeUndefined();
    expect(findLeague('')).toBeUndefined();
  });
});
