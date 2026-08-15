import { describe, expect, it } from 'vitest';
import { CATALOG, LOCK_OFFSET_MINUTES, findLeague } from '../catalog/catalog';
import { buildLeagueCalendar, matchdayId } from './calendar';

const NOW = new Date('2026-08-15T12:00:00.000Z');

function libertadores() {
  const entry = findLeague('copa-libertadores');
  if (entry === undefined) {
    throw new Error('copa-libertadores missing from the catalog');
  }
  return entry;
}

describe('buildLeagueCalendar', () => {
  it('turns the template into three open matchdays', () => {
    const { matchdays } = buildLeagueCalendar(libertadores(), NOW);

    expect(matchdays.map((matchday) => matchday.number)).toEqual([1, 2, 3]);
    for (const matchday of matchdays) {
      expect(matchday.leagueId).toBe('copa-libertadores');
      expect(matchday.status).toBe('open');
    }
  });

  it('turns relative offsets into absolute lock times', () => {
    const { matchdays } = buildLeagueCalendar(libertadores(), NOW);

    expect(matchdays.map((matchday) => matchday.lockAt.toISOString())).toEqual([
      '2026-08-15T14:00:00.000Z', // +2h
      '2026-08-16T14:00:00.000Z', // +26h
      '2026-08-17T14:00:00.000Z', // +50h
    ]);
    matchdays.forEach((matchday, index) => {
      const offset = LOCK_OFFSET_MINUTES[index] ?? 0;
      expect(matchday.lockAt.getTime()).toBe(NOW.getTime() + offset * 60_000);
    });
  });

  it('materializes every matchup as a match that kicks off when picks lock', () => {
    const entry = libertadores();
    const { matchdays, matches } = buildLeagueCalendar(entry, NOW);

    expect(matches).toHaveLength(12); // 8 teams → 4 matchups × 3 matchdays
    for (const matchday of matchdays) {
      const ofMatchday = matches.filter((match) => match.matchdayId === matchday._id);
      expect(ofMatchday).toHaveLength(4);
      for (const match of ofMatchday) {
        expect(match.leagueId).toBe(entry.league.id);
        expect(match.kickoffAt).toEqual(matchday.lockAt);
        expect(match.outcome).toBeNull();
      }
    }
  });

  it('identifies teams by their catalog code', () => {
    const entry = libertadores();
    const codes = new Set(entry.teams.map((team) => team.code));
    const { matches } = buildLeagueCalendar(entry, NOW);

    for (const match of matches) {
      expect(codes.has(match.homeTeamCode)).toBe(true);
      expect(codes.has(match.awayTeamCode)).toBe(true);
    }
  });

  it('derives ids from the league, so the same calendar is the same documents', () => {
    const entry = libertadores();
    const early = buildLeagueCalendar(entry, NOW);
    const late = buildLeagueCalendar(entry, new Date(NOW.getTime() + 86_400_000));

    expect(early.matchdays.map((matchday) => matchday._id)).toEqual(
      late.matchdays.map((matchday) => matchday._id),
    );
    expect(early.matches.map((match) => match._id)).toEqual(late.matches.map((match) => match._id));
    // Same ids, different clock: whoever materializes first sets the dates.
    expect(early.matchdays[0]?.lockAt).not.toEqual(late.matchdays[0]?.lockAt);
  });

  it('names matchday documents after their league and number', () => {
    expect(matchdayId('la-liga', 2)).toBe('la-liga:md2');
  });

  it('builds a consistent calendar for every league in the catalog', () => {
    for (const entry of CATALOG) {
      const { matchdays, matches } = buildLeagueCalendar(entry, NOW);
      const ids = [...matchdays.map((m) => m._id), ...matches.map((m) => m._id)];

      expect(new Set(ids).size, `${entry.league.id} has duplicate document ids`).toBe(ids.length);
      expect(matches).toHaveLength((entry.teams.length / 2) * 3);
      for (const match of matches) {
        expect(match.homeTeamCode).not.toBe(match.awayTeamCode);
      }
    }
  });
});
