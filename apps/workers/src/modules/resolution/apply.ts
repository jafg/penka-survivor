import { ObjectId, type AnyBulkWriteOperation, type Db } from 'mongodb';
import { pickResultOf, type EntryEffect, type ResolutionOutcome } from '@penka/game-engine';
import type { Logger } from '../../logger';
import {
  entriesCollection,
  picksCollection,
  resolutionsCollection,
  type EntryDoc,
  type PickDoc,
} from './store';

export interface ApplyOutcomeInput {
  db: Db;
  log: Logger;
  penkaId: string;
  outcome: ResolutionOutcome;
  /** When the resolution happened, injected so the marker's timestamp is testable. */
  resolvedAt: Date;
}

/**
 * Translate one engine effect into one entry update. Every number here comes
 * from the effect — the worker never adds, compares or re-derives a rule, it
 * transcribes. `$inc` on points and `$addToSet` on usedTeams are the two places
 * where that is not literally true, and both are deliberate:
 *
 * - `points` is incremented rather than set because the engine reports a delta.
 * - `usedTeams` uses `$addToSet` rather than `$push` because a team is single-use
 *   by the rules, so the two are equivalent — and `$addToSet` additionally makes
 *   a redelivery that reaches this write twice harmless instead of corrupting
 *   the list.
 */
function entryOperation(effect: EntryEffect): AnyBulkWriteOperation<EntryDoc> {
  const update: Record<string, unknown> = {
    $set: { lives: effect.newLives, status: effect.newStatus },
  };
  if (effect.pointsDelta !== 0) {
    update['$inc'] = { points: effect.pointsDelta };
  }
  if (effect.teamConsumed !== null) {
    update['$addToSet'] = { usedTeams: effect.teamConsumed };
  }
  return {
    updateOne: { filter: { _id: ObjectId.createFromHexString(effect.entryId) }, update },
  } as AnyBulkWriteOperation<EntryDoc>;
}

/**
 * Label the pick this effect settled. An entry that submitted nothing matches no
 * document and the update is a silent no-op, which is the correct outcome: there
 * is no pick to label.
 */
function pickOperation(effect: EntryEffect, matchdayId: string): AnyBulkWriteOperation<PickDoc> {
  return {
    updateOne: {
      filter: { entryId: effect.entryId, matchdayId },
      update: { $set: { result: pickResultOf(effect) } },
    },
  };
}

function reasonsOf(settled: PromiseSettledResult<unknown>[]): unknown[] {
  return settled.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Persist a resolution outcome for one penka.
 *
 * Two invariants shape the order of writes:
 *
 * 1. **The resolution document goes in last.** It is the idempotency marker a
 *    redelivered command reads to decide it has nothing to do, so it must never
 *    exist before the effects it claims are applied. A crash between the effects
 *    and the marker therefore leaves work that gets *re-run*, not work that gets
 *    *skipped* — see the residual window documented in `apps/workers/CLAUDE.md`.
 * 2. **The two effect writes are inspected individually.** `Promise.all` would
 *    short-circuit on the first rejection and report a partial failure as a
 *    single one; `Promise.allSettled` lets the log name every leg that failed,
 *    which is the difference between "retry this" and "go read the database".
 *
 * A single Mongo transaction would collapse all of this into one atomic write.
 * It is not used because transactions require a replica set, and the MVP's
 * `mongo:7` runs standalone in both `infra/docker-compose.yml` and the tests.
 * That is the documented upgrade path, not an oversight.
 *
 * Throws when anything failed, so the caller can nack and let RabbitMQ redeliver.
 */
export async function applyOutcome(input: ApplyOutcomeInput): Promise<void> {
  const { db, log, penkaId, outcome, resolvedAt } = input;
  const context = { penkaId, matchdayId: outcome.matchdayId };

  // The driver rejects an empty operation list, and `load.ts` tolerates a penka
  // with no entries — so the engine can legitimately return an outcome with
  // nothing to write. Skipping straight to the marker records the matchday as
  // done for this penka, which is exactly what happened.
  const settled =
    outcome.effects.length === 0
      ? []
      : await Promise.allSettled([
          entriesCollection(db).bulkWrite(outcome.effects.map(entryOperation)),
          picksCollection(db).bulkWrite(
            outcome.effects.map((effect) => pickOperation(effect, outcome.matchdayId)),
          ),
        ]);

  const failures = reasonsOf(settled);
  if (failures.length > 0) {
    log.error(
      { ...context, failures: failures.map((reason) => toError(reason).message) },
      'failed to apply resolution effects; the matchday stays unresolved',
    );
    throw toError(failures[0]);
  }

  try {
    await resolutionsCollection(db).insertOne({
      penkaId,
      matchdayId: outcome.matchdayId,
      resolvedAt,
      eliminatedEntryIds: outcome.eliminatedEntryIds,
      islandEntryIds: outcome.effects
        .filter((effect) => effect.newStatus === 'island')
        .map((effect) => effect.entryId),
    });
  } catch (error) {
    // The effects landed and the marker did not: the only state that needs a
    // human's eyes, because a redelivery will resolve the same matchday again
    // against entries that already moved. Nothing is rolled back here — undoing
    // an elimination on a best-effort basis would be a second, unverifiable
    // opinion about the game state.
    log.error({ ...context, err: error }, 'effects applied but the resolution marker failed');
    throw error;
  }
}
