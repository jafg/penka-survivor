import { loadConfig, type AppConfig } from './config';
import { createLogger } from './logger';
import { startWorker } from './worker';

function bootConfig(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    // The logger is not up yet — write the validation report directly.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const config = bootConfig();
const log = createLogger(config.logLevel);

/**
 * A dropped broker connection is fatal on purpose. amqplib does not reconnect,
 * so from that point the process consumes nothing while still looking alive —
 * exiting hands the problem to whatever supervises the container, which is the
 * only thing here that knows how to start a new one.
 */
const worker = await startWorker(config, log, {
  onBrokerLost: () => {
    process.exit(1);
  },
}).catch((error: unknown) => {
  log.error({ err: error }, 'the worker could not start');
  process.exit(1);
});

/**
 * Graceful shutdown. A container gets SIGTERM and a terminal gets SIGINT; both
 * mean the same thing here — stop taking deliveries, finish the matchday being
 * resolved, then let go. A second signal is ignored rather than forcing an exit
 * mid-resolution: the point of waiting is that a half-applied matchday is the
 * expensive failure.
 */
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) {
      log.warn({ signal }, 'already shutting down; finishing the message in flight');
      return;
    }
    stopping = true;
    log.info({ signal }, 'shutting down');
    worker
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error({ err: error }, 'failed to shut down cleanly');
        process.exit(1);
      });
  });
}
