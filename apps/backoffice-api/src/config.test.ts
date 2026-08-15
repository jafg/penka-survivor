import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const VALID_KEY = 'k'.repeat(32);

function failureMessage(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies documented defaults when only ADMIN_API_KEY is set', () => {
    const config = loadConfig({ ADMIN_API_KEY: VALID_KEY });

    expect(config).toEqual({
      port: 3001,
      mongoUrl: 'mongodb://127.0.0.1:27017',
      mongoDbName: 'penka',
      redisUrl: 'redis://127.0.0.1:6379',
      rabbitUrl: 'amqp://127.0.0.1:5672',
      adminApiKey: VALID_KEY,
    });
  });

  it('reads every overridable value from the environment', () => {
    const config = loadConfig({
      PORT: '4101',
      MONGO_URL: 'mongodb+srv://cluster.example.com',
      MONGO_DB: 'penka-staging',
      REDIS_URL: 'rediss://redis.internal:6380/2',
      RABBITMQ_URL: 'amqps://guest:guest@rabbit.internal:5671',
      ADMIN_API_KEY: VALID_KEY,
    });

    expect(config.port).toBe(4101);
    expect(config.mongoUrl).toBe('mongodb+srv://cluster.example.com');
    expect(config.mongoDbName).toBe('penka-staging');
    expect(config.redisUrl).toBe('rediss://redis.internal:6380/2');
    expect(config.rabbitUrl).toBe('amqps://guest:guest@rabbit.internal:5671');
  });

  it('defaults the port to 3001, so the two APIs can run side by side', () => {
    expect(loadConfig({ ADMIN_API_KEY: VALID_KEY }).port).toBe(3001);
  });

  it('refuses to boot without an admin key', () => {
    // The key is the ONLY thing between the internet and closing a matchday, so
    // there is no default and no empty-string escape hatch.
    expect(failureMessage({})).toContain('ADMIN_API_KEY');
    expect(failureMessage({ ADMIN_API_KEY: '' })).toContain('ADMIN_API_KEY');
  });

  it('refuses a guessable admin key', () => {
    expect(failureMessage({ ADMIN_API_KEY: 'admin' })).toContain('32 characters');
    expect(failureMessage({ ADMIN_API_KEY: 'k'.repeat(31) })).toContain('32 characters');
  });

  it('rejects a broker URL that is not AMQP', () => {
    // A silent typo here would mean an app that boots and never publishes.
    expect(
      failureMessage({ ADMIN_API_KEY: VALID_KEY, RABBITMQ_URL: 'http://rabbit:15672' }),
    ).toContain('RABBITMQ_URL');
  });

  it('rejects malformed infrastructure URLs', () => {
    expect(failureMessage({ ADMIN_API_KEY: VALID_KEY, MONGO_URL: 'http://mongo' })).toContain(
      'MONGO_URL',
    );
    expect(failureMessage({ ADMIN_API_KEY: VALID_KEY, REDIS_URL: 'tcp://redis' })).toContain(
      'REDIS_URL',
    );
  });

  it('rejects a port that is not a positive integer', () => {
    expect(failureMessage({ ADMIN_API_KEY: VALID_KEY, PORT: '0' })).toContain('PORT');
    expect(failureMessage({ ADMIN_API_KEY: VALID_KEY, PORT: 'nope' })).toContain('PORT');
  });

  it('reports every problem at once, so a bad deploy fails with one message', () => {
    const message = failureMessage({ PORT: '-1', MONGO_URL: 'http://mongo', RABBITMQ_URL: 'nope' });

    expect(message).toContain('PORT');
    expect(message).toContain('MONGO_URL');
    expect(message).toContain('RABBITMQ_URL');
    expect(message).toContain('ADMIN_API_KEY');
  });
});
