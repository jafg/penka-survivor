import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  BoardSchema,
  type Entry,
  type Matchday,
  type PlayerPick,
  type Resolution,
} from '@penka/contracts';
import { buildBoard, isMatchdayLocked } from './board';

const LOCK_AT = '2026-08-21T18:45:00.000Z';
const BEFORE_LOCK = new Date('2026-08-21T18:00:00.000Z');
const AFTER_LOCK = new Date('2026-08-21T19:30:00.000Z');

function buildMatchday(overrides: Partial<Matchday> = {}): Matchday {
  return {
    id: 'copa-libertadores:md1',
    leagueId: 'copa-libertadores',
    number: 1,
    status: 'open',
    lockAt: LOCK_AT,
    ...overrides,
  };
}

function buildEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-ana',
    penkaId: 'penka-1',
    userId: 'user-ana',
    lives: 2,
    status: 'alive',
    usedTeams: [],
    points: 3,
    ...overrides,
  };
}

function buildPick(overrides: Partial<PlayerPick> = {}): PlayerPick {
  return {
    id: 'pick-1',
    entryId: 'entry-ana',
    matchdayId: 'copa-libertadores:md1',
    teamCode: 'RIV',
    createdAt: '2026-08-21T10:00:00.000Z',
    ...overrides,
  };
}

function buildResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    id: 'resolution-1',
    penkaId: 'penka-1',
    matchdayId: 'copa-libertadores:md1',
    resolvedAt: '2026-08-21T21:00:00.000Z',
    eliminatedEntryIds: ['entry-luis'],
    islandEntryIds: ['entry-luis'],
    ...overrides,
  };
}

const ANA = buildEntry();
const LUIS = buildEntry({
  id: 'entry-luis',
  userId: 'user-luis',
  lives: 0,
  status: 'island',
  points: 1,
});

const NAMES = new Map([
  ['user-ana', 'Ana'],
  ['user-luis', 'Luis'],
]);

/** matchdayId → number, built by each caller from the calendar it already loaded. */
const MATCHDAY_NUMBERS = new Map([
  ['copa-libertadores:md1', 1],
  ['copa-libertadores:md2', 2],
  ['copa-libertadores:md3', 3],
]);

function build(overrides: Partial<Parameters<typeof buildBoard>[0]> = {}) {
  return buildBoard({
    matchday: buildMatchday(),
    entries: [ANA, LUIS],
    displayNames: NAMES,
    picks: [buildPick(), buildPick({ id: 'pick-2', entryId: 'entry-luis', teamCode: 'BOC' })],
    resolutions: [],
    matchdayNumbers: MATCHDAY_NUMBERS,
    now: BEFORE_LOCK,
    nextPollInSec: 10,
    ...overrides,
  });
}

describe('buildBoard', () => {
  it('produces a board the public contract accepts', () => {
    expect(Value.Check(BoardSchema, build())).toBe(true);
    expect(Value.Check(BoardSchema, build({ now: AFTER_LOCK }))).toBe(true);
  });

  it('hides every pick while the matchday is open, even from a caller that passed them in', () => {
    // The invariant BoardSchema documents: the schema cannot express the gate,
    // so this function is where it is enforced. Both players picked.
    const board = build();

    expect(board.isLocked).toBe(false);
    expect(board.alive.map((player) => player.pick)).toEqual([null]);
    expect(board.island.map((player) => player.pick)).toEqual([null]);
    expect(JSON.stringify(board)).not.toContain('RIV');
    expect(JSON.stringify(board)).not.toContain('BOC');
  });

  it('reveals the picks once the clock passes lockAt', () => {
    const board = build({ now: AFTER_LOCK });

    expect(board.isLocked).toBe(true);
    expect(board.alive.map((player) => player.pick)).toEqual(['RIV']);
    expect(board.island.map((player) => player.pick)).toEqual(['BOC']);
  });

  it('shows null after lock for a player who never picked', () => {
    const board = build({ now: AFTER_LOCK, picks: [buildPick()] });

    expect(board.alive.map((player) => player.pick)).toEqual(['RIV']);
    // Same null as before lock on the wire; clients read isLocked to tell them apart.
    expect(board.island.map((player) => player.pick)).toEqual([null]);
  });

  it('treats a matchday the operator already closed as locked, whatever the clock says', () => {
    const board = build({ matchday: buildMatchday({ status: 'locked' }), now: BEFORE_LOCK });

    expect(board.isLocked).toBe(true);
    expect(board.isResolved).toBe(false);
    expect(board.alive.map((player) => player.pick)).toEqual(['RIV']);
  });

  it('reports a resolved matchday as both locked and resolved', () => {
    const board = build({ matchday: buildMatchday({ status: 'resolved' }), now: BEFORE_LOCK });

    expect(board.isLocked).toBe(true);
    expect(board.isResolved).toBe(true);
  });

  it('carries only public fields per player — no ids, no used teams', () => {
    const board = build({ now: AFTER_LOCK });

    for (const player of [...board.alive, ...board.island]) {
      expect(Object.keys(player).sort()).toEqual(['displayName', 'lives', 'pick', 'points']);
    }
    expect(JSON.stringify(board)).not.toContain('entry-ana');
    expect(JSON.stringify(board)).not.toContain('user-ana');
    expect(JSON.stringify(board)).not.toContain('usedTeams');
  });

  it('splits alive from island and ranks them the way the engine does', () => {
    const strong = buildEntry({ id: 'entry-c', userId: 'user-c', lives: 3, points: 0 });
    const sameLives = buildEntry({ id: 'entry-b', userId: 'user-b', lives: 2, points: 9 });
    const board = buildBoard({
      matchday: buildMatchday(),
      entries: [ANA, LUIS, strong, sameLives],
      displayNames: new Map([...NAMES, ['user-b', 'Bea'], ['user-c', 'Caro']]),
      picks: [],
      resolutions: [],
      matchdayNumbers: MATCHDAY_NUMBERS,
      now: BEFORE_LOCK,
      nextPollInSec: 10,
    });

    // alive: lives desc, then points desc; island keeps its own points order.
    expect(board.alive.map((player) => player.displayName)).toEqual(['Caro', 'Bea', 'Ana']);
    expect(board.alive.map((player) => player.points)).toEqual([0, 9, 3]);
    expect(board.island.map((player) => player.displayName)).toEqual(['Luis']);
  });

  it('names a player whose user record vanished without leaking an id', () => {
    const board = build({ displayNames: new Map([['user-ana', 'Ana']]) });

    const island = board.island[0];
    expect(island?.displayName).not.toBe('');
    expect(island?.displayName).not.toContain('entry-luis');
    expect(island?.displayName).not.toContain('user-luis');
    expect(Value.Check(BoardSchema, board)).toBe(true);
  });

  it('carries the matchday header and the polling cadence it was given', () => {
    const board = build({ nextPollInSec: 2 });

    expect(board.matchday).toBe(1);
    expect(board.lockAt).toBe(LOCK_AT);
    expect(board.nextPollInSec).toBe(2);
  });

  it('reports an empty history until a matchday has been resolved', () => {
    expect(build().history).toEqual([]);
  });

  it('turns each resolution into a history row, oldest matchday first', () => {
    const board = build({
      // Deliberately out of order: resolutions arrive from a query, and a
      // history that jumps md2 → md1 reads as a bug to every player.
      resolutions: [
        buildResolution({ id: 'r2', matchdayId: 'copa-libertadores:md2' }),
        buildResolution({ id: 'r1', matchdayId: 'copa-libertadores:md1' }),
      ],
    });

    expect(board.history.map((row) => row.matchday)).toEqual([1, 2]);
    expect(Value.Check(BoardSchema, board)).toBe(true);
  });

  it('names the players a matchday eliminated instead of leaking entry ids', () => {
    const board = build({ resolutions: [buildResolution()] });

    expect(board.history).toEqual([
      { matchday: 1, eliminated: ['Luis'], resolvedAt: '2026-08-21T21:00:00.000Z' },
    ]);
    expect(JSON.stringify(board.history)).not.toContain('entry-luis');
  });

  it('names an eliminated player whose user record vanished without leaking an id', () => {
    const board = build({
      resolutions: [buildResolution()],
      displayNames: new Map([['user-ana', 'Ana']]),
    });

    const [row] = board.history;
    expect(row?.eliminated).toHaveLength(1);
    expect(row?.eliminated[0]).not.toContain('entry-luis');
    expect(row?.eliminated[0]).not.toContain('user-luis');
    expect(Value.Check(BoardSchema, board)).toBe(true);
  });

  it('names an eliminated entry the board never loaded without leaking its id', () => {
    // An entry can be missing from a shared board only if the two queries raced;
    // the row still has to name a player, and BoardHistoryItem has no nulls.
    const board = build({
      resolutions: [buildResolution({ eliminatedEntryIds: ['entry-gone'] })],
    });

    expect(board.history[0]?.eliminated).toHaveLength(1);
    expect(JSON.stringify(board.history)).not.toContain('entry-gone');
    expect(Value.Check(BoardSchema, board)).toBe(true);
  });

  it('drops a resolution whose matchday it cannot number', () => {
    // A history row with the wrong matchday number is worse than a missing one:
    // players read it as "I survived matchday 2" about a matchday nobody played.
    const board = build({
      resolutions: [
        buildResolution({ id: 'r1' }),
        buildResolution({ id: 'r9', matchdayId: 'other-league:md1' }),
      ],
    });

    expect(board.history.map((row) => row.matchday)).toEqual([1]);
  });

  it('keeps a matchday that eliminated nobody in the history', () => {
    // Survivors want to see that the matchday happened and everyone came
    // through it, which an absent row would not say.
    const board = build({
      resolutions: [buildResolution({ eliminatedEntryIds: [], islandEntryIds: [] })],
    });

    expect(board.history).toEqual([
      { matchday: 1, eliminated: [], resolvedAt: '2026-08-21T21:00:00.000Z' },
    ]);
  });
});

describe('isMatchdayLocked', () => {
  it('locks at lockAt, not a millisecond later', () => {
    const lockAt = Date.parse(LOCK_AT);

    expect(isMatchdayLocked(buildMatchday(), new Date(lockAt - 1))).toBe(false);
    expect(isMatchdayLocked(buildMatchday(), new Date(lockAt))).toBe(true);
  });

  it('trusts the status over the clock', () => {
    expect(isMatchdayLocked(buildMatchday({ status: 'locked' }), BEFORE_LOCK)).toBe(true);
    expect(isMatchdayLocked(buildMatchday({ status: 'resolved' }), BEFORE_LOCK)).toBe(true);
  });

  it('leaves an open matchday with an unreadable lockAt open', () => {
    // Corrupt data must not silently reveal picks; the pick route still refuses
    // the submission, because validatePick rejects the same timestamp.
    expect(isMatchdayLocked(buildMatchday({ lockAt: 'not-a-date' }), AFTER_LOCK)).toBe(false);
  });
});
