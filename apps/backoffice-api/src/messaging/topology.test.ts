import { describe, expect, it, vi } from 'vitest';
import type { Channel } from 'amqplib';
import { declareTopology } from './topology';

function fakeChannel() {
  const channel = {
    assertExchange: vi.fn().mockResolvedValue({}),
    assertQueue: vi.fn().mockResolvedValue({}),
    bindQueue: vi.fn().mockResolvedValue({}),
  };
  return channel as unknown as Channel & typeof channel;
}

describe('declareTopology', () => {
  it('declares the command exchange and its dead-letter exchange as durable topics', async () => {
    const channel = fakeChannel();

    await declareTopology(channel);

    expect(channel.assertExchange).toHaveBeenCalledWith('survivor.commands', 'topic', {
      durable: true,
    });
    expect(channel.assertExchange).toHaveBeenCalledWith('survivor.dlx', 'topic', { durable: true });
  });

  it('survives a broker restart: every queue is durable', async () => {
    // A matchday resolution that vanishes because the broker bounced would leave
    // players eliminated in some penkas and not others.
    const channel = fakeChannel();

    await declareTopology(channel);

    for (const call of channel.assertQueue.mock.calls) {
      expect(call[1]).toMatchObject({ durable: true });
    }
  });

  it('routes a rejected command to the dead-letter queue instead of losing it', async () => {
    const channel = fakeChannel();

    await declareTopology(channel);

    expect(channel.assertQueue).toHaveBeenCalledWith('matchday.resolution', {
      durable: true,
      deadLetterExchange: 'survivor.dlx',
      deadLetterRoutingKey: 'matchday.resolution.dlq',
    });
    expect(channel.assertQueue).toHaveBeenCalledWith('matchday.resolution.dlq', { durable: true });
  });

  it('binds the resolution queue to every penka, and the DLQ to its own key', async () => {
    const channel = fakeChannel();

    await declareTopology(channel);

    expect(channel.bindQueue).toHaveBeenCalledWith(
      'matchday.resolution',
      'survivor.commands',
      'matchday.resolve.*',
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'matchday.resolution.dlq',
      'survivor.dlx',
      'matchday.resolution.dlq',
    );
  });

  it('is idempotent, so every process can declare it on boot', async () => {
    // Nobody owns the topology: whichever of the API and the workers starts
    // first creates it, and neither waits on a migration having run.
    const channel = fakeChannel();

    await declareTopology(channel);
    await declareTopology(channel);

    expect(channel.assertExchange).toHaveBeenCalledTimes(4);
    expect(channel.assertQueue).toHaveBeenCalledTimes(4);
  });
});
