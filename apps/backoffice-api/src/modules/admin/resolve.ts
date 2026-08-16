import type { Db } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { ErrorCodes, type ResolveMatchdayCommand } from '@penka/contracts';
import type { ResolutionPublisher } from '../../messaging/publisher';
import { ApiError } from '../../errors';
import { matchdaysCollection } from './store';

export interface RequestResolutionInput {
  db: Db;
  log: FastifyBaseLogger;
  publisher: ResolutionPublisher;
  matchdayId: string;
  commands: readonly ResolveMatchdayCommand[];
  /** Whether THIS request stamped the matchday; only then may it be un-stamped. */
  claimed: boolean;
}

/** The timestamp every command of a matchday shares, and who put it there. */
export interface ResolveClaim {
  requestedAt: Date;
  claimed: boolean;
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
export async function clearResolveRequest(db: Db, log: FastifyBaseLogger, matchdayId: string) {
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
 * Take (or join) a matchday's resolution request and return the timestamp its
 * whole fan-out is pinned to.
 *
 * The timestamp is not decoration: `@penka/workers` counts the penkas of
 * `{ leagueId, createdAt <= requestedAt }` to decide the matchday is finished,
 * so the set of penkas that got a command and the set the workers wait for must
 * be derived from the SAME instant. A second press that minted a fresh `new
 * Date()` would build a wider set than the first — and a penka that joined in
 * between would be resolved by nobody, because the first fan-out has already
 * finished the matchday without it.
 *
 * So the marker is claimed **before** the penkas are read, conditionally and in
 * one round trip: the first press stamps it, and every later press replays that
 * same stamp. Two operators pressing at the same instant therefore agree, which
 * a read-then-write could not guarantee.
 */
export async function claimResolveRequest(
  db: Db,
  matchdayId: string,
  now: Date,
): Promise<ResolveClaim> {
  const claimed = await matchdaysCollection(db).findOneAndUpdate(
    { _id: matchdayId, resolveRequestedAt: { $exists: false } },
    { $set: { resolveRequestedAt: now } },
    { returnDocument: 'after', projection: { resolveRequestedAt: 1 } },
  );
  if (claimed !== null) {
    return { requestedAt: now, claimed: true };
  }

  // Somebody else holds the request: replay their timestamp, never a new one.
  const existing = await matchdaysCollection(db).findOne(
    { _id: matchdayId },
    { projection: { resolveRequestedAt: 1 } },
  );
  if (existing?.resolveRequestedAt === undefined) {
    // The caller loaded this matchday moments ago, so it went away underneath
    // the request. Nothing in the repo deletes matchdays; answering 404 says
    // what happened instead of publishing against a calendar that is gone.
    throw new ApiError(404, ErrorCodes.matchday_not_found, 'Unknown matchday');
  }
  return { requestedAt: existing.resolveRequestedAt, claimed: false };
}

/**
 * Publish one command per penka of the request claimed above.
 *
 * The marker is written before this runs, which leaves exactly one failure to
 * compensate: a publish that never reached the broker. The matchday would then
 * look requested with nothing in the queue — the one state nobody recovers
 * from, since it reads as done and no operator presses resolve again — so the
 * claim is given back. Only ours: a republish that fails says nothing about the
 * request it was replaying, and clearing that marker would let the next press
 * mint a second, wider fan-out.
 */
export async function requestResolution(input: RequestResolutionInput): Promise<void> {
  const { db, log, publisher, matchdayId, commands, claimed } = input;

  try {
    await publisher.publishResolutions(commands);
  } catch (reason) {
    if (claimed) {
      await clearResolveRequest(db, log, matchdayId);
    }
    throw toThrowable(reason);
  }
}
