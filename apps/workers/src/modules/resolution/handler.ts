import type { Db } from 'mongodb';
import type { Redis } from 'ioredis';
import {
  matchdayId as buildMatchdayId,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import { resolveMatchday, type ResolveRejectionCode } from '@penka/game-engine';
import type { Logger } from '../../logger';
import { applyOutcome, type ApplyOutcomeInput } from './apply';
import { dropCachedBoards, refreshBoard, type RefreshBoardInput } from './board';
import { finalizeMatchday, type FinalizeMatchdayInput, type FinalizeMatchdayResult } from './finalize';
import { loadResolutionState, type ResolutionState } from './load';
import { resolutionsCollection } from './store';

/**
 * Why a command produced no work. `already_resolved` is the engine's own code
 * (the shared matchday says it is done); the other two are this worker's.
 */
export type SkipReason = 'already-resolved' | 'state-missing' | 'already_resolved';

/**
 * What the handler decided. The consumer turns this into an ack or a nack and
 * knows nothing about resolution — which is why `retry` is a value here rather
 * than a thrown error: a still-open matchday is a normal race, not a fault.
 */
export type ResolutionResult =
  | { status: 'applied'; eliminated: number }
  | { status: 'skipped'; reason: SkipReason }
  | { status: 'retry'; reason: Extract<ResolveRejectionCode, 'matchday_not_locked' | 'results_missing'> };

/**
 * The handler's collaborators, injected so the decision table below can be
 * tested on its own. Each one is covered against Mongo and Redis call shapes in
 * its own unit test, and the integration suite exercises the real wiring — this
 * seam exists so the branching is not buried under five layers of fake cursors.
 */
export interface ResolutionSteps {
  hasResolution(db: Db, penkaId: string, matchdayId: string): Promise<boolean>;
  load(db: Db, command: ResolveMatchdayCommand): Promise<ResolutionState | null>;
  apply(input: ApplyOutcomeInput): Promise<void>;
  finalize(input: FinalizeMatchdayInput): Promise<FinalizeMatchdayResult>;
  refresh(input: RefreshBoardInput): Promise<unknown>;
  dropBoards(redis: Redis, penkaIds: readonly string[]): Promise<void>;
}

export interface ResolutionHandlerDeps {
  db: Db;
  redis: Redis;
  log: Logger;
  now?: () => Date;
  steps?: Partial<ResolutionSteps>;
}

export type ResolutionHandler = (command: ResolveMatchdayCommand) => Promise<ResolutionResult>;

/** The idempotency gate's read. The unique index behind it is the actual guarantee. */
async function hasResolution(db: Db, penkaId: string, matchdayId: string): Promise<boolean> {
  const existing = await resolutionsCollection(db).findOne(
    { penkaId, matchdayId },
    { projection: { _id: 1 } },
  );
  return existing !== null;
}

const DEFAULT_STEPS: ResolutionSteps = {
  hasResolution,
  load: loadResolutionState,
  apply: applyOutcome,
  finalize: finalizeMatchday,
  refresh: refreshBoard,
  dropBoards: dropCachedBoards,
};

/**
 * Resolve one matchday for one penka.
 *
 * The order is not negotiable:
 *
 * 1. **Gate** on this penka's resolution document. A redelivery finds it and
 *    stops before touching anyone's lives.
 * 2. **Load** the state and map it to contract types.
 * 3. **Ask the engine.** Every rule about who survives is `resolveMatchday`'s;
 *    this function only routes its three refusals. `already_resolved` is a
 *    second idempotency layer (the shared matchday can say "done" while this
 *    penka's marker is missing), while `matchday_not_locked` and
 *    `results_missing` are races with the operator and go back on the queue —
 *    **never acked as success**, or the matchday is silently dropped.
 * 4. **Apply** the effects verbatim and write the marker last.
 * 5. **Finish the shared matchday** if this was the last penka, and repair the
 *    caches the flip invalidated.
 * 6. **Rebuild this penka's board** so the next poll sees the new state.
 *
 * A thrown error means "retry me": the consumer nacks and RabbitMQ redelivers.
 */
export function createResolutionHandler(deps: ResolutionHandlerDeps): ResolutionHandler {
  const { db, redis, log } = deps;
  const now = deps.now ?? ((): Date => new Date());
  const steps: ResolutionSteps = { ...DEFAULT_STEPS, ...deps.steps };

  /**
   * Advance the league's matchday when this penka was the last one, then fix the
   * caches. Sibling boards were built while the matchday was still locked, so
   * they are dropped and rebuilt lazily by @penka/api on the next poll; this
   * penka's own board is rebuilt here, after the flip, so it never caches a
   * board that contradicts the resolution that just happened.
   */
  async function settleSharedState(
    command: ResolveMatchdayCommand,
    matchdayId: string,
  ): Promise<void> {
    const finalized = await steps.finalize({
      db,
      log,
      leagueId: command.leagueId,
      matchdayId,
      requestedAt: new Date(command.requestedAt),
    });
    if (finalized.resolved) {
      try {
        await steps.dropBoards(redis, finalized.penkaIds);
      } catch (error) {
        // Same call as the refresh below, and the stakes are higher: the flip has
        // already happened, so a redelivery finds the marker, no-ops, and lands on
        // the same dead Redis until the message reaches the DLQ — with everything
        // durable and nothing left to redo. A sibling board that outlives the flip
        // is stale for one TTL; @penka/api rebuilds it on the next miss.
        log.error(
          { matchdayId, penkaIds: finalized.penkaIds, err: error },
          'the matchday was resolved but the sibling boards were not dropped',
        );
      }
    }
  }

  return async function handle(command: ResolveMatchdayCommand): Promise<ResolutionResult> {
    const matchdayId = buildMatchdayId(command.leagueId, command.matchday);
    const context = { penkaId: command.penkaId, matchdayId };

    if (await steps.hasResolution(db, command.penkaId, matchdayId)) {
      log.info(context, 'already-resolved: this command has been applied before, nothing to do');
      // Not a plain return: the run that wrote that marker may have died before
      // finishing the shared matchday, and this is the retry that repairs it.
      await settleSharedState(command, matchdayId);
      return { status: 'skipped', reason: 'already-resolved' };
    }

    const state = await steps.load(db, command);
    if (state === null) {
      // Nothing a redelivery can fix — the penka, the matchday, or the pairing
      // between them is gone.
      log.warn(context, 'state-missing: no penka or matchday for this command');
      return { status: 'skipped', reason: 'state-missing' };
    }

    const resolved = resolveMatchday({
      matchday: state.matchday,
      entries: state.entries,
      picks: state.picks,
      matches: state.matches,
      settings: state.settings,
    });

    if (!resolved.ok) {
      if (resolved.code === 'already_resolved') {
        log.info(context, 'the matchday is already resolved; nothing to apply');
        return { status: 'skipped', reason: 'already_resolved' };
      }
      log.warn({ ...context, code: resolved.code }, 'not resolvable yet; asking for a retry');
      return { status: 'retry', reason: resolved.code };
    }

    await steps.apply({
      db,
      log,
      penkaId: command.penkaId,
      outcome: resolved.outcome,
      resolvedAt: now(),
    });
    log.info(
      { ...context, ...resolved.outcome.summary },
      'applied the matchday resolution for this penka',
    );

    await settleSharedState(command, matchdayId);

    try {
      await steps.refresh({
        db,
        redis,
        log,
        penkaId: command.penkaId,
        leagueId: command.leagueId,
        now: now(),
      });
    } catch (error) {
      // The board is a cache with a TTL and @penka/api rebuilds it on a miss.
      // Failing the message here would redeliver a resolution that is already
      // durable, which is a far worse outcome than a minute of stale board.
      log.error({ ...context, err: error }, 'resolution applied but the board cache was not refreshed');
    }

    return { status: 'applied', eliminated: resolved.outcome.eliminatedEntryIds.length };
  };
}
