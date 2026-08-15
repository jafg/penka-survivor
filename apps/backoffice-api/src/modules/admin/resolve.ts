import type { Db } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import type { ResolveMatchdayCommand } from '@penka/contracts';
import type { ResolutionPublisher } from '../../messaging/publisher';
import { matchdaysCollection } from './store';

export interface RequestResolutionInput {
  db: Db;
  log: FastifyBaseLogger;
  publisher: ResolutionPublisher;
  matchdayId: string;
  commands: readonly ResolveMatchdayCommand[];
  requestedAt: Date;
}

function toThrowable(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Undo the request marker after a failed publish. The caller is already
 * throwing the publish error, so a failure HERE cannot be raised — it would
 * replace the real cause with a less useful one. It is logged instead, with
 * the id an operator needs to clear the flag by hand.
 */
async function clearResolveRequest(db: Db, log: FastifyBaseLogger, matchdayId: string) {
  try {
    await matchdaysCollection(db).updateOne(
      { _id: matchdayId },
      { $unset: { resolveRequestedAt: '' } },
    );
    // Logged even when it works: the operator only sees a 500, so this line is
    // the only record that a write was made and then taken back.
    log.warn({ matchdayId }, 'rolled back resolveRequestedAt after a failed publish');
  } catch (error) {
    log.error(
      { err: error, matchdayId },
      'could not clear resolveRequestedAt after a failed publish; the matchday looks requested but nothing was queued',
    );
  }
}

/**
 * Queue a matchday's resolution: publish one command per penka and mark the
 * matchday as requested. Two systems, one operation, no transaction across
 * them — so the question is not whether they can disagree but which way.
 *
 * They run concurrently (allSettled, both results inspected: neither leg is a
 * prerequisite of the other), and the failure modes are deliberately
 * asymmetric:
 *
 * - Publish failed → the marker is rolled back. A matchday marked as requested
 *   with nothing in the queue is the one state nobody recovers from: it looks
 *   done, so no operator presses resolve again and the matchday never runs.
 * - Only the marker failed → the caller still succeeds. The commands ARE in the
 *   queue and the workers will run them, which is exactly what the response
 *   promises. A retry republishes the same deterministic message ids, which the
 *   workers recognize as work they have already done, so the cost of this
 *   direction is duplicate messages — and duplicates are harmless by design.
 */
export async function requestResolution(input: RequestResolutionInput): Promise<void> {
  const { db, log, publisher, matchdayId, commands, requestedAt } = input;

  const [published, marked] = await Promise.allSettled([
    publisher.publishResolutions(commands),
    matchdaysCollection(db).updateOne(
      { _id: matchdayId },
      { $set: { resolveRequestedAt: requestedAt } },
    ),
  ]);

  if (published.status === 'rejected') {
    if (marked.status === 'fulfilled') {
      // Only compensate what actually happened: with the mark itself rejected
      // there is nothing to undo, and the write would go to a database that has
      // just said it is not accepting any.
      await clearResolveRequest(db, log, matchdayId);
    }
    throw toThrowable(published.reason);
  }

  if (marked.status === 'rejected') {
    log.warn(
      { err: toThrowable(marked.reason), matchdayId, penkas: commands.length },
      'resolution was published but the matchday could not be marked as requested; a retry will republish the same message ids',
    );
  }
}
