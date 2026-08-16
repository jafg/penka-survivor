import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import type { ResolutionOutcome } from '@penka/game-engine';
import { applyOutcome } from './apply';
import { captureLogs } from '../../test-support/logs';

const PENKA_ID = '6a80b60ffda322125df55e5f';
const ANA = '6a80b60ffda322125df55e60';
const LUIS = '6a80b60ffda322125df55e61';
const MATCHDAY_ID = 'copa-libertadores:md1';
const RESOLVED_AT = new Date('2026-08-21T21:00:00.000Z');

function outcome(): ResolutionOutcome {
  return {
    matchdayId: MATCHDAY_ID,
    matchdayNumber: 1,
    effects: [
      {
        entryId: ANA,
        livesDelta: 0,
        pointsDelta: 1,
        newLives: 2,
        newStatus: 'alive',
        teamConsumed: 'RIV',
      },
      {
        entryId: LUIS,
        livesDelta: -1,
        pointsDelta: 0,
        newLives: 0,
        newStatus: 'island',
        teamConsumed: 'BOC',
      },
    ],
    eliminatedEntryIds: [LUIS],
    summary: {
      totalEntries: 2,
      aliveBefore: 2,
      aliveAfter: 1,
      islandBefore: 0,
      islandAfter: 1,
      eliminated: 1,
    },
  };
}

function fakeDb(overrides: { entries?: unknown; picks?: unknown; resolutions?: unknown } = {}) {
  const entries = { bulkWrite: vi.fn().mockResolvedValue({}), ...(overrides.entries ?? {}) };
  const picks = { bulkWrite: vi.fn().mockResolvedValue({}), ...(overrides.picks ?? {}) };
  const resolutions = {
    insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    ...(overrides.resolutions ?? {}),
  };
  const byName: Record<string, unknown> = { entries, picks, resolutions };
  const db = { collection: vi.fn((name: string) => byName[name]) };
  return { db: db as unknown as Db, entries, picks, resolutions };
}

function apply(db: Db, log = captureLogs()) {
  return applyOutcome({ db, log: log.logger, penkaId: PENKA_ID, outcome: outcome(), resolvedAt: RESOLVED_AT });
}

describe('applyOutcome', () => {
  it('applies exactly what the engine decided, and computes nothing of its own', async () => {
    const { db, entries } = fakeDb();

    await apply(db);

    const [operations] = entries.bulkWrite.mock.calls[0] as [Record<string, unknown>[]];
    expect(operations).toEqual([
      {
        updateOne: {
          filter: { _id: ObjectId.createFromHexString(ANA) },
          update: {
            $set: { lives: 2, status: 'alive' },
            $inc: { points: 1 },
            $addToSet: { usedTeams: 'RIV' },
          },
        },
      },
      {
        updateOne: {
          filter: { _id: ObjectId.createFromHexString(LUIS) },
          update: {
            $set: { lives: 0, status: 'island' },
            $addToSet: { usedTeams: 'BOC' },
          },
        },
      },
    ]);
  });

  it('leaves usedTeams alone when the engine consumed no team', async () => {
    const { db, entries } = fakeDb();
    const withoutPick: ResolutionOutcome = {
      ...outcome(),
      effects: [
        {
          entryId: ANA,
          livesDelta: -1,
          pointsDelta: 0,
          newLives: 1,
          newStatus: 'alive',
          teamConsumed: null,
        },
      ],
    };

    await applyOutcome({
      db,
      log: captureLogs().logger,
      penkaId: PENKA_ID,
      outcome: withoutPick,
      resolvedAt: RESOLVED_AT,
    });

    const [operations] = entries.bulkWrite.mock.calls[0] as [
      { updateOne: { update: Record<string, unknown> } }[],
    ];
    expect(operations[0]?.updateOne.update).toEqual({ $set: { lives: 1, status: 'alive' } });
  });

  it('labels every pick the matchday settled', async () => {
    const { db, picks } = fakeDb();

    await apply(db);

    const [operations] = picks.bulkWrite.mock.calls[0] as [Record<string, unknown>[]];
    expect(operations).toEqual([
      {
        updateOne: {
          filter: { entryId: ANA, matchdayId: MATCHDAY_ID },
          update: { $set: { result: 'won' } },
        },
      },
      {
        updateOne: {
          filter: { entryId: LUIS, matchdayId: MATCHDAY_ID },
          update: { $set: { result: 'lost' } },
        },
      },
    ]);
  });

  it('writes the resolution marker last, after every effect has landed', async () => {
    // The marker is what a redelivery reads to decide it has nothing to do, so
    // it must never exist before the work it claims is finished.
    const order: string[] = [];
    const { db, entries, picks, resolutions } = fakeDb();
    entries.bulkWrite.mockImplementation(async () => {
      order.push('entries');
      return {};
    });
    picks.bulkWrite.mockImplementation(async () => {
      order.push('picks');
      return {};
    });
    resolutions.insertOne.mockImplementation(async () => {
      order.push('marker');
      return { insertedId: new ObjectId() };
    });

    await apply(db);

    expect(order.at(-1)).toBe('marker');
    expect(order).toContain('entries');
    expect(order).toContain('picks');
  });

  it('records who went out and who is on the island once the matchday is applied', async () => {
    const { db, resolutions } = fakeDb();

    await apply(db);

    expect(resolutions.insertOne).toHaveBeenCalledWith({
      penkaId: PENKA_ID,
      matchdayId: MATCHDAY_ID,
      resolvedAt: RESOLVED_AT,
      eliminatedEntryIds: [LUIS],
      // The whole island after the effects, not only this matchday's casualties.
      islandEntryIds: [LUIS],
    });
  });

  it('marks a matchday with no effects to apply instead of failing on an empty write', async () => {
    // `load.ts` deliberately tolerates a penka with no entries, so the engine can
    // hand back an outcome with no effects — and the driver rejects `bulkWrite([])`
    // outright. Left alone that throws, the message retries three times and dies
    // in the DLQ over a matchday there was genuinely nothing to do for, which the
    // marker should simply record as done.
    const { db, entries, picks, resolutions } = fakeDb();

    await applyOutcome({
      db,
      log: captureLogs().logger,
      penkaId: PENKA_ID,
      outcome: { ...outcome(), effects: [], eliminatedEntryIds: [] },
      resolvedAt: RESOLVED_AT,
    });

    expect(entries.bulkWrite).not.toHaveBeenCalled();
    expect(picks.bulkWrite).not.toHaveBeenCalled();
    expect(resolutions.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ eliminatedEntryIds: [], islandEntryIds: [] }),
    );
  });

  it('refuses to write the marker when an effect could not be applied', async () => {
    // Half a matchday plus a marker saying it is done is the one state nobody
    // recovers from: every later delivery would read the marker and stop.
    const { resolutions } = fakeDb();
    const { entries } = fakeDb();
    entries.bulkWrite.mockRejectedValue(new Error('mongo is down'));
    const broken = {
      collection: vi.fn((name: string) =>
        name === 'entries' ? entries : name === 'resolutions' ? resolutions : { bulkWrite: vi.fn() },
      ),
    } as unknown as Db;

    await expect(apply(broken)).rejects.toThrow('mongo is down');
    expect(resolutions.insertOne).not.toHaveBeenCalled();
  });

  it('reports every leg that failed, not only the first one', async () => {
    // Promise.all would short-circuit on the entries failure and hide that the
    // picks never landed either, which is the difference between "retry this"
    // and "go look at the database".
    const logs = captureLogs();
    const entries = { bulkWrite: vi.fn().mockRejectedValue(new Error('entries failed')) };
    const picks = { bulkWrite: vi.fn().mockRejectedValue(new Error('picks failed')) };
    const resolutions = { insertOne: vi.fn() };
    const byName: Record<string, unknown> = { entries, picks, resolutions };
    const db = { collection: vi.fn((name: string) => byName[name]) } as unknown as Db;

    await expect(apply(db, logs)).rejects.toThrow(/entries failed/);

    expect(JSON.stringify(logs.lines)).toContain('picks failed');
  });

  it('leaves an operator a trace when the effects landed but the marker did not', async () => {
    const logs = captureLogs();
    const { db, resolutions } = fakeDb();
    resolutions.insertOne.mockRejectedValue(new Error('marker failed'));

    await expect(apply(db, logs)).rejects.toThrow('marker failed');

    const line = JSON.stringify(logs.lines);
    expect(line).toContain(PENKA_ID);
    expect(line).toContain(MATCHDAY_ID);
  });
});
