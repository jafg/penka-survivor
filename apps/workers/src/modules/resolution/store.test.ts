import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { Value } from '@sinclair/typebox/value';
import {
  EntrySchema,
  MatchSchema,
  MatchdaySchema,
  PlayerPickSchema,
  ResolutionSchema,
} from '@penka/contracts';
import {
  ensureWorkerIndexes,
  toEntry,
  toMatch,
  toMatchday,
  toPlayerPick,
  toResolution,
  type EntryDoc,
  type MatchDoc,
  type MatchdayDoc,
  type PickDoc,
  type ResolutionDoc,
} from './store';

describe('toEntry', () => {
  it('maps to the contract with the generated id as hex', () => {
    const _id = new ObjectId();
    const doc: EntryDoc = {
      penkaId: '6a80b60ffda322125df55e5f',
      userId: '6a80b60ffda322125df55e60',
      lives: 2,
      status: 'alive',
      usedTeams: ['RIV'],
      points: 3,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    };

    const entry = toEntry({ _id, ...doc });

    expect(entry).toEqual({
      id: _id.toHexString(),
      penkaId: '6a80b60ffda322125df55e5f',
      userId: '6a80b60ffda322125df55e60',
      lives: 2,
      status: 'alive',
      usedTeams: ['RIV'],
      points: 3,
    });
    expect(Value.Check(EntrySchema, entry)).toBe(true);
  });

  it('leaves createdAt behind — the engine has no use for it', () => {
    expect(
      Object.keys(
        toEntry({
          _id: new ObjectId(),
          penkaId: 'p',
          userId: 'u',
          lives: 1,
          status: 'island',
          usedTeams: [],
          points: 0,
          createdAt: new Date(),
        }),
      ),
    ).not.toContain('createdAt');
  });
});

describe('toMatchday', () => {
  it('passes the derived string id through and renders dates as ISO-8601', () => {
    const doc: MatchdayDoc = {
      _id: 'copa-libertadores:md1',
      leagueId: 'copa-libertadores',
      number: 1,
      status: 'locked',
      lockAt: new Date('2026-08-21T18:45:00.000Z'),
      resolveRequestedAt: new Date('2026-08-21T21:00:00.000Z'),
    };

    const matchday = toMatchday(doc);

    // resolveRequestedAt is the back office's bookkeeping and is not a state of
    // the game: MatchdayStatus has three values and no mapper emits a fourth.
    expect(matchday).toEqual({
      id: 'copa-libertadores:md1',
      leagueId: 'copa-libertadores',
      number: 1,
      status: 'locked',
      lockAt: '2026-08-21T18:45:00.000Z',
    });
    expect(Value.Check(MatchdaySchema, matchday)).toBe(true);
  });
});

describe('toMatch', () => {
  it('maps to the contract and drops the league the document carries', () => {
    const doc: MatchDoc = {
      _id: 'copa-libertadores:md1:RIV-ATN',
      matchdayId: 'copa-libertadores:md1',
      leagueId: 'copa-libertadores',
      homeTeamCode: 'RIV',
      awayTeamCode: 'ATN',
      kickoffAt: new Date('2026-08-21T18:45:00.000Z'),
      outcome: 'home',
    };

    const match = toMatch(doc);

    expect(match).toEqual({
      id: 'copa-libertadores:md1:RIV-ATN',
      matchdayId: 'copa-libertadores:md1',
      homeTeamCode: 'RIV',
      awayTeamCode: 'ATN',
      kickoffAt: '2026-08-21T18:45:00.000Z',
      outcome: 'home',
    });
    expect(Value.Check(MatchSchema, match)).toBe(true);
  });

  it('keeps a match with no result, which is what stops a resolution', () => {
    expect(
      toMatch({
        _id: 'copa-libertadores:md1:RIV-ATN',
        matchdayId: 'copa-libertadores:md1',
        leagueId: 'copa-libertadores',
        homeTeamCode: 'RIV',
        awayTeamCode: 'ATN',
        kickoffAt: new Date('2026-08-21T18:45:00.000Z'),
        outcome: null,
      }).outcome,
    ).toBeNull();
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

  it('leaves the result this worker wrote out of the contract shape', () => {
    // `result` is storage's label on a resolved pick — PlayerPickSchema is a
    // closed object, so a mapper that emitted it would fail validation the
    // moment an endpoint served one.
    const pick = toPlayerPick({
      _id: new ObjectId(),
      entryId: 'e',
      matchdayId: 'copa-libertadores:md1',
      teamCode: 'RIV',
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      result: 'won',
    });

    expect(Object.keys(pick)).not.toContain('result');
    expect(Value.Check(PlayerPickSchema, pick)).toBe(true);
  });
});

describe('toResolution', () => {
  it('renders the generated id as hex and the timestamp as ISO-8601', () => {
    const _id = new ObjectId();
    const doc: ResolutionDoc = {
      penkaId: '6a80b60ffda322125df55e5f',
      matchdayId: 'copa-libertadores:md1',
      resolvedAt: new Date('2026-08-21T21:00:00.000Z'),
      eliminatedEntryIds: ['6a80b60ffda322125df55e60'],
      islandEntryIds: ['6a80b60ffda322125df55e60'],
    };

    const resolution = toResolution({ _id, ...doc });

    expect(resolution).toEqual({
      id: _id.toHexString(),
      penkaId: '6a80b60ffda322125df55e5f',
      matchdayId: 'copa-libertadores:md1',
      resolvedAt: '2026-08-21T21:00:00.000Z',
      eliminatedEntryIds: ['6a80b60ffda322125df55e60'],
      islandEntryIds: ['6a80b60ffda322125df55e60'],
    });
    expect(Value.Check(ResolutionSchema, resolution)).toBe(true);
  });
});

describe('ensureWorkerIndexes', () => {
  function fakeDb() {
    const createIndex = vi.fn().mockResolvedValue('ok');
    const db = { collection: vi.fn(() => ({ createIndex })) };
    return { db: db as unknown as Db, collection: db.collection, createIndex };
  }

  it('makes a second resolution of the same matchday impossible to insert', async () => {
    // This index IS the idempotency guarantee: the gate that reads before
    // writing can be raced, the unique key cannot.
    const { db, collection, createIndex } = fakeDb();

    await ensureWorkerIndexes(db);

    expect(collection).toHaveBeenCalledWith('resolutions');
    expect(createIndex).toHaveBeenCalledWith({ penkaId: 1, matchdayId: 1 }, { unique: true });
  });

  it('is safe to call on every boot', async () => {
    // Declaring an index that already exists is a no-op in Mongo, which is why
    // this runs at startup instead of behind a migration.
    const { db, createIndex } = fakeDb();

    await ensureWorkerIndexes(db);
    await ensureWorkerIndexes(db);

    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});
