import { ObjectId, type Db } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { discardPenka } from './rollback';

function fakeDb(deleteOne: () => Promise<unknown>): { db: Db; filters: unknown[] } {
  const filters: unknown[] = [];
  const db = {
    collection: () => ({
      deleteOne: (filter: unknown) => {
        filters.push(filter);
        return deleteOne();
      },
    }),
  } as unknown as Db;
  return { db, filters };
}

function fakeLog(): FastifyBaseLogger {
  return { error: vi.fn() } as unknown as FastifyBaseLogger;
}

describe('discardPenka', () => {
  const penkaId = new ObjectId('6a80b60ffda322125df55e5f');

  it('deletes the penka it was given', async () => {
    const { db, filters } = fakeDb(() => Promise.resolve({ deletedCount: 1 }));
    const log = fakeLog();

    await discardPenka(db, log, penkaId);

    expect(filters).toEqual([{ _id: penkaId }]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('reports the orphan instead of failing when the cleanup itself fails', async () => {
    // The caller is already throwing the error that triggered the rollback, so
    // this one has nowhere to go — but a penka nobody can reach still holds one
    // of only 10,000 join codes, and an operator can only reclaim what they can
    // see in the log.
    const { db } = fakeDb(() => Promise.reject(new Error('connection lost')));
    const log = fakeLog();

    await expect(discardPenka(db, log, penkaId)).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledTimes(1);
    const [details, message] = vi.mocked(log.error).mock.calls[0] ?? [];
    expect(details).toMatchObject({ penkaId: '6a80b60ffda322125df55e5f' });
    expect(message).toContain('join code');
  });
});
