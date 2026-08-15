import { randomUUID } from 'node:crypto';
import { GenericContainer, Wait } from 'testcontainers';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { RESOLUTION_QUEUE } from '@penka/contracts';
import type { AppConfig } from '../../src/config';
import { declareTopology } from '../../src/messaging/topology';

/**
 * This package's own harness, deliberately a sibling of @penka/api's rather
 * than a shared module: an app cannot import from another app's test folder,
 * and only this one publishes anything. Keeping the broker here means the
 * public API's suite never pays RabbitMQ's ~15s boot for tests that have no
 * queue in them, while every test in THIS package runs against a real broker
 * with the real topology — no flag to forget, no second code path.
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

/** The admin key every test authenticates with; long enough to satisfy loadConfig. */
export const TEST_ADMIN_KEY = 'integration-test-admin-key-0123456789';

export function adminHeaders(key: string = TEST_ADMIN_KEY): Record<string, string> {
  return { 'x-admin-key': key };
}

/** A valid AppConfig against the started containers, with a fresh database per call. */
export function makeTestConfig(infra: TestInfra, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    mongoUrl: infra.mongoUrl,
    mongoDbName: `penka-test-${randomUUID().slice(0, 8)}`,
    redisUrl: infra.redisUrl,
    rabbitUrl: infra.rabbitUrl,
    adminApiKey: TEST_ADMIN_KEY,
    ...overrides,
  };
}

/** What a test asserts about a published command. */
export interface CapturedMessage {
  routingKey: string;
  messageId: string | undefined;
  persistent: boolean;
  contentType: string | undefined;
  body: unknown;
}

export interface TestBroker {
  /** Everything sitting in the resolution queue, removing it as it reads. */
  drain(): Promise<CapturedMessage[]>;
  /** A confirm channel of this broker; `close()` it to get a genuinely broken one. */
  channel(): Promise<ConfirmChannel>;
  close(): Promise<void>;
}

/**
 * A second connection to the same broker, used to read what the app published.
 * It declares the topology itself (idempotent, and identical to the app's) so a
 * test can drain the queue before the app has ever booted.
 */
export async function connectTestBroker(url: string): Promise<TestBroker> {
  const connection: ChannelModel = await connect(url);
  const reader = await connection.createChannel();
  await declareTopology(reader);

  return {
    async drain() {
      const messages: CapturedMessage[] = [];
      for (;;) {
        const message = await reader.get(RESOLUTION_QUEUE, { noAck: true });
        if (message === false) {
          return messages;
        }
        messages.push({
          routingKey: message.fields.routingKey,
          messageId: message.properties.messageId,
          // amqplib maps `persistent: true` onto delivery mode 2.
          persistent: message.properties.deliveryMode === 2,
          contentType: message.properties.contentType,
          body: JSON.parse(message.content.toString()) as unknown,
        });
      }
    },
    channel: () => connection.createConfirmChannel(),
    close: async () => {
      await connection.close();
    },
  };
}

/** Structured log lines a test can assert on, as Fastify's logger option. */
export interface LogCapture {
  lines: Record<string, unknown>[];
  logger: { level: string; stream: { write(line: string): void } };
}

export function captureLogs(level = 'warn'): LogCapture {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    logger: {
      level,
      stream: {
        write(line: string) {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        },
      },
    },
  };
}
