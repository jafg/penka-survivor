import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  LeagueDetailResponseSchema,
  LeagueParamsSchema,
  LeagueSummarySchema,
  ListLeaguesQuerySchema,
  ListLeaguesResponseSchema,
} from './catalog';
import * as fx from '../test-support/fixtures';

const detail = {
  league: fx.league,
  teams: [fx.team],
  fixtureTemplate: fx.fixtureTemplate,
};

describe('catalog schemas', () => {
  it('accepts valid params and responses', () => {
    expect(Value.Check(LeagueParamsSchema, { leagueId: fx.league.id })).toBe(true);
    expect(Value.Check(LeagueSummarySchema, fx.leagueSummary)).toBe(true);
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: [fx.leagueSummary] })).toBe(true);
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: [] })).toBe(true);
    expect(Value.Check(LeagueDetailResponseSchema, detail)).toBe(true);
  });

  it('summarizes a league without loading its teams', () => {
    expect(Object.keys(LeagueSummarySchema.properties).sort()).toEqual([
      'id',
      'name',
      'region',
      'teamCount',
    ]);
  });

  it('treats the region filter as optional', () => {
    expect(Value.Check(ListLeaguesQuerySchema, {})).toBe(true);
    for (const region of ['america', 'europe', 'world']) {
      expect(Value.Check(ListLeaguesQuerySchema, { region })).toBe(true);
    }
  });

  it('rejects an unknown region filter', () => {
    expect(Value.Check(ListLeaguesQuerySchema, { region: 'antarctica' })).toBe(false);
    expect(Value.Check(ListLeaguesQuerySchema, { region: '' })).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(Value.Check(LeagueParamsSchema, {})).toBe(false);
    expect(Value.Check(LeagueDetailResponseSchema, fx.omit(detail, 'teams'))).toBe(false);
    expect(Value.Check(LeagueDetailResponseSchema, fx.omit(detail, 'fixtureTemplate'))).toBe(false);
    expect(Value.Check(LeagueSummarySchema, fx.omit(fx.leagueSummary, 'teamCount'))).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: fx.leagueSummary })).toBe(false);
    expect(Value.Check(LeagueSummarySchema, { ...fx.leagueSummary, teamCount: '8' })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(LeagueParamsSchema, { leagueId: fx.league.id, expand: 'teams' })).toBe(
      false,
    );
    expect(Value.Check(ListLeaguesQuerySchema, { region: 'europe', page: 2 })).toBe(false);
    expect(Value.Check(LeagueDetailResponseSchema, { ...detail, sponsor: 'Penka' })).toBe(false);
  });
});
