import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { MongoClient, type Db } from 'mongodb';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { buildApp as buildPlayerApp } from '@penka/api/src/app';
import { buildApp as buildAdminApp } from '@penka/backoffice-api/src/app';
import {
  RESOLUTION_DLQ,
  RESOLUTION_QUEUE,
  SURVIVOR_COMMANDS_EXCHANGE,
  resolveMessageId,
  resolveRoutingKey,
  type ResolveMatchdayCommand,
} from '@penka/contracts';
import type { AppConfig } from '../../src/config';
import { declareTopology } from '../../src/messaging/topology';
import { startWorker, type RunningWorker } from '../../src/worker';
import { captureLogs } from '../../src/test-support/logs';

/**
 * This package's own harness. It starts the same three images
 * `infra/docker-compose.yml` runs and then drives the **whole** pipeline: a
 * player creates a penka and picks through @penka/api, an operator closes the
 * matchday and presses resolve through @penka/backoffice-api, the real
 * publisher puts a real command on a real broker, and the worker under test
 * consumes it. Nothing here is mocked, because the parts that could drift are
 * exactly the parts between the processes.
 *
 * Both APIs are devDependencies for this reason, and nothing in `src/` may
 * import either of them.
 */
export interface TestInfra {
  mongoUrl: string;
  redisUrl: string;
  rabbitUrl: string;
  stop(): Promise<void>;
}

/** Same images as infra/docker-compose.yml, on random host ports. */
export async function startInfra(): Promise<TestInfra> {
  const [mongo, redis, rabbit] = await Promise.all([
    new GenericContainer('mongo:7').withExposedPorts(27017).start(),
    new GenericContainer('redis:7').withExposedPorts(6379).start(),
    // The AMQP port accepts connections before the broker will serve them, so
    // wait for the line that says it is actually up.
    new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .withStartupTimeout(120_000)
      .start(),
  ]);

  return {
    mongoUrl: `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}`,
    redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    rabbitUrl: `amqp://${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
    stop: async () => {
      await Promise.all([mongo.stop(), redis.stop(), rabbit.stop()]);
    },
  };
}

export const TEST_ADMIN_KEY = 'integration-test-admin-key-0123456789';

export function adminHeaders(): Record<string, string> {
  return { 'x-admin-key': TEST_ADMIN_KEY };
}

/** A fresh database name per test, so no two tests can see each other's writes. */
export function freshDbName(): string {
  return `penka-test-${randomUUID().slice(0, 8)}`;
}

/**
 * The worker's config against the started containers.
 *
 * `mongoDbName` is **required**, not generated: the worker and the two APIs
 * seeding the test must share one database, and a helper that quietly invented
 * a fresh one per call would give a green test where the worker resolved an
 * empty database.
 */
export function makeWorkerConfig(
  infra: TestInfra,
  mongoDbName: string,
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return {
    mongoUrl: infra.mongoUrl,
    mongoDbName,
    redisUrl: infra.redisUrl,
    rabbitUrl: infra.rabbitUrl,
    prefetch: 1,
    maxAttempts: 3,
    logLevel: 'silent',
    ...overrides,
  };
}

export function buildPlayerApi(infra: TestInfra, mongoDbName: string): FastifyInstance {
  return buildPlayerApp({
    config: {
      port: 0,
      mongoUrl: infra.mongoUrl,
      mongoDbName,
      redisUrl: infra.redisUrl,
      jwtSecret: 'integration-test-secret-0123456789abcdef',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604_800,
      rateLimitMax: 1000,
      trustProxy: false,
    },
  });
}

export function buildAdminApi(infra: TestInfra, mongoDbName: string): FastifyInstance {
  return buildAdminApp({
    config: {
      port: 0,
      mongoUrl: infra.mongoUrl,
      mongoDbName,
      redisUrl: infra.redisUrl,
      rabbitUrl: infra.rabbitUrl,
      adminApiKey: TEST_ADMIN_KEY,
    },
  });
}

/** Everything one test needs, torn down in the reverse order it was built. */
export interface TestStack {
  db: Db;
  redis: Redis;
  player: FastifyInstance;
  admin: FastifyInstance;
  /** The config every worker of this stack is started with. */
  config: AppConfig;
  logs: Record<string, unknown>[];
  mongoDbName: string;
  /**
   * Start the worker now. Called for you unless `withoutWorker` was set — the
   * tests that pass it need the queue to have a message in it *before* any
   * consumer exists.
   */
  startWorkerNow(): Promise<RunningWorker>;
  stop(): Promise<void>;
}

export interface StackOptions {
  /** Redis database index; this package owns /11 and /12. */
  redisDb: number;
  workerConfig?: Partial<AppConfig>;
  /** Do not start the worker yet — the test will call `startWorkerNow`. */
  withoutWorker?: boolean;
}

export async function startStack(infra: TestInfra, options: StackOptions): Promise<TestStack> {
  const mongoDbName = freshDbName();
  const redisUrl = `${infra.redisUrl}/${options.redisDb}`;
  const scoped: TestInfra = { ...infra, redisUrl };
  const config = makeWorkerConfig(scoped, mongoDbName, options.workerConfig);

  const player = buildPlayerApi(scoped, mongoDbName);
  const admin = buildAdminApi(scoped, mongoDbName);
  await Promise.all([player.ready(), admin.ready()]);

  const mongo = new MongoClient(infra.mongoUrl);
  await mongo.connect();
  const db = mongo.db(mongoDbName);
  const redis = new Redis(redisUrl);
  await redis.flushdb();

  // A real pino logger writing into an array: the worker's only observability
  // surface is these lines, so the tests read the real ones.
  const { lines, logger: log } = captureLogs('debug');
  const workers: RunningWorker[] = [];
  const startWorkerNow = async (): Promise<RunningWorker> => {
    const worker = await startWorker(config, log);
    workers.push(worker);
    return worker;
  };
  if (options.withoutWorker !== true) {
    await startWorkerNow();
  }

  return {
    db,
    redis,
    player,
    admin,
    config,
    logs: lines,
    mongoDbName,
    startWorkerNow,
    async stop() {
      // Workers first: one still consuming would process another test's
      // messages against a database this is about to stop talking to.
      for (const worker of workers) {
        await worker.stop();
      }
      await Promise.all([player.close(), admin.close()]);
      await redis.quit();
      await mongo.close();
    },
  };
}

/**
 * A second connection to the same broker for the things a test does that no app
 * does: publish a poison message, or look inside the dead-letter queue.
 */
export interface DrainedMessage {
  messageId?: string;
  body: string;
  headers: Record<string, unknown>;
  redelivered: boolean;
}

export interface TestBroker {
  channel: ConfirmChannel;
  /** Everything sitting in a queue, removing it as it reads. */
  drain(queue: string): Promise<DrainedMessage[]>;
  dlq(): Promise<DrainedMessage[]>;
  depth(queue?: string): Promise<number>;
  /** Publish a command the way @penka/backoffice-api's publisher does. */
  publishCommand(command: ResolveMatchdayCommand): Promise<void>;
  /** Publish anything at all — for messages no real publisher would send. */
  publishRaw(routingKey: string, content: Buffer, messageId?: string): Promise<void>;
  /** Empty both queues, so one test cannot inherit another's leftovers. */
  purge(): Promise<void>;
  close(): Promise<void>;
}

export async function connectTestBroker(url: string): Promise<TestBroker> {
  const connection: ChannelModel = await connect(url);
  const channel = await connection.createConfirmChannel();
  // Identical to the worker's, so a test can look at the queues before the
  // worker has ever booted — and so a disagreement would fail here, loudly.
  await declareTopology(channel);

  async function drain(queue: string): Promise<DrainedMessage[]> {
    const messages: DrainedMessage[] = [];
    for (;;) {
      const message = await channel.get(queue, { noAck: true });
      if (message === false) {
        return messages;
      }
      messages.push({
        messageId: message.properties.messageId,
        body: message.content.toString(),
        headers: message.properties.headers ?? {},
        redelivered: message.fields.redelivered,
      });
    }
  }

  async function publishRaw(
    routingKey: string,
    content: Buffer,
    messageId?: string,
  ): Promise<void> {
    channel.publish(SURVIVOR_COMMANDS_EXCHANGE, routingKey, content, {
      ...(messageId === undefined ? {} : { messageId }),
      persistent: true,
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
  }

  return {
    channel,
    drain,
    dlq: () => drain(RESOLUTION_DLQ),
    async depth(queue = RESOLUTION_QUEUE) {
      const { messageCount } = await channel.checkQueue(queue);
      return messageCount;
    },
    publishCommand: (command) =>
      publishRaw(
        resolveRoutingKey(command.penkaId),
        Buffer.from(JSON.stringify(command)),
        resolveMessageId(command.penkaId, command.matchday),
      ),
    publishRaw,
    async purge() {
      await channel.purgeQueue(RESOLUTION_QUEUE);
      await channel.purgeQueue(RESOLUTION_DLQ);
    },
    async close() {
      await connection.close();
    },
  };
}

/**
 * Poll until `check` stops throwing. The worker is a separate loop with no
 * completion callback, so every assertion about what it did has to wait for it
 * — and waiting for the state itself is what makes these tests read the real
 * pipeline instead of an internal signal.
 */
export async function eventually<T>(check: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      lastError = error;
      if (Date.now() > deadline) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Wait until the resolution queue has drained and nothing is being retried. */
export async function queueSettles(broker: TestBroker): Promise<void> {
  await eventually(async () => {
    expect(await broker.depth()).toBe(0);
  });
}
