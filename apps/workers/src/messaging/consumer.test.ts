import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { RESOLUTION_QUEUE, SURVIVOR_COMMANDS_EXCHANGE, resolveRoutingKey } from '@penka/contracts';
import {
  ATTEMPT_HEADER,
  attemptOf,
  createRetryPublisher,
  startResolutionConsumer,
} from './consumer';
import { captureLogs } from '../test-support/logs';
import type { ResolutionResult } from '../modules/resolution/handler';

const PENKA_ID = '6a80b60ffda322125df55e5f';
const COMMAND = {
  penkaId: PENKA_ID,
  leagueId: 'copa-libertadores',
  matchday: 1,
  requestedAt: '2026-08-21T21:00:00.000Z',
};

function message(body: unknown, headers: Record<string, unknown> = {}): ConsumeMessage {
  const content = typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
  return {
    content,
    fields: { routingKey: resolveRoutingKey(PENKA_ID), deliveryTag: 1, redelivered: false },
    properties: { messageId: `resolve:${PENKA_ID}:1`, headers },
  } as unknown as ConsumeMessage;
}

function fakeChannel() {
  let onMessage: ((msg: ConsumeMessage | null) => void) | undefined;
  const channel = {
    prefetch: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn(async (_queue: string, handler: (msg: ConsumeMessage | null) => void) => {
      onMessage = handler;
      return { consumerTag: 'tag-1' };
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    ack: vi.fn(),
    nack: vi.fn(),
  };
  return {
    channel: channel as unknown as Channel,
    spies: channel,
    deliver: async (msg: ConsumeMessage) => {
      onMessage?.(msg);
      // Let the handler's promise chain settle before asserting.
      await vi.waitFor(() => {
        expect(channel.ack.mock.calls.length + channel.nack.mock.calls.length).toBeGreaterThan(0);
      });
    },
  };
}

async function start(
  handle: (command: never) => Promise<ResolutionResult>,
  options: {
    maxAttempts?: number;
    prefetch?: number;
    republish?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const logs = captureLogs();
  const { channel, spies, deliver } = fakeChannel();
  const republish = options.republish ?? vi.fn().mockResolvedValue(undefined);
  const consumer = await startResolutionConsumer({
    channel,
    log: logs.logger,
    maxAttempts: options.maxAttempts ?? 3,
    prefetch: options.prefetch ?? 1,
    handle: handle as never,
    republish,
  });
  return { consumer, spies, deliver, republish, logs };
}

const applied = vi.fn().mockResolvedValue({ status: 'applied', eliminated: 0 });

describe('startResolutionConsumer', () => {
  beforeEach(() => {
    applied.mockClear();
  });

  it('takes one message at a time from the resolution queue', async () => {
    // prefetch 1 is what makes a single worker process a penka's matchdays in
    // order, and it is the MVP's answer to ordering. The scale path is a
    // consistent-hash exchange or one queue per shard, not a bigger prefetch.
    const { spies } = await start(applied);

    expect(spies.prefetch).toHaveBeenCalledWith(1);
    expect(spies.consume).toHaveBeenCalledWith(RESOLUTION_QUEUE, expect.any(Function), {
      noAck: false,
    });
  });

  it('takes the prefetch it was configured with, so the setting is not a lie', async () => {
    // Raising it above 1 trades away the ordering guarantee — see the note on
    // startResolutionConsumer. The knob exists; the default is what protects it.
    const { spies } = await start(applied, { prefetch: 5 });

    expect(spies.prefetch).toHaveBeenCalledWith(5);
  });

  it('acks a command it resolved', async () => {
    const { spies, deliver } = await start(applied);

    await deliver(message(COMMAND));

    expect(applied).toHaveBeenCalledWith(COMMAND);
    expect(spies.ack).toHaveBeenCalledOnce();
    expect(spies.nack).not.toHaveBeenCalled();
  });

  it('acks a command it deliberately skipped', async () => {
    const skip = vi.fn().mockResolvedValue({ status: 'skipped', reason: 'already-resolved' });
    const { spies, deliver } = await start(skip);

    await deliver(message(COMMAND));

    expect(spies.ack).toHaveBeenCalledOnce();
  });

  it('dead-letters a body that is not JSON, without ever requeueing it', async () => {
    // A poison message never becomes valid. Requeueing it would spin the
    // consumer forever on the same bytes.
    const { spies, deliver, logs, republish } = await start(applied);

    await deliver(message('{ not json'));

    expect(spies.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(republish).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.lines)).toContain('poison');
  });

  it('dead-letters a body that does not match the command schema', async () => {
    // Valid JSON, wrong shape: same conclusion, and the schema from
    // @penka/contracts is the only judge of it.
    const { spies, deliver } = await start(applied);

    await deliver(message({ penkaId: PENKA_ID, matchday: 'one' }));

    expect(spies.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(applied).not.toHaveBeenCalled();
  });

  it('republishes with a counted attempt when the matchday is not ready', async () => {
    // `nack(requeue: true)` cannot carry a counter — x-death only accrues when a
    // message is actually dead-lettered — so a countable retry has to go back
    // through the exchange with the attempt written on it.
    const retry = vi.fn().mockResolvedValue({ status: 'retry', reason: 'matchday_not_locked' });
    const { spies, deliver, republish } = await start(retry);

    await deliver(message(COMMAND));

    expect(republish).toHaveBeenCalledWith(expect.anything(), 2);
    // The original is acked only after the copy is on the broker: acking first
    // would drop the matchday if the republish failed.
    expect(spies.ack).toHaveBeenCalledOnce();
    expect(spies.nack).not.toHaveBeenCalled();
  });

  it('retries a handler that threw, the same way', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('mongo is down'));
    const { deliver, republish, logs } = await start(boom);

    await deliver(message(COMMAND));

    expect(republish).toHaveBeenCalledWith(expect.anything(), 2);
    expect(JSON.stringify(logs.lines)).toContain('mongo is down');
  });

  it('counts the attempt the message arrives with', async () => {
    const retry = vi.fn().mockResolvedValue({ status: 'retry', reason: 'results_missing' });
    const { deliver, republish } = await start(retry);

    await deliver(message(COMMAND, { [ATTEMPT_HEADER]: 2 }));

    expect(republish).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('dead-letters through the broker once the attempts are spent', async () => {
    // A real `nack(requeue: false)` rather than a republish to the DLQ: only the
    // broker's own dead-lettering writes the `x-death` trail an operator reads
    // to see how the message got there.
    const retry = vi.fn().mockResolvedValue({ status: 'retry', reason: 'matchday_not_locked' });
    const { spies, deliver, republish, logs } = await start(retry, { maxAttempts: 3 });

    await deliver(message(COMMAND, { [ATTEMPT_HEADER]: 3 }));

    expect(spies.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(republish).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.lines)).toContain('matchday_not_locked');
  });

  it('falls back to a plain requeue when it cannot even republish', async () => {
    // The broker is unreachable for publishing but the delivery still needs an
    // answer. An uncounted requeue is worse than a counted one and better than
    // an unacked message pinning the queue.
    const retry = vi.fn().mockResolvedValue({ status: 'retry', reason: 'results_missing' });
    const republish = vi.fn().mockRejectedValue(new Error('channel closed'));
    const { spies, deliver } = await start(retry, { republish });

    await deliver(message(COMMAND));

    expect(spies.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    expect(spies.ack).not.toHaveBeenCalled();
  });

  it('stops consuming before it lets go', async () => {
    // Graceful shutdown: cancel first so no new delivery arrives, then let the
    // in-flight one finish. Closing the connection first would nack it.
    const { consumer, spies } = await start(applied);

    await consumer.stop();

    expect(spies.cancel).toHaveBeenCalledWith('tag-1');
  });

  it('waits for the message in flight before reporting itself stopped', async () => {
    let release = (): void => {};
    const slow = vi.fn(
      async () =>
        new Promise((resolve) => {
          release = (): void => resolve({ status: 'applied', eliminated: 0 });
        }),
    );
    const { consumer, spies, deliver } = await start(slow as never);

    const delivered = deliver(message(COMMAND));
    const stopped = consumer.stop().then(() => 'stopped');
    expect(await Promise.race([stopped, Promise.resolve('still working')])).toBe('still working');

    release();
    await delivered;
    expect(await stopped).toBe('stopped');
    expect(spies.ack).toHaveBeenCalledOnce();
  });

  it('ignores the null delivery the broker sends when a consumer is cancelled', async () => {
    // RabbitMQ pushes `null` to signal the consumer was cancelled server-side.
    // Acking or nacking that would throw on a delivery tag that does not exist.
    const logs = captureLogs();
    const { channel, spies } = fakeChannel();
    await startResolutionConsumer({
      channel,
      log: logs.logger,
      maxAttempts: 3,
      prefetch: 1,
      handle: applied as never,
      republish: vi.fn(),
    });

    const [, onMessage] = spies.consume.mock.calls[0] as [
      string,
      (msg: ConsumeMessage | null) => void,
    ];
    onMessage(null);

    expect(spies.ack).not.toHaveBeenCalled();
    expect(spies.nack).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
  });
});

describe('attemptOf', () => {
  it('reads a first delivery as attempt one', () => {
    expect(attemptOf(message(COMMAND))).toBe(1);
  });

  it('reads the counter this consumer wrote', () => {
    expect(attemptOf(message(COMMAND, { [ATTEMPT_HEADER]: 3 }))).toBe(3);
  });

  it('reads a header the broker handed back as a string', () => {
    // Header values survive a round trip through the broker as strings often
    // enough that trusting the type would silently reset the count to one.
    expect(attemptOf(message(COMMAND, { [ATTEMPT_HEADER]: '2' }))).toBe(2);
  });

  it('falls back to one on a header that is not a count', () => {
    expect(attemptOf(message(COMMAND, { [ATTEMPT_HEADER]: 'many' }))).toBe(1);
    expect(attemptOf(message(COMMAND, { [ATTEMPT_HEADER]: 0 }))).toBe(1);
  });
});

describe('createRetryPublisher', () => {
  function fakeConfirmChannel() {
    const publish = vi.fn().mockReturnValue(true);
    const waitForConfirms = vi.fn().mockResolvedValue(undefined);
    return { channel: { publish, waitForConfirms } as unknown as ConfirmChannel, publish, waitForConfirms };
  }

  it('sends the retry back through the exchange, never straight to the queue', async () => {
    // Publishing to the queue by name would bypass the binding and quietly stop
    // working the day resolution is sharded across more than one queue.
    const { channel, publish } = fakeConfirmChannel();

    await createRetryPublisher(channel)(message(COMMAND), 2);

    const [exchange, routingKey] = publish.mock.calls[0] as [string, string];
    expect(exchange).toBe(SURVIVOR_COMMANDS_EXCHANGE);
    expect(routingKey).toBe(resolveRoutingKey(PENKA_ID));
  });

  it('keeps the body and the message id byte for byte', async () => {
    // The message id is the idempotency anchor: a retry that changed it would be
    // a different command as far as every downstream check is concerned.
    const { channel, publish } = fakeConfirmChannel();
    const original = message(COMMAND);

    await createRetryPublisher(channel)(original, 2);

    const [, , body, options] = publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      { messageId: string; persistent: boolean; headers: Record<string, unknown> },
    ];
    expect(body.equals(original.content)).toBe(true);
    expect(options.messageId).toBe(original.properties.messageId);
    expect(options.persistent).toBe(true);
    expect(options.headers[ATTEMPT_HEADER]).toBe(2);
  });

  it('waits for the broker to confirm before the caller acks the original', async () => {
    // `publish()` alone only says the bytes reached the client's buffer. Acking
    // on that would lose the matchday if the broker died in between.
    const { channel, waitForConfirms } = fakeConfirmChannel();

    await createRetryPublisher(channel)(message(COMMAND), 2);

    expect(waitForConfirms).toHaveBeenCalledOnce();
  });
});
