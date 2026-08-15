import { describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { ResolveMatchdayCommand } from '@penka/contracts';
import type { ResolutionPublisher } from '../../messaging/publisher';
import { requestResolution } from './resolve';

const MATCHDAY_ID = 'copa-libertadores:md1';

function commands(...penkaIds: string[]): ResolveMatchdayCommand[] {
  return penkaIds.map((penkaId) => ({
    penkaId,
    leagueId: 'copa-libertadores',
    matchday: 1,
    requestedAt: '2026-08-15T14:00:00.000Z',
  }));
}

function fakeLog() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger & {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

/** Records what the route asks Mongo to do without needing a database. */
function fakeDb(behaviour: { mark?: () => Promise<unknown>; clear?: () => Promise<unknown> } = {}) {
  const updates: { update: unknown }[] = [];
  const updateOne = vi.fn(async (_filter: unknown, update: Record<string, unknown>) => {
    updates.push({ update });
    const isClear = '$unset' in update;
    return isClear ? ((await behaviour.clear?.()) ?? {}) : ((await behaviour.mark?.()) ?? {});
  });
  const db = { collection: () => ({ updateOne }) } as unknown as Db;
  return { db, updates, updateOne };
}

function publisher(impl?: () => Promise<void>): ResolutionPublisher & {
  publishResolutions: ReturnType<typeof vi.fn>;
} {
  const publishResolutions = vi.fn(impl ?? (async () => undefined));
  return { publishResolutions } as ResolutionPublisher & {
    publishResolutions: typeof publishResolutions;
  };
}

describe('requestResolution', () => {
  it('publishes the commands and marks the matchday as requested', async () => {
    const { db, updates } = fakeDb();
    const pub = publisher();

    await requestResolution({
      db,
      log: fakeLog(),
      publisher: pub,
      matchdayId: MATCHDAY_ID,
      commands: commands('p1', 'p2'),
      requestedAt: new Date('2026-08-15T14:00:00.000Z'),
    });

    expect(pub.publishResolutions).toHaveBeenCalledWith(commands('p1', 'p2'));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.update).toEqual({
      $set: { resolveRequestedAt: new Date('2026-08-15T14:00:00.000Z') },
    });
  });

  it('runs both legs concurrently — neither waits on the other', async () => {
    const { db } = fakeDb();
    let publishStarted = false;
    let markStartedBeforePublishResolved = false;
    const pub = publisher(async () => {
      publishStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const dbWithProbe = {
      collection: () => ({
        updateOne: async () => {
          markStartedBeforePublishResolved = publishStarted;
          return {};
        },
      }),
    } as unknown as Db;
    void db;

    await requestResolution({
      db: dbWithProbe,
      log: fakeLog(),
      publisher: pub,
      matchdayId: MATCHDAY_ID,
      commands: commands('p1'),
      requestedAt: new Date(),
    });

    expect(markStartedBeforePublishResolved).toBe(true);
  });

  it('un-marks the matchday when publishing failed', async () => {
    // The tolerable failure is duplicate messages, never a matchday marked as
    // requested with nothing in the queue: that one looks done and never runs.
    const { db, updates } = fakeDb();
    const pub = publisher(async () => {
      throw new Error('broker unreachable');
    });

    await expect(
      requestResolution({
        db,
        log: fakeLog(),
        publisher: pub,
        matchdayId: MATCHDAY_ID,
        commands: commands('p1'),
        requestedAt: new Date(),
      }),
    ).rejects.toThrow('broker unreachable');

    expect(updates.map((u) => u.update)).toEqual([
      { $set: { resolveRequestedAt: expect.any(Date) } },
      { $unset: { resolveRequestedAt: '' } },
    ]);
  });

  it('leaves a trace when it rolls the marker back', async () => {
    // The operator sees a 500 and nothing else; without a log line, the write
    // that was made and then undone would be invisible to whoever debugs it.
    const log = fakeLog();
    const { db } = fakeDb();
    const pub = publisher(async () => {
      throw new Error('broker unreachable');
    });

    await expect(
      requestResolution({
        db,
        log,
        publisher: pub,
        matchdayId: MATCHDAY_ID,
        commands: commands('p1'),
        requestedAt: new Date(),
      }),
    ).rejects.toThrow('broker unreachable');

    expect(log.warn).toHaveBeenCalled();
  });

  it('reports the publish failure, not a failure of its own compensation', async () => {
    // The caller is already answering with the publish error; a throw from the
    // rollback would replace it with a less useful one and lose the real cause.
    const log = fakeLog();
    const { db } = fakeDb({
      clear: () => Promise.reject(new Error('mongo went away too')),
    });
    const pub = publisher(async () => {
      throw new Error('broker unreachable');
    });

    await expect(
      requestResolution({
        db,
        log,
        publisher: pub,
        matchdayId: MATCHDAY_ID,
        commands: commands('p1'),
        requestedAt: new Date(),
      }),
    ).rejects.toThrow('broker unreachable');

    expect(log.error).toHaveBeenCalled();
  });

  it('accepts the work when only the bookkeeping failed', async () => {
    // The commands are in the queue and the workers will run them: that is what
    // the operator was told. A retry republishes the same deterministic message
    // ids, which the workers already recognize, so the cost is a log line.
    const log = fakeLog();
    const { db } = fakeDb({ mark: () => Promise.reject(new Error('mongo write failed')) });

    await requestResolution({
      db,
      log,
      publisher: publisher(),
      matchdayId: MATCHDAY_ID,
      commands: commands('p1'),
      requestedAt: new Date(),
    });

    expect(log.warn).toHaveBeenCalled();
  });

  it('does not compensate when both legs failed', async () => {
    // Nothing was marked, so there is nothing to un-mark; a blind rollback would
    // be a second write on a database that just told us it is not accepting any.
    const { db, updates } = fakeDb({ mark: () => Promise.reject(new Error('mongo write failed')) });
    const pub = publisher(async () => {
      throw new Error('broker unreachable');
    });

    await expect(
      requestResolution({
        db,
        log: fakeLog(),
        publisher: pub,
        matchdayId: MATCHDAY_ID,
        commands: commands('p1'),
        requestedAt: new Date(),
      }),
    ).rejects.toThrow('broker unreachable');

    expect(updates).toHaveLength(1);
  });
});
