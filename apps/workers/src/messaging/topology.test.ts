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
    const channel = fakeChannel();

    await declareTopology(channel);

    for (const call of channel.assertQueue.mock.calls) {
      expect(call[1]).toMatchObject({ durable: true });
    }
  });

  it('routes a rejected command to the dead-letter queue instead of losing it', async () => {
    // These arguments are also the agreement with @penka/backoffice-api, which
    // declares the same queue from its own copy: declaring one queue twice with
    // DIFFERENT arguments is a PRECONDITION_FAILED that closes the channel, so
    // whichever process booted second would die. Every name comes from
    // @penka/contracts; these two options are what this test pins.
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
    const channel = fakeChannel();

    await declareTopology(channel);
    await declareTopology(channel);

    expect(channel.assertExchange).toHaveBeenCalledTimes(4);
    expect(channel.assertQueue).toHaveBeenCalledTimes(4);
  });
});
