import { describe, expect, it } from 'vitest';
import { buildRoundRobin } from './schedule';

describe('buildRoundRobin', () => {
  const codes = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('pairs every team exactly once per round', () => {
    for (const round of buildRoundRobin(codes, 3)) {
      const played = round.flatMap((matchup) => [matchup.homeTeamCode, matchup.awayTeamCode]);
      expect([...played].sort()).toEqual([...codes].sort());
    }
  });

  it('builds the number of rounds it is asked for', () => {
    expect(buildRoundRobin(codes, 3)).toHaveLength(3);
    expect(buildRoundRobin(codes, 1)).toHaveLength(1);
  });

  it('never repeats a pairing across rounds', () => {
    const pairings = buildRoundRobin(codes, 5).flatMap((round) =>
      round.map(({ homeTeamCode, awayTeamCode }) => [homeTeamCode, awayTeamCode].sort().join('-')),
    );
    expect(new Set(pairings).size).toBe(pairings.length);
  });

  it('alternates home and away so no team is always the home side', () => {
    const rounds = buildRoundRobin(codes, 2);
    const [first, second] = rounds;
    expect(first?.[0]?.homeTeamCode).toBe('A');
    expect(second?.[0]?.awayTeamCode).toBe('A');
  });

  it('refuses a team list it cannot pair', () => {
    expect(() => buildRoundRobin(['A', 'B', 'C'], 3)).toThrow(/even number of teams/);
    expect(() => buildRoundRobin([], 3)).toThrow(/even number of teams/);
  });

  it('refuses more rounds than the teams can play without a rematch', () => {
    expect(() => buildRoundRobin(['A', 'B'], 2)).toThrow(/rematch/);
  });
});
