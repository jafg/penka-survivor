import { MongoClient, type Db } from 'mongodb';
import { Redis } from 'ioredis';
import { connect, type ChannelModel } from 'amqplib';
import type { AppConfig } from './config';
import type { Logger } from './logger';
import { declareTopology } from './messaging/topology';
import { watchBrokerLifecycle } from './messaging/lifecycle';
import { createRetryPublisher, startResolutionConsumer } from './messaging/consumer';
import { createResolutionHandler } from './modules/resolution/handler';
import { ensureWorkerIndexes } from './modules/resolution/store';

export interface StartWorkerOptions {
  /**
   * Called at most once when the broker connection drops on its own. amqplib
   * does not reconnect, so the process is idle from that moment; the entrypoint
   * is what turns it into an exit code.
   */
  onBrokerLost?: (reason: Error | null) => void;
}

export interface RunningWorker {
  db: Db;
  /** Stop consuming, finish the message in flight, then let every connection go. */
  stop(): Promise<void>;
}

/**
 * The composition root: connect, declare, consume.
 *
 * There is no HTTP here and there never will be — a worker that answered a
 * health check would be an API. Liveness is the process being up and the queue
 * draining, which is what an operator watches in the RabbitMQ console.
 *
 * Two channels on one connection: a plain one to consume on, and a confirm
 * channel for retry republishes. They are separate because confirm mode is a
 * per-channel property and only the retry path needs to wait for the broker.
 *
 * Every connection fails fast at boot rather than queueing work against a
 * broker or database that is not there.
 */
export async function startWorker(
  config: AppConfig,
  log: Logger,
  options: StartWorkerOptions = {},
): Promise<RunningWorker> {
  const mongo = new MongoClient(config.mongoUrl);
  await mongo.connect();
  const db = mongo.db(config.mongoDbName);
  await ensureWorkerIndexes(db);

  const redis = new Redis(config.redisUrl, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
  await redis.ping();

  const connection: ChannelModel = await connect(config.rabbitUrl);
  const channel = await connection.createChannel();
  // Declared here too, with the same arguments the back office uses. Whichever
  // process boots first creates the topology; a disagreement about the queue's
  // arguments is a PRECONDITION_FAILED at boot rather than a message that
  // quietly never arrives.
  await declareTopology(channel);
  const retryChannel = await connection.createConfirmChannel();
  const watcher = watchBrokerLifecycle({
    connection,
    channels: [channel, retryChannel],
    log,
    onLost: options.onBrokerLost ?? (() => undefined),
  });

  const consumer = await startResolutionConsumer({
    channel,
    log,
    maxAttempts: config.maxAttempts,
    prefetch: config.prefetch,
    handle: createResolutionHandler({ db, redis, log }),
    republish: createRetryPublisher(retryChannel),
  });
  log.info(
    { prefetch: config.prefetch, maxAttempts: config.maxAttempts, consumerTag: consumer.consumerTag },
    'consuming matchday resolutions',
  );

  return {
    db,
    async stop() {
      // Order matters: stop taking work, let the in-flight message ack, and only
      // then drop the connections it needed to finish.
      await consumer.stop();
      // Before the close, or our own shutdown reports itself as a lost broker.
      watcher.stopWatching();
      await connection.close();
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
      await mongo.close();
      log.info('worker stopped');
    },
  };
}
