import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import { MatchSchema, MatchdaySchema, PlayerPickSchema } from '@penka/contracts';
import type { MatchDoc, MatchdayDoc } from '../penkas/store';
import { selectCurrentMatchday, toMatch, toMatchday, toPlayerPick, type PickDoc } from './store';

function matchdayDoc(number: number, status: MatchdayDoc['status'] = 'open'): MatchdayDoc {
  return {
    _id: `copa-libertadores:md${number}`,
    leagueId: 'copa-libertadores',
    number,
    status,
    lockAt: new Date('2026-08-21T18:45:00.000Z'),
  };
}

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
  it('passes the derived string id through and renders dates as ISO-8601', () => {
    const matchday = toMatchday(matchdayDoc(1));

    expect(matchday).toEqual({
      id: 'copa-libertadores:md1',
      leagueId: 'copa-libertadores',
      number: 1,
      status: 'open',
      lockAt: '2026-08-21T18:45:00.000Z',
    });
    expect(Value.Check(MatchdaySchema, matchday)).toBe(true);
  });
});

describe('toMatch', () => {
  it('maps to the contract and drops the league the document carries', () => {
    const match = toMatch(matchDoc);

    expect(match).toEqual({
      id: 'copa-libertadores:md1:RIV-BOC',
      matchdayId: 'copa-libertadores:md1',
      homeTeamCode: 'RIV',
      awayTeamCode: 'BOC',
      kickoffAt: '2026-08-21T18:45:00.000Z',
      outcome: null,
    });
    expect(Value.Check(MatchSchema, match)).toBe(true);
  });

  it('keeps a played result', () => {
    expect(toMatch({ ...matchDoc, outcome: 'home' }).outcome).toBe('home');
  });
});

describe('toPlayerPick', () => {
  it('renders the generated id as hex and the timestamp as ISO-8601', () => {
    const _id = new ObjectId();
    const doc: PickDoc = {
      entryId: '6a80b60ffda322125df55e5f',
      matchdayId: 'copa-libertadores:md1',
      teamCode: 'RIV',
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
    };

    const pick = toPlayerPick({ _id, ...doc });

    expect(pick).toEqual({
      id: _id.toHexString(),
      entryId: '6a80b60ffda322125df55e5f',
      matchdayId: 'copa-libertadores:md1',
      teamCode: 'RIV',
      createdAt: '2026-08-20T10:00:00.000Z',
    });
    expect(Value.Check(PlayerPickSchema, pick)).toBe(true);
  });
});

describe('selectCurrentMatchday', () => {
  it('is the lowest-numbered matchday nobody has resolved yet', () => {
    const matchdays = [matchdayDoc(3), matchdayDoc(1, 'resolved'), matchdayDoc(2, 'locked')];

    expect(selectCurrentMatchday(matchdays)?.number).toBe(2);
  });

  it('does not depend on the order the database hands them back', () => {
    const ascending = [matchdayDoc(1), matchdayDoc(2), matchdayDoc(3)];

    expect(selectCurrentMatchday(ascending)?.number).toBe(1);
    expect(selectCurrentMatchday([...ascending].reverse())?.number).toBe(1);
  });

  it('stays on the last matchday once the whole calendar is resolved', () => {
    const played = [matchdayDoc(2, 'resolved'), matchdayDoc(3, 'resolved'), matchdayDoc(1, 'resolved')];

    expect(selectCurrentMatchday(played)?.number).toBe(3);
  });

  it('has no answer for a league whose calendar was never materialized', () => {
    expect(selectCurrentMatchday([])).toBeUndefined();
  });
});
