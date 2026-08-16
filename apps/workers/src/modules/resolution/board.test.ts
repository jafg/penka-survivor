import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import type { Redis } from 'ioredis';
import { Value } from '@sinclair/typebox/value';
import { BoardSchema, POLLING_PROFILE_KEY, boardCacheKey } from '@penka/contracts';
import { dropCachedBoards, refreshBoard } from './board';
import { captureLogs } from '../../test-support/logs';
import type { EntryDoc, MatchdayDoc, PickDoc, ResolutionDoc, UserDoc } from './store';

const PENKA_ID = '6a80b60ffda322125df55e5f';
const LEAGUE_ID = 'copa-libertadores';
const ANA = new ObjectId('6a80b60ffda322125df55e60');
const ANA_USER = new ObjectId('6a80b60ffda322125df55e70');
const NOW = new Date('2026-08-21T21:00:00.000Z');

const CALENDAR: MatchdayDoc[] = [
  {
    _id: 'copa-libertadores:md1',
    leagueId: LEAGUE_ID,
    number: 1,
    status: 'resolved',
    lockAt: new Date('2026-08-21T18:45:00.000Z'),
  },
  {
    _id: 'copa-libertadores:md2',
    leagueId: LEAGUE_ID,
    number: 2,
    status: 'open',
    lockAt: new Date('2026-08-22T18:45:00.000Z'),
  },
];

const ENTRIES: (EntryDoc & { _id: ObjectId })[] = [
  {
    _id: ANA,
    penkaId: PENKA_ID,
    userId: ANA_USER.toHexString(),
    lives: 1,
    status: 'alive',
    usedTeams: ['RIV'],
    points: 1,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
  },
];

const USERS: (UserDoc & { _id: ObjectId })[] = [
  {
    _id: ANA_USER,
    email: 'ana@example.com',
    displayName: 'Ana',
    passwordHash: 'x',
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
  },
];

const PICKS: (PickDoc & { _id: ObjectId })[] = [
  {
    _id: new ObjectId(),
    entryId: ANA.toHexString(),
    matchdayId: 'copa-libertadores:md2',
    teamCode: 'BOC',
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
  },
];

const RESOLUTIONS: (ResolutionDoc & { _id: ObjectId })[] = [
  {
    _id: new ObjectId(),
    penkaId: PENKA_ID,
    matchdayId: 'copa-libertadores:md1',
    resolvedAt: NOW,
    eliminatedEntryIds: [],
    islandEntryIds: [],
  },
];

function fakeDb(overrides: { calendar?: MatchdayDoc[] } = {}) {
  const findMatchdays = vi.fn(() => ({ toArray: async () => overrides.calendar ?? CALENDAR }));
  const findEntries = vi.fn(() => ({ toArray: async () => ENTRIES }));
  const findUsers = vi.fn(() => ({ toArray: async () => USERS }));
  const findPicks = vi.fn(() => ({ toArray: async () => PICKS }));
  const findResolutions = vi.fn(() => ({ toArray: async () => RESOLUTIONS }));
  const byName: Record<string, unknown> = {
    matchdays: { find: findMatchdays },
    entries: { find: findEntries },
    users: { find: findUsers },
    picks: { find: findPicks },
    resolutions: { find: findResolutions },
  };
  const db = { collection: vi.fn((name: string) => byName[name]) } as unknown as Db;
  return { db, findMatchdays, findEntries, findUsers, findPicks, findResolutions };
}

function fakeRedis(profile: string | null = null) {
  const get = vi.fn().mockResolvedValue(profile);
  const set = vi.fn().mockResolvedValue('OK');
  const del = vi.fn().mockResolvedValue(1);
  return { redis: { get, set, del } as unknown as Redis, get, set, del };
}

function refresh(db: Db, redis: Redis, log = captureLogs()) {
  return refreshBoard({ db, redis, log: log.logger, penkaId: PENKA_ID, leagueId: LEAGUE_ID, now: NOW });
}

describe('refreshBoard', () => {
  it('writes a board the contract accepts under the key @penka/api reads', async () => {
    // The worker and the API serve the same bytes to the same key: if the shape
    // drifted, a player would get a board the API never could have produced.
    const { db } = fakeDb();
    const { redis, set } = fakeRedis();

    const board = await refresh(db, redis);

    expect(Value.Check(BoardSchema, board)).toBe(true);
    const [key, payload, mode, ttl] = set.mock.calls[0] as [string, string, string, number];
    expect(key).toBe(boardCacheKey(PENKA_ID));
    expect(JSON.parse(payload)).toEqual(board);
    expect(mode).toBe('EX');
    expect(ttl).toBeGreaterThan(0);
  });

  it('moves the board on to the next matchday once the last one is resolved', async () => {
    // This is the point of flipping the shared matchday status: the engine's
    // current-matchday rule is what advances the board, and it reads `resolved`.
    const { db } = fakeDb();
    const { redis } = fakeRedis();

    const board = await refresh(db, redis);

    expect(board?.matchday).toBe(2);
    expect(board?.isResolved).toBe(false);
  });

  it('captions the history with the matchday numbers of the whole calendar', async () => {
    // A resolution points at a matchday by id; only the full calendar can turn
    // that into the number a player reads.
    const { db } = fakeDb();
    const { redis } = fakeRedis();

    const board = await refresh(db, redis);

    expect(board?.history).toEqual([{ matchday: 1, eliminated: [], resolvedAt: NOW.toISOString() }]);
  });

  it('serves the cadence the operator set for the whole deployment', async () => {
    const { db } = fakeDb();
    const { redis, get } = fakeRedis('slow');

    const board = await refresh(db, redis);

    expect(get).toHaveBeenCalledWith(POLLING_PROFILE_KEY);
    expect(board?.nextPollInSec).toBe(30);
  });

  it('asks for the picks of the matchday it is about to show', async () => {
    const { db, findPicks } = fakeDb();
    const { redis } = fakeRedis();

    await refresh(db, redis);

    expect(findPicks).toHaveBeenCalledWith({
      matchdayId: 'copa-libertadores:md2',
      entryId: { $in: [ANA.toHexString()] },
    });
  });

  it('leaves the cache untouched when the league has no calendar to show', async () => {
    // Nothing to build and nothing to serve; the API answers 404 here, and the
    // worker has no one to answer.
    const logs = captureLogs();
    const { db } = fakeDb({ calendar: [] });
    const { redis, set } = fakeRedis();

    expect(await refresh(db, redis, logs)).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('dropCachedBoards', () => {
  it('drops every named penka board in one round trip', async () => {
    const { redis, del } = fakeRedis();

    await dropCachedBoards(redis, ['a', 'b']);

    expect(del).toHaveBeenCalledWith(boardCacheKey('a'), boardCacheKey('b'));
  });

  it('does nothing when there is nothing to invalidate', async () => {
    // `DEL` with no keys is a Redis error, not a no-op.
    const { redis, del } = fakeRedis();

    await dropCachedBoards(redis, []);

    expect(del).not.toHaveBeenCalled();
  });
});
