import { describe, expect, it } from 'vitest';
import { computeStandings, rankWinners } from './standings';
import { buildEntry, deepFreeze } from './test-support/build';

describe('computeStandings', () => {
  it('splits entries into alive and island groups', () => {
    const entries = [
      buildEntry({ id: 'a', status: 'alive' }),
      buildEntry({ id: 'b', status: 'island', lives: 0 }),
    ];
    const { alive, island } = computeStandings(entries);
    expect(alive.map((entry) => entry.id)).toEqual(['a']);
    expect(island.map((entry) => entry.id)).toEqual(['b']);
  });

  it('sorts alive by lives desc, then points desc, then id asc', () => {
    const entries = [
      buildEntry({ id: 'c', lives: 1, points: 5 }),
      buildEntry({ id: 'b', lives: 2, points: 1 }),
      buildEntry({ id: 'a', lives: 2, points: 3 }),
      buildEntry({ id: 'd', lives: 2, points: 3 }),
    ];
    const { alive } = computeStandings(entries);
    expect(alive.map((entry) => entry.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sorts island by points desc, then id asc', () => {
    const entries = [
      buildEntry({ id: 'z', status: 'island', lives: 0, points: 2 }),
      buildEntry({ id: 'y', status: 'island', lives: 0, points: 4 }),
      buildEntry({ id: 'x', status: 'island', lives: 0, points: 2 }),
    ];
    const { island } = computeStandings(entries);
    expect(island.map((entry) => entry.id)).toEqual(['y', 'x', 'z']);
  });

  it('conserves entries: alive + island always sum to the input', () => {
    const entries = [
      buildEntry({ id: 'a' }),
      buildEntry({ id: 'b', status: 'island', lives: 0 }),
      buildEntry({ id: 'c' }),
    ];
    const { alive, island } = computeStandings(entries);
    expect(alive.length + island.length).toBe(entries.length);
  });

  it('keeps input order for fully tied duplicate ids (consistent comparator)', () => {
    // Data-bug edge case: two entries sharing an id must not scramble the sort —
    // the comparator returns 0 on equal keys, so the stable sort preserves order.
    const entries = [
      buildEntry({ id: 'dup', userId: 'user-first', lives: 2, points: 3 }),
      buildEntry({ id: 'dup', userId: 'user-second', lives: 2, points: 3 }),
    ];
    const { alive } = computeStandings(entries);
    expect(alive.map((entry) => entry.userId)).toEqual(['user-first', 'user-second']);
  });

  it('does not mutate the input array or its entries', () => {
    const entries = deepFreeze([
      buildEntry({ id: 'b', lives: 1 }),
      buildEntry({ id: 'a', lives: 3 }),
    ]);
    computeStandings(entries);
    expect(entries.map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

describe('rankWinners', () => {
  it('ranks by most lives first', () => {
    const entries = [
      buildEntry({ id: 'few', lives: 1, points: 9 }),
      buildEntry({ id: 'many', lives: 3, points: 0 }),
    ];
    expect(rankWinners(entries).map((entry) => entry.id)).toEqual(['many', 'few']);
  });

  it('breaks a lives tie by correct-pick count (points)', () => {
    const entries = [
      buildEntry({ id: 'fewer-picks', lives: 2, points: 3 }),
      buildEntry({ id: 'more-picks', lives: 2, points: 7 }),
    ];
    expect(rankWinners(entries).map((entry) => entry.id)).toEqual(['more-picks', 'fewer-picks']);
  });

  it('resolves a full tie deterministically by id', () => {
    const entries = [
      buildEntry({ id: 'b', lives: 2, points: 3 }),
      buildEntry({ id: 'a', lives: 2, points: 3 }),
    ];
    expect(rankWinners(entries).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('ranks every alive entry above every island entry', () => {
    const entries = [
      buildEntry({ id: 'isla', status: 'island', lives: 0, points: 99 }),
      buildEntry({ id: 'alive', lives: 1, points: 0 }),
    ];
    expect(rankWinners(entries).map((entry) => entry.id)).toEqual(['alive', 'isla']);
  });
});
