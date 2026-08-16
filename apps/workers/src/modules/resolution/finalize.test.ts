import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { finalizeMatchday } from './finalize';
import { captureLogs } from '../../test-support/logs';

const LEAGUE_ID = 'copa-libertadores';
const MATCHDAY_ID = 'copa-libertadores:md1';
const REQUESTED_AT = new Date('2026-08-21T21:00:00.000Z');

function penkaIds(count: number): ObjectId[] {
  return Array.from({ length: count }, () => new ObjectId());
}

function fakeDb(options: { penkas: ObjectId[]; resolved: number }) {
  const toArray = vi.fn().mockResolvedValue(options.penkas.map((_id) => ({ _id })));
  const penkas = { find: vi.fn(() => ({ project: vi.fn(() => ({ toArray })) })) };
  const resolutions = { countDocuments: vi.fn().mockResolvedValue(options.resolved) };
  const matchdays = { updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) };
  const byName: Record<string, unknown> = { penkas, resolutions, matchdays };
  const db = { collection: vi.fn((name: string) => byName[name]) } as unknown as Db;
  return { db, penkas, resolutions, matchdays };
}

function finalize(db: Db, log = captureLogs()) {
  return finalizeMatchday({
    db,
    log: log.logger,
    leagueId: LEAGUE_ID,
    matchdayId: MATCHDAY_ID,
    requestedAt: REQUESTED_AT,
  });
}

describe('finalizeMatchday', () => {
  it('leaves the matchday locked while another penka still has to resolve it', async () => {
    // A matchday belongs to the LEAGUE and every penka on that league shares it,
    // but a resolution belongs to a PENKA. Flipping the shared document after
    // the first penka finished would make the engine answer `already_resolved`
    // to every sibling penka's command — their players would never be resolved.
    const { db, matchdays } = fakeDb({ penkas: penkaIds(3), resolved: 2 });

    const result = await finalize(db);

    expect(result.resolved).toBe(false);
    expect(matchdays.updateOne).not.toHaveBeenCalled();
  });

  it('marks the matchday resolved once every penka on the league has its resolution', async () => {
    const { db, matchdays } = fakeDb({ penkas: penkaIds(3), resolved: 3 });

    const result = await finalize(db);

    expect(result.resolved).toBe(true);
    expect(matchdays.updateOne).toHaveBeenCalledWith(
      // Only a locked matchday advances: this filter is what makes a second
      // arrival a no-op instead of resurrecting a status.
      { _id: MATCHDAY_ID, status: 'locked' },
      { $set: { status: 'resolved' } },
    );
  });

  it('counts only the penkas the fan-out actually addressed', async () => {
    // The back office publishes one command per penka that existed when the
    // operator pressed resolve. A penka created a second later gets no command,
    // so counting it would strand the matchday as locked forever.
    const { db, penkas, resolutions } = fakeDb({ penkas: penkaIds(2), resolved: 2 });

    await finalize(db);

    expect(penkas.find).toHaveBeenCalledWith({
      leagueId: LEAGUE_ID,
      createdAt: { $lte: REQUESTED_AT },
    });
    const [filter] = resolutions.countDocuments.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toEqual({
      matchdayId: MATCHDAY_ID,
      penkaId: { $in: expect.any(Array) as string[] },
    });
  });

  it('asks about resolutions by penka id as hex, the way the worker stores them', async () => {
    const ids = penkaIds(2);
    const { db, resolutions } = fakeDb({ penkas: ids, resolved: 2 });

    await finalize(db);

    const [filter] = resolutions.countDocuments.mock.calls[0] as [
      { penkaId: { $in: string[] } },
    ];
    expect(filter.penkaId.$in).toEqual(ids.map((id) => id.toHexString()));
  });

  it('names every penka whose cached board the flip just invalidated', async () => {
    // Sibling penkas had their board rebuilt BEFORE this flip, so their cached
    // copy still says the matchday is unresolved. The writer that changed the
    // shared document is the one that knows to drop them.
    const ids = penkaIds(3);
    const { db } = fakeDb({ penkas: ids, resolved: 3 });

    const result = await finalize(db);

    expect(result.penkaIds).toEqual(ids.map((id) => id.toHexString()));
  });

  it('invalidates nothing when it changed nothing', async () => {
    const { db } = fakeDb({ penkas: penkaIds(3), resolved: 1 });

    expect((await finalize(db)).penkaIds).toEqual([]);
  });

  it('reports nothing changed when the matchday was already marked resolved', async () => {
    // Every redelivery of a finished matchday reaches this point. Reporting a
    // flip that did not happen would make the caller drop every board on the
    // league from the cache, over and over, for no new state.
    const { db, matchdays } = fakeDb({ penkas: penkaIds(2), resolved: 2 });
    matchdays.updateOne.mockResolvedValue({ modifiedCount: 0 });

    expect(await finalize(db)).toEqual({ resolved: false, penkaIds: [] });
  });

  it('reports a league whose penkas all vanished as nothing to finalize', async () => {
    // Zero penkas would otherwise read as "all zero of them are done" and
    // resolve a matchday nobody played.
    const { db, matchdays } = fakeDb({ penkas: [], resolved: 0 });

    const result = await finalize(db);

    expect(result.resolved).toBe(false);
    expect(matchdays.updateOne).not.toHaveBeenCalled();
  });

  it('never fails the message it was called from', async () => {
    // The penka's own resolution is already durable at this point. Losing the
    // shared status flip costs a stale board until the next command or retry
    // re-runs it; nacking would re-run an eliminated player's matchday instead.
    const logs = captureLogs();
    const { db, matchdays } = fakeDb({ penkas: penkaIds(1), resolved: 1 });
    matchdays.updateOne.mockRejectedValue(new Error('mongo is down'));

    const result = await finalize(db, logs);

    expect(result).toEqual({ resolved: false, penkaIds: [] });
    expect(JSON.stringify(logs.lines)).toContain('mongo is down');
  });
});
