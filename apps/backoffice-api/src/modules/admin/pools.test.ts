import { describe, expect, it } from 'vitest';
import type { Entry, Matchday, Penka } from '@penka/contracts';
import { currentMatchdayIds, summarizePools } from './pools';

function penka(id: string, leagueId = 'copa-libertadores'): Penka {
  return {
    id,
    leagueId,
    name: `Penka ${id}`,
    joinCode: '1234',
    settings: { lives: 1, islandEnabled: true },
    createdAt: '2026-08-01T12:00:00.000Z',
  };
}

function entry(id: string, penkaId: string, status: Entry['status'] = 'alive'): Entry {
  return { id, penkaId, userId: `u-${id}`, lives: 1, status, usedTeams: [], points: 0 };
}

function matchday(leagueId: string, number: number, status: Matchday['status'] = 'open'): Matchday {
  return {
    id: `${leagueId}:md${number}`,
    leagueId,
    number,
    status,
    lockAt: '2026-08-21T18:45:00.000Z',
  };
}

describe('summarizePools', () => {
  it('counts entries by status', () => {
    const pools = summarizePools({
      penkas: [penka('p1')],
      entries: [
        entry('e1', 'p1'),
        entry('e2', 'p1', 'island'),
        entry('e3', 'p1'),
        entry('e4', 'p2'),
      ],
      matchdays: [matchday('copa-libertadores', 1)],
      picks: [],
    });

    expect(pools).toEqual([
      {
        penka: penka('p1'),
        entryCount: 3,
        aliveCount: 2,
        islandCount: 1,
        picksReceived: 0,
        resolvedMatchdays: 0,
      },
    ]);
  });

  it('counts the picks in for the current matchday only', () => {
    // "Are the players ready?" is a question about the matchday being played
    // now; picks from a matchday already resolved say nothing about it.
    const pools = summarizePools({
      penkas: [penka('p1')],
      entries: [entry('e1', 'p1'), entry('e2', 'p1')],
      matchdays: [
        matchday('copa-libertadores', 1, 'resolved'),
        matchday('copa-libertadores', 2, 'open'),
      ],
      picks: [
        { entryId: 'e1', matchdayId: 'copa-libertadores:md1' },
        { entryId: 'e2', matchdayId: 'copa-libertadores:md1' },
        { entryId: 'e1', matchdayId: 'copa-libertadores:md2' },
      ],
    });

    expect(pools[0]).toMatchObject({ picksReceived: 1, resolvedMatchdays: 1 });
  });

  it('never counts a pick from another penka on the same league', () => {
    // Two penkas on one league share the calendar, so their picks share a
    // matchday id: only the entry tells them apart.
    const pools = summarizePools({
      penkas: [penka('p1'), penka('p2')],
      entries: [entry('e1', 'p1'), entry('e2', 'p2')],
      matchdays: [matchday('copa-libertadores', 1)],
      picks: [
        { entryId: 'e1', matchdayId: 'copa-libertadores:md1' },
        { entryId: 'e2', matchdayId: 'copa-libertadores:md1' },
      ],
    });

    expect(pools.map((pool) => pool.picksReceived)).toEqual([1, 1]);
  });

  it('reads each penka against the calendar of its own league', () => {
    const pools = summarizePools({
      penkas: [penka('p1'), penka('p2', 'la-liga')],
      entries: [entry('e1', 'p1'), entry('e2', 'p2')],
      matchdays: [
        matchday('copa-libertadores', 1, 'resolved'),
        matchday('copa-libertadores', 2),
        matchday('la-liga', 1),
      ],
      picks: [{ entryId: 'e2', matchdayId: 'la-liga:md1' }],
    });

    expect(pools[0]).toMatchObject({ resolvedMatchdays: 1, picksReceived: 0 });
    expect(pools[1]).toMatchObject({ resolvedMatchdays: 0, picksReceived: 1 });
  });

  it('reports a penka whose league has no calendar yet', () => {
    // A penka can exist before anything is materialized; the operator listing
    // must still show it rather than fail on the whole page.
    const pools = summarizePools({
      penkas: [penka('p1')],
      entries: [entry('e1', 'p1')],
      matchdays: [],
      picks: [],
    });

    expect(pools).toEqual([
      {
        penka: penka('p1'),
        entryCount: 1,
        aliveCount: 1,
        islandCount: 0,
        picksReceived: 0,
        resolvedMatchdays: 0,
      },
    ]);
  });

  it('keeps the order it was given', () => {
    const pools = summarizePools({
      penkas: [penka('p3'), penka('p1'), penka('p2')],
      entries: [],
      matchdays: [],
      picks: [],
    });

    expect(pools.map((pool) => pool.penka.id)).toEqual(['p3', 'p1', 'p2']);
  });
});

describe('currentMatchdayIds', () => {
  it('names one matchday per league — the one being played', () => {
    // What the route queries picks for. Fetching every matchday's picks would
    // grow with the season for a listing that only ever shows the current one.
    expect(
      currentMatchdayIds([
        matchday('copa-libertadores', 1, 'resolved'),
        matchday('copa-libertadores', 2),
        matchday('la-liga', 1),
      ]),
    ).toEqual(['copa-libertadores:md2', 'la-liga:md1']);
  });

  it('is empty when nothing has been materialized', () => {
    expect(currentMatchdayIds([])).toEqual([]);
  });
});
