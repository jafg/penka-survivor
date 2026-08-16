import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

function failureMessage(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('boots on the local infra with no environment at all', () => {
    // Unlike the two APIs this process holds no secret: it authenticates
    // nobody and answers nobody, so there is nothing here that must not have
    // a default.
    expect(loadConfig({})).toEqual({
      mongoUrl: 'mongodb://127.0.0.1:27017',
      mongoDbName: 'penka',
      redisUrl: 'redis://127.0.0.1:6379',
      rabbitUrl: 'amqp://127.0.0.1:5672',
      prefetch: 1,
      maxAttempts: 3,
      logLevel: 'info',
    });
  });

  it('reads every overridable value from the environment', () => {
    const config = loadConfig({
      MONGO_URL: 'mongodb+srv://cluster.example.com',
      MONGO_DB: 'penka-staging',
      REDIS_URL: 'rediss://redis.internal:6380/2',
      RABBITMQ_URL: 'amqps://guest:guest@rabbit.internal:5671',
      PREFETCH: '4',
      MAX_ATTEMPTS: '5',
      LOG_LEVEL: 'debug',
    });

    expect(config).toEqual({
      mongoUrl: 'mongodb+srv://cluster.example.com',
      mongoDbName: 'penka-staging',
      redisUrl: 'rediss://redis.internal:6380/2',
      rabbitUrl: 'amqps://guest:guest@rabbit.internal:5671',
      prefetch: 4,
      maxAttempts: 5,
      logLevel: 'debug',
    });
  });

  it('shares @penka/api defaults for the database, because it writes the same one', () => {
    const config = loadConfig({});

    expect(config.mongoUrl).toBe('mongodb://127.0.0.1:27017');
    expect(config.mongoDbName).toBe('penka');
  });

  it('rejects a URL whose scheme names the wrong service', () => {
    // A worker pointed at the wrong service does not fail on its first message
    // — it fails on connect, which is why every URL is checked here.
    expect(failureMessage({ MONGO_URL: 'postgres://localhost' })).toContain('MONGO_URL');
    expect(failureMessage({ REDIS_URL: 'http://localhost' })).toContain('REDIS_URL');
    expect(failureMessage({ RABBITMQ_URL: 'amqp:/localhost' })).toContain('RABBITMQ_URL');
  });

  it('rejects a prefetch or attempt count that is not a positive integer', () => {
    expect(failureMessage({ PREFETCH: '0' })).toContain('PREFETCH');
    expect(failureMessage({ PREFETCH: '1.5' })).toContain('PREFETCH');
    expect(failureMessage({ MAX_ATTEMPTS: '-1' })).toContain('MAX_ATTEMPTS');
    expect(failureMessage({ MAX_ATTEMPTS: 'three' })).toContain('MAX_ATTEMPTS');
  });

  it('reports every problem in one message instead of one per boot', () => {
    const message = failureMessage({ MONGO_URL: 'nope://x', RABBITMQ_URL: 'nope://y' });

    expect(message).toContain('MONGO_URL');
    expect(message).toContain('RABBITMQ_URL');
  });

  it('treats an empty variable as unset, the way a docker-compose default does', () => {
    expect(loadConfig({ MONGO_DB: '', PREFETCH: '' })).toEqual(loadConfig({}));
  });
});
