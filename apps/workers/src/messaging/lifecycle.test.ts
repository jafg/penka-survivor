import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Channel, ChannelModel } from 'amqplib';
import { watchBrokerLifecycle } from './lifecycle';
import { captureLogs } from '../test-support/logs';

/**
 * A real EventEmitter, because the behaviour under test is Node's: emitting
 * `error` with nobody listening does not log, it THROWS. A stub with a `.on`
 * spy would accept the listeners and prove nothing about what happens without
 * them.
 */
function fakeConnection() {
  return new EventEmitter() as unknown as ChannelModel & EventEmitter;
}

function fakeChannel() {
  return new EventEmitter() as unknown as Channel & EventEmitter;
}

describe('watchBrokerLifecycle', () => {
  it('swallows a broker error instead of letting it take the process down', () => {
    const connection = fakeConnection();
    const { logger, lines } = captureLogs();

    watchBrokerLifecycle({ connection, channels: [], log: logger, onLost: vi.fn() });

    // Unhandled, this is an uncaught exception: amqplib emits `error` on the
    // connection whenever the broker goes away mid-flight, and a worker that
    // dies there loses the message it was resolving with no line explaining why.
    expect(() => connection.emit('error', new Error('broker went away'))).not.toThrow();
    expect(lines.at(-1)).toMatchObject({ level: 50, err: { message: 'broker went away' } });
  });

  it('swallows a channel error too', () => {
    const connection = fakeConnection();
    const channel = fakeChannel();
    const { logger, lines } = captureLogs();

    watchBrokerLifecycle({ connection, channels: [channel], log: logger, onLost: vi.fn() });

    expect(() => channel.emit('error', new Error('PRECONDITION_FAILED'))).not.toThrow();
    expect(lines.at(-1)).toMatchObject({ err: { message: 'PRECONDITION_FAILED' } });
  });

  it('reports the connection as lost when it closes on its own', () => {
    const connection = fakeConnection();
    const onLost = vi.fn();
    const { logger } = captureLogs();

    watchBrokerLifecycle({ connection, channels: [], log: logger, onLost });

    // A closed connection means nothing is consuming any more. The process would
    // otherwise stay up, healthy-looking and idle, while the queue grew — the
    // failure an operator notices last.
    connection.emit('close');

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('reports it once, however many things fail on the way down', () => {
    const connection = fakeConnection();
    const onLost = vi.fn();
    const { logger } = captureLogs();

    watchBrokerLifecycle({ connection, channels: [fakeChannel()], log: logger, onLost });

    connection.emit('error', new Error('broker went away'));
    connection.emit('close');
    connection.emit('close');

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('carries the error that preceded the close, not an empty reason', () => {
    const connection = fakeConnection();
    const onLost = vi.fn();
    const { logger } = captureLogs();

    watchBrokerLifecycle({ connection, channels: [], log: logger, onLost });

    // amqplib emits `error` and then `close`; the close itself says nothing, so
    // the reason an operator needs is the one from the event before it.
    connection.emit('error', new Error('broker went away'));
    connection.emit('close');

    expect(onLost).toHaveBeenCalledWith(expect.objectContaining({ message: 'broker went away' }));
  });

  it('stays quiet when the worker is the one closing the connection', () => {
    const connection = fakeConnection();
    const onLost = vi.fn();
    const { logger } = captureLogs();

    const watcher = watchBrokerLifecycle({ connection, channels: [], log: logger, onLost });

    // `stop()` closes the connection deliberately, which emits the same `close`
    // as a broker crash. Calling onLost here would turn a graceful shutdown into
    // a reported failure — and, in production, an exit code that says the worker
    // died when it was asked to leave.
    watcher.stopWatching();
    connection.emit('close');

    expect(onLost).not.toHaveBeenCalled();
  });

  it('keeps swallowing errors after it stops watching', () => {
    const connection = fakeConnection();
    const { logger } = captureLogs();

    const watcher = watchBrokerLifecycle({ connection, channels: [], log: logger, onLost: vi.fn() });
    watcher.stopWatching();

    // Shutdown is exactly when a broker that is already unhappy emits one last
    // error; removing the listener would make a clean stop crash the process.
    expect(() => connection.emit('error', new Error('closing'))).not.toThrow();
  });
});
