import { describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { ResolveMatchdayCommand } from '@penka/contracts';
import type { ResolutionPublisher } from '../../messaging/publisher';
import { claimResolveRequest, requestResolution } from './resolve';

const MATCHDAY_ID = 'copa-libertadores:md1';
const CLAIMED_AT = new Date('2026-08-15T14:00:00.000Z');

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

/**
 * A matchday document that only accepts the claim when the marker is unset,
 * which is the single behaviour `claimResolveRequest` leans on.
 */
function fakeMatchday(options: { storedAt?: Date; missing?: boolean } = {}) {
  const stored: { resolveRequestedAt?: Date } = { resolveRequestedAt: options.storedAt };
  const findOneAndUpdate = vi.fn(
    async (_filter: unknown, update: { $set: { resolveRequestedAt: Date } }) => {
      if (options.missing === true || stored.resolveRequestedAt !== undefined) {
        return null;
      }
      stored.resolveRequestedAt = update.$set.resolveRequestedAt;
      return { _id: MATCHDAY_ID, ...stored };
    },
  );
  const findOne = vi.fn(async () =>
    options.missing === true ? null : { _id: MATCHDAY_ID, ...stored },
  );
  const db = { collection: () => ({ findOneAndUpdate, findOne }) } as unknown as Db;
  return { db, stored, findOneAndUpdate, findOne };
}

function publisher(impl?: () => Promise<void>): ResolutionPublisher & {
  publishResolutions: ReturnType<typeof vi.fn>;
} {
  const publishResolutions = vi.fn(impl ?? (async () => undefined));
  return { publishResolutions } as ResolutionPublisher & {
    publishResolutions: typeof publishResolutions;
  };
}

describe('claimResolveRequest', () => {
  it('stamps the matchday and reports the claim when nobody had requested it', async () => {
    const { db, stored, findOneAndUpdate } = fakeMatchday();

    const claim = await claimResolveRequest(db, MATCHDAY_ID, CLAIMED_AT);

    expect(claim).toEqual({ requestedAt: CLAIMED_AT, claimed: true });
    expect(stored.resolveRequestedAt).toEqual(CLAIMED_AT);
    // Conditional in one round trip: two operators pressing at the same instant
    // must not walk away with two different timestamps.
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: MATCHDAY_ID, resolveRequestedAt: { $exists: false } },
      { $set: { resolveRequestedAt: CLAIMED_AT } },
      expect.anything(),
    );
  });

  it('hands back the stored timestamp when the matchday was already requested', async () => {
    // The whole point of the claim: a second press resolves the SAME generation
    // of penkas as the first, so a penka created in between cannot land in one
    // fan-out while the other one has already finished the matchday without it.
    const earlier = new Date('2026-08-15T13:00:00.000Z');
    const { db, stored } = fakeMatchday({ storedAt: earlier });

    const claim = await claimResolveRequest(db, MATCHDAY_ID, CLAIMED_AT);

    expect(claim).toEqual({ requestedAt: earlier, claimed: false });
    expect(stored.resolveRequestedAt).toEqual(earlier);
  });

  it('refuses a matchday that disappeared under the claim', async () => {
    const { db } = fakeMatchday({ missing: true });

    await expect(claimResolveRequest(db, MATCHDAY_ID, CLAIMED_AT)).rejects.toMatchObject({
      code: 'matchday_not_found',
    });
  });
});

describe('requestResolution', () => {
  it('publishes the commands and writes nothing of its own', async () => {
    // The marker is the claim, taken before the penka snapshot; publishing it a
    // second time here would be a write with nothing to say.
    const { db, updates } = fakeDb();
    const pub = publisher();

    await requestResolution({
      db,
      log: fakeLog(),
      publisher: pub,
      matchdayId: MATCHDAY_ID,
      commands: commands('p1', 'p2'),
      claimed: true,
    });

    expect(pub.publishResolutions).toHaveBeenCalledWith(commands('p1', 'p2'));
    expect(updates).toEqual([]);
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
        claimed: true,
      }),
    ).rejects.toThrow('broker unreachable');

    expect(updates.map((u) => u.update)).toEqual([{ $unset: { resolveRequestedAt: '' } }]);
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
        claimed: true,
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
        claimed: true,
      }),
    ).rejects.toThrow('broker unreachable');

    expect(log.error).toHaveBeenCalled();
  });

  it('does not compensate a marker it did not claim', async () => {
    // A second press republishes a request that already exists. Its failure says
    // nothing about the first one, whose commands are in the queue — and clearing
    // the marker here would let a third press claim a NEW timestamp, which is the
    // split fan-out the claim exists to prevent.
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
        claimed: false,
      }),
    ).rejects.toThrow('broker unreachable');

    expect(updates).toEqual([]);
  });
});
