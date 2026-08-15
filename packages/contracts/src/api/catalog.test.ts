import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { LeagueDetailResponseSchema, LeagueParamsSchema, ListLeaguesResponseSchema } from './catalog';
import * as fx from '../test-support/fixtures';

describe('catalog schemas', () => {
  it('accepts valid params and responses', () => {
    expect(Value.Check(LeagueParamsSchema, { leagueId: fx.league.id })).toBe(true);
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: [fx.league] })).toBe(true);
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: [] })).toBe(true);
    expect(
      Value.Check(LeagueDetailResponseSchema, { league: fx.league, teams: [fx.team] }),
    ).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(Value.Check(LeagueParamsSchema, {})).toBe(false);
    expect(Value.Check(LeagueDetailResponseSchema, { league: fx.league })).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(ListLeaguesResponseSchema, { leagues: fx.league })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(LeagueParamsSchema, { leagueId: fx.league.id, expand: 'teams' })).toBe(
      false,
    );
  });
});
