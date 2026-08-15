import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import { MatchSchema, MatchdaySchema, PenkaSchema } from '@penka/contracts';
import { toMatch, toMatchday, toPenka, type MatchDoc, type MatchdayDoc } from './store';

const matchdayDoc: MatchdayDoc = {
  _id: 'copa-libertadores:md1',
  leagueId: 'copa-libertadores',
  number: 1,
  status: 'locked',
  lockAt: new Date('2026-08-21T18:45:00.000Z'),
};

const matchDoc: MatchDoc = {
  _id: 'copa-libertadores:md1:RIV-BOC',
  matchdayId: 'copa-libertadores:md1',
  leagueId: 'copa-libertadores',
  homeTeamCode: 'RIV',
  awayTeamCode: 'BOC',
  kickoffAt: new Date('2026-08-21T18:45:00.000Z'),
  outcome: null,
};

describe('toMatchday', () => {
  it('produces a matchday the contract accepts', () => {
    const matchday = toMatchday(matchdayDoc);

    expect(matchday).toEqual({
      id: 'copa-libertadores:md1',
      leagueId: 'copa-libertadores',
      number: 1,
      status: 'locked',
      lockAt: '2026-08-21T18:45:00.000Z',
    });
    expect(Value.Check(MatchdaySchema, matchday)).toBe(true);
  });

  it('never leaks the internal resolve-requested marker to a client', () => {
    // `resolveRequestedAt` is this app's own bookkeeping — a matchday has three
    // states in the contract, and "someone pressed resolve" is not one of them.
    const requested = toMatchday({ ...matchdayDoc, resolveRequestedAt: new Date() });

    expect(requested).not.toHaveProperty('resolveRequestedAt');
    expect(Value.Check(MatchdaySchema, requested)).toBe(true);
  });
});

describe('toMatch', () => {
  it('produces a match the contract accepts, result and all', () => {
    expect(Value.Check(MatchSchema, toMatch(matchDoc))).toBe(true);
    expect(toMatch(matchDoc).outcome).toBeNull();
    expect(toMatch({ ...matchDoc, outcome: 'home' }).outcome).toBe('home');
  });
});

describe('toPenka', () => {
  it('produces a penka the contract accepts', () => {
    const id = new ObjectId();
    const penka = toPenka({
      _id: id,
      name: 'Oficina BA',
      leagueId: 'copa-libertadores',
      joinCode: '4821',
      settings: { lives: 2, islandEnabled: true },
      createdBy: new ObjectId().toHexString(),
      createdAt: new Date('2026-08-02T12:00:00.000Z'),
    });

    expect(penka.id).toBe(id.toHexString());
    expect(Value.Check(PenkaSchema, penka)).toBe(true);
  });
});
