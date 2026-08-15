import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  RESOLUTION_BINDING_KEY,
  RESOLUTION_DLQ,
  RESOLUTION_QUEUE,
  ResolveMatchdayCommandSchema,
  SURVIVOR_COMMANDS_EXCHANGE,
  SURVIVOR_DLX,
  resolveMessageId,
  resolveRoutingKey,
} from './messaging';

const command = {
  penkaId: '65f0c0ffee0000000000abcd',
  leagueId: 'copa-libertadores',
  matchday: 1,
  requestedAt: '2026-08-15T14:00:00.000Z',
};

describe('topology names', () => {
  it('names one command exchange and its dead-letter pair', () => {
    expect(SURVIVOR_COMMANDS_EXCHANGE).toBe('survivor.commands');
    expect(RESOLUTION_QUEUE).toBe('matchday.resolution');
    expect(SURVIVOR_DLX).toBe('survivor.dlx');
    expect(RESOLUTION_DLQ).toBe('matchday.resolution.dlq');
  });

  it('binds the resolution queue to every resolve command, whatever the penka', () => {
    // One queue drains the fan-out: the routing key carries the penka so a future
    // consumer can shard on it, but today every message lands in the same queue.
    expect(RESOLUTION_BINDING_KEY).toBe('matchday.resolve.*');
    expect(resolveRoutingKey('65f0c0ffee0000000000abcd')).toMatch(/^matchday\.resolve\./);
  });
});

describe('resolveRoutingKey', () => {
  it('puts the penka in the last segment, where the binding wildcard matches', () => {
    expect(resolveRoutingKey('65f0c0ffee0000000000abcd')).toBe(
      'matchday.resolve.65f0c0ffee0000000000abcd',
    );
  });

  it('keeps one topic segment, so `*` never misses a penka', () => {
    // AMQP `*` matches exactly ONE word: a routing key with an extra dot would
    // be published to an exchange nobody is listening on and silently dropped.
    expect(resolveRoutingKey('65f0c0ffee0000000000abcd').split('.')).toHaveLength(3);
  });
});

describe('resolveMessageId', () => {
  it('is deterministic — the same penka and matchday always name the same command', () => {
    // This is the idempotency anchor: a redelivery, a retried publish and a
    // duplicate from a crashed multi-step write all carry the same id, so the
    // worker can recognize work it has already done.
    expect(resolveMessageId('65f0c0ffee0000000000abcd', 1)).toBe(
      'resolve:65f0c0ffee0000000000abcd:1',
    );
    expect(resolveMessageId('65f0c0ffee0000000000abcd', 1)).toBe(
      resolveMessageId('65f0c0ffee0000000000abcd', 1),
    );
  });

  it('separates matchdays and penkas', () => {
    expect(resolveMessageId('a', 1)).not.toBe(resolveMessageId('a', 2));
    expect(resolveMessageId('a', 1)).not.toBe(resolveMessageId('b', 1));
  });
});

describe('ResolveMatchdayCommandSchema', () => {
  it('accepts the command the back office publishes', () => {
    expect(Value.Check(ResolveMatchdayCommandSchema, command)).toBe(true);
  });

  it('carries the league, so a worker never re-reads the penka to find the calendar', () => {
    expect(Value.Check(ResolveMatchdayCommandSchema, { ...command, leagueId: undefined })).toBe(
      false,
    );
  });

  it('addresses a matchday by number, not by id', () => {
    // The worker derives the document id with matchdayId(leagueId, matchday):
    // a number cannot be a stale id from a league the penka has since left.
    expect(Value.Check(ResolveMatchdayCommandSchema, { ...command, matchday: '1' })).toBe(false);
    expect(Value.Check(ResolveMatchdayCommandSchema, { ...command, matchday: 0 })).toBe(false);
    expect(Value.Check(ResolveMatchdayCommandSchema, { ...command, matchday: 1.5 })).toBe(false);
  });

  it('timestamps the request as an ISO string, since JSON has no dates', () => {
    expect(
      Value.Check(ResolveMatchdayCommandSchema, { ...command, requestedAt: 'yesterday' }),
    ).toBe(false);
    expect(
      Value.Check(ResolveMatchdayCommandSchema, { ...command, requestedAt: 1_755_266_400_000 }),
    ).toBe(false);
  });

  it('rejects an extra field rather than carrying it to a worker that ignores it', () => {
    expect(Value.Check(ResolveMatchdayCommandSchema, { ...command, force: true })).toBe(false);
  });
});
