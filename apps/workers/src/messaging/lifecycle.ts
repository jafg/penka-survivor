import type { Channel, ChannelModel } from 'amqplib';
import type { Logger } from '../logger';

export interface BrokerLifecycleInput {
  connection: ChannelModel;
  /** Every channel opened on it; each one emits its own errors. */
  channels: readonly Channel[];
  log: Logger;
  /**
   * Called at most once, when the link to the broker is gone and this process
   * cannot consume any more. Not called for a shutdown the worker asked for.
   */
  onLost: (reason: Error | null) => void;
}

export interface BrokerWatcher {
  /** Stop reporting a close as a failure — the worker is closing it on purpose. */
  stopWatching(): void;
}

/**
 * Keep a broker failure from taking the process out sideways, and make sure it
 * is not silent either.
 *
 * amqplib's connection and channels are EventEmitters, so an `error` with no
 * listener is an uncaught exception: a broker restart would kill the worker with
 * a stack trace that never mentions the message it was resolving. Listening
 * turns that into a log line.
 *
 * The opposite failure is worse and is why `onLost` exists. amqplib does not
 * reconnect. Once the connection closes, the consumer is gone but the process is
 * still up, still passing whatever the platform calls healthy, while the queue
 * grows behind it. The caller decides what to do about that (`index.ts` exits so
 * the supervisor restarts); the one thing this must not do is let it pass
 * unnoticed.
 */
export function watchBrokerLifecycle(input: BrokerLifecycleInput): BrokerWatcher {
  const { connection, channels, log, onLost } = input;
  let lastError: Error | null = null;
  let reported = false;
  let watching = true;

  const record = (source: string) => (error: Error) => {
    lastError = error;
    log.error({ err: error, source }, 'the broker connection reported an error');
  };

  connection.on('error', record('connection'));
  for (const channel of channels) {
    channel.on('error', record('channel'));
  }

  connection.on('close', () => {
    // The error listeners stay attached after stopWatching: a broker that is
    // already unhappy tends to emit one last error precisely while closing, and
    // removing them would make a clean shutdown crash.
    if (!watching || reported) {
      return;
    }
    reported = true;
    log.error({ err: lastError }, 'the broker connection closed; this worker is no longer consuming');
    onLost(lastError);
  });

  return {
    stopWatching() {
      watching = false;
    },
  };
}
