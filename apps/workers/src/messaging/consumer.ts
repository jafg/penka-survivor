import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { Value } from '@sinclair/typebox/value';
import {
  RESOLUTION_QUEUE,
  ResolveMatchdayCommandSchema,
  SURVIVOR_COMMANDS_EXCHANGE,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import type { Logger } from '../logger';
import type { ResolutionHandler } from '../modules/resolution/handler';

/**
 * How many times this delivery has been attempted, written by this consumer.
 *
 * It exists because `nack(requeue: true)` cannot carry a counter: the broker's
 * own `x-death` array only accrues when a message is actually dead-lettered, so
 * a requeue loop is invisible and unbounded. A countable retry has to go back
 * through the exchange with the count written on it.
 */
export const ATTEMPT_HEADER = 'x-attempt';

/** Publish a retry copy of a delivery, carrying the next attempt number. */
export type RetryPublisher = (message: ConsumeMessage, attempt: number) => Promise<void>;

export interface ResolutionConsumerDeps {
  channel: Channel;
  log: Logger;
  /** Total attempts before the message is dead-lettered, including the first. */
  maxAttempts: number;
  /** Deliveries in flight at once. 1 is what buys the ordering note below. */
  prefetch: number;
  handle: ResolutionHandler;
  republish: RetryPublisher;
}

export interface RunningConsumer {
  consumerTag: string;
  /** Stop taking new deliveries and wait for the one in flight. */
  stop(): Promise<void>;
}

/**
 * Read the attempt counter off a delivery, defaulting to the first attempt.
 *
 * Header values come back from the broker as numbers, strings, or (for long
 * strings) buffers depending on how they were encoded, and a header this
 * consumer did not write is not to be trusted — anything that is not a positive
 * integer reads as attempt one.
 */
export function attemptOf(message: ConsumeMessage): number {
  const raw = message.properties.headers?.[ATTEMPT_HEADER];
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Republish a delivery to the exchange it came from with the attempt counter
 * bumped, and wait for the broker to confirm it.
 *
 * The copy keeps the original body and `messageId`: the id is the idempotency
 * anchor every downstream check keys on, so a retry that changed it would look
 * like a brand new command.
 *
 * It goes through `survivor.commands`, never straight to the queue — publishing
 * to a queue by name bypasses the binding and would silently stop working the
 * day resolution is sharded across more than one queue.
 *
 * There is deliberately **no backoff**: an MVP retry budget of three immediate
 * attempts is enough to ride out a close landing a moment after a resolve. The
 * scale path is a delayed-retry queue (a per-attempt TTL that dead-letters back
 * into `matchday.resolution`), which is why the counter lives in a header the
 * broker preserves rather than in memory.
 */
export function createRetryPublisher(channel: ConfirmChannel): RetryPublisher {
  return async function republish(message, attempt) {
    channel.publish(SURVIVOR_COMMANDS_EXCHANGE, message.fields.routingKey, message.content, {
      messageId: message.properties.messageId,
      persistent: true,
      contentType: 'application/json',
      headers: { ...message.properties.headers, [ATTEMPT_HEADER]: attempt },
    });
    // The caller acks the original only after this resolves: acking first would
    // drop the matchday whenever the republish did not reach the broker.
    await channel.waitForConfirms();
  };
}

/** A body that will never become valid, however many times it is redelivered. */
function parseCommand(message: ConsumeMessage): ResolveMatchdayCommand | null {
  let body: unknown;
  try {
    body = JSON.parse(message.content.toString());
  } catch {
    return null;
  }
  return Value.Check(ResolveMatchdayCommandSchema, body) ? body : null;
}

/**
 * Drain `matchday.resolution`.
 *
 * Three outcomes, and the difference between them is the whole failure design:
 *
 * - **Done** (applied or deliberately skipped) → ack.
 * - **Poison** (not JSON, or not the command schema) → `nack(requeue: false)`,
 *   straight to the dead-letter queue. No retry: the bytes will not change.
 * - **Not yet** (a race with the operator, or a handler that threw) → a counted
 *   retry through the exchange, up to `maxAttempts`, then a real
 *   `nack(requeue: false)` so the **broker** dead-letters it and writes the
 *   `x-death` trail an operator reads to see how it got there.
 *
 * `prefetch(1)` keeps one delivery in flight at a time. That is what gives a
 * penka's matchdays a defined order with a single consumer, and it is a
 * deliberate MVP limit: the scale path is a consistent-hash exchange keyed on
 * the penka (or one queue per shard), not a larger prefetch, which would let two
 * matchdays of the same penka resolve concurrently.
 */
export async function startResolutionConsumer(
  deps: ResolutionConsumerDeps,
): Promise<RunningConsumer> {
  const { channel, log, maxAttempts, prefetch, handle, republish } = deps;
  // Tracked as a set rather than a single promise so shutdown stays correct if
  // the prefetch is ever raised above 1.
  const inFlight = new Set<Promise<void>>();

  function deadLetter(message: ConsumeMessage, reason: string, detail: object): void {
    log.error({ ...detail, messageId: message.properties.messageId }, reason);
    channel.nack(message, false, false);
  }

  async function retryOrDeadLetter(
    message: ConsumeMessage,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const attempt = attemptOf(message);
    if (attempt >= maxAttempts) {
      deadLetter(message, 'attempts exhausted; dead-lettering the command', { ...detail, attempt });
      return;
    }
    try {
      await republish(message, attempt + 1);
      channel.ack(message);
      log.warn({ ...detail, attempt, next: attempt + 1 }, 'retrying the command');
    } catch (error) {
      // The broker will not take the counted copy. An uncounted requeue is worse
      // than a counted one and much better than leaving the delivery unacked,
      // which would pin the queue behind a message nobody is working on.
      log.error({ ...detail, err: error }, 'could not republish the retry; requeueing uncounted');
      channel.nack(message, false, true);
    }
  }

  async function process(message: ConsumeMessage): Promise<void> {
    const command = parseCommand(message);
    if (command === null) {
      deadLetter(message, 'poison message: not a resolution command', {
        body: message.content.toString().slice(0, 200),
      });
      return;
    }

    const detail = { penkaId: command.penkaId, matchday: command.matchday };
    let result;
    try {
      result = await handle(command);
    } catch (error) {
      log.error({ ...detail, err: error }, 'the resolution handler failed');
      await retryOrDeadLetter(message, detail);
      return;
    }

    if (result.status === 'retry') {
      await retryOrDeadLetter(message, { ...detail, reason: result.reason });
      return;
    }
    channel.ack(message);
  }

  await channel.prefetch(prefetch);
  const { consumerTag } = await channel.consume(
    RESOLUTION_QUEUE,
    (message) => {
      // RabbitMQ pushes null when the consumer is cancelled server-side; there
      // is no delivery tag to answer.
      if (message === null) {
        return;
      }
      const running = process(message)
        .catch((error: unknown) => {
          // Nothing above should throw — every path answers the delivery — so
          // this is the "the answer itself failed" case, e.g. a closed channel.
          log.error({ err: error }, 'unhandled failure while answering a delivery');
        })
        .finally(() => inFlight.delete(running));
      inFlight.add(running);
    },
    { noAck: false },
  );

  return {
    consumerTag,
    async stop() {
      // Cancel first so no new delivery arrives, then let the work in flight
      // finish and ack. Closing the connection first would nack it back onto
      // the queue mid-resolution.
      await channel.cancel(consumerTag);
      await Promise.allSettled([...inFlight]);
    },
  };
}
