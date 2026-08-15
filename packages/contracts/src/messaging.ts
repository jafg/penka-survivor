import { Type, type Static } from '@sinclair/typebox';
import { IdSchema, IsoDateTimeSchema } from './domain';
import { StrictObject } from './strict';

/**
 * The RabbitMQ topology, named once for every process that touches it: the back
 * office declares and publishes, the workers declare and consume. Both declare
 * it idempotently on boot, so whichever starts first creates it and neither
 * depends on a migration having run.
 *
 * A queue name is a name no compiler checks — a worker listening on a queue
 * nobody publishes to just sits there silently — which is exactly why it lives
 * in the contract rather than in whichever app booted first.
 */

/** Topic, durable. Commands only: a request to do something, addressed to one consumer. */
export const SURVIVOR_COMMANDS_EXCHANGE = 'survivor.commands';

/** Durable queue draining the resolution fan-out. */
export const RESOLUTION_QUEUE = 'matchday.resolution';

/**
 * `*` matches exactly one topic word, so this catches every penka's command and
 * nothing else. The penka rides in the routing key anyway: it costs nothing
 * today and is what a second queue would shard on tomorrow.
 */
export const RESOLUTION_BINDING_KEY = 'matchday.resolve.*';

/** Dead letters: a command the worker rejects lands here instead of being lost or requeued forever. */
export const SURVIVOR_DLX = 'survivor.dlx';
export const RESOLUTION_DLQ = 'matchday.resolution.dlq';

/** `matchday.resolve.{penkaId}` — one message per penka, one routing key per penka. */
export function resolveRoutingKey(penkaId: string): string {
  return `matchday.resolve.${penkaId}`;
}

/**
 * `resolve:{penkaId}:{matchday}` — the idempotency anchor, deterministic on
 * purpose. Publishing happens before the matchday is marked as requested, so a
 * crash in between leaves duplicate commands; a redelivery does the same. Both
 * carry this id, so a worker recognizes work it has already done instead of
 * eliminating a player twice.
 */
export function resolveMessageId(penkaId: string, matchday: number): string {
  return `resolve:${penkaId}:${matchday}`;
}

/**
 * The body of a resolution command. It carries the league so the worker can
 * derive the matchday's document id (`matchdayId(leagueId, matchday)`) without
 * reading the penka first, and addresses the matchday by NUMBER rather than by
 * id — a number cannot silently point at a calendar the penka is not on.
 */
export const ResolveMatchdayCommandSchema = StrictObject({
  penkaId: IdSchema,
  leagueId: IdSchema,
  matchday: Type.Integer({ minimum: 1 }),
  requestedAt: IsoDateTimeSchema,
});
export type ResolveMatchdayCommand = Static<typeof ResolveMatchdayCommandSchema>;
