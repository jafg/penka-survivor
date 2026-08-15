import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { IdSchema } from './domain';
import { matchId, matchdayId } from './ids';

describe('matchdayId', () => {
  it('derives the id from the league and the number, so it is never generated', () => {
    expect(matchdayId('copa-libertadores', 1)).toBe('copa-libertadores:md1');
  });

  it('is stable: the same league and number always name the same document', () => {
    // Materialization leans on this — the second penka on a league re-derives the
    // ids of the first and upserts over them instead of duplicating the calendar.
    expect(matchdayId('premier-league', 3)).toBe(matchdayId('premier-league', 3));
  });

  it('keeps different matchdays and different leagues apart', () => {
    expect(matchdayId('copa-libertadores', 1)).not.toBe(matchdayId('copa-libertadores', 2));
    expect(matchdayId('copa-libertadores', 1)).not.toBe(matchdayId('premier-league', 1));
  });
});

describe('matchId', () => {
  it('nests the match under its matchday, home team first', () => {
    expect(matchId('copa-libertadores:md1', 'RIV', 'BOC')).toBe('copa-libertadores:md1:RIV-BOC');
  });

  it('composes with matchdayId, which is how every caller builds one', () => {
    expect(matchId(matchdayId('copa-libertadores', 1), 'RIV', 'BOC')).toBe(
      'copa-libertadores:md1:RIV-BOC',
    );
  });

  it('is not symmetric — the fixture says who plays at home', () => {
    expect(matchId('copa-libertadores:md1', 'RIV', 'BOC')).not.toBe(
      matchId('copa-libertadores:md1', 'BOC', 'RIV'),
    );
  });
});

describe('the derived ids as a cross-app contract', () => {
  it('produces ids the contract accepts, colons and all', () => {
    // These ids travel in URLs and message bodies, so IdSchema must take them:
    // a colon is not a special character to a schema, only to a router.
    expect(Value.Check(IdSchema, matchdayId('copa-libertadores', 1))).toBe(true);
    expect(Value.Check(IdSchema, matchId(matchdayId('copa-libertadores', 1), 'RIV', 'BOC'))).toBe(
      true,
    );
  });
});
