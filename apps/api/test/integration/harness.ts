import { randomUUID } from 'node:crypto';
import { GenericContainer } from 'testcontainers';
import type { Db } from 'mongodb';
import type { AppConfig } from '../../src/config';

export interface TestInfra {
  mongoUrl: string;
  redisUrl: string;
  stop(): Promise<void>;
}

/** Same images as infra/docker-compose.yml, on random host ports. */
export async function startInfra(): Promise<TestInfra> {
  const [mongo, redis] = await Promise.all([
    new GenericContainer('mongo:7').withExposedPorts(27017).start(),
    new GenericContainer('redis:7').withExposedPorts(6379).start(),
  ]);

  return {
    mongoUrl: `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}`,
    redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    stop: async () => {
      await Promise.all([mongo.stop(), redis.stop()]);
    },
  };
}

/** A valid AppConfig against the started containers, with a fresh database per call. */
export function makeTestConfig(infra: TestInfra, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    mongoUrl: infra.mongoUrl,
    mongoDbName: `penka-test-${randomUUID().slice(0, 8)}`,
    redisUrl: infra.redisUrl,
    jwtSecret: 'integration-test-secret-0123456789abcdef',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    // High enough that functional tests never trip it; rate-limit tests build
    // their own app with a tiny max on an isolated Redis database.
    rateLimitMax: 1000,
    trustProxy: false,
    ...overrides,
  };
}

type CollectionFactory = Db['collection'];

/**
 * Make the next insert into `collectionName` reject, simulating a transient
 * Mongo write failure. Returns a restore function; call it in a finally block.
 */
export function failNextInsert(db: Db, collectionName: string): () => void {
  const original = db.collection.bind(db) as CollectionFactory;
  let armed = true;

  const patched = ((name: string, options?: unknown) => {
    const collection = original(name, options as never);
    if (name !== collectionName || !armed) {
      return collection;
    }
    return new Proxy(collection, {
      get(target, property, receiver) {
        if (property === 'insertOne' && armed) {
          armed = false;
          return () => Promise.reject(new Error('simulated transient mongo write failure'));
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
  }) as CollectionFactory;

  db.collection = patched;
  return () => {
    db.collection = original;
  };
}
