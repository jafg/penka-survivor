import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const VALID_SECRET = 'a'.repeat(32);

function failureMessage(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies documented defaults when only JWT_SECRET is set', () => {
    const config = loadConfig({ JWT_SECRET: VALID_SECRET });

    expect(config).toEqual({
      port: 3000,
      mongoUrl: 'mongodb://127.0.0.1:27017',
      mongoDbName: 'penka',
      redisUrl: 'redis://127.0.0.1:6379',
      jwtSecret: VALID_SECRET,
      accessTokenTtlSeconds: 15 * 60,
      refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
      rateLimitMax: 10,
      trustProxy: false,
    });
  });

  it('does not trust proxy headers unless TRUST_PROXY says so', () => {
    expect(loadConfig({ JWT_SECRET: VALID_SECRET }).trustProxy).toBe(false);
    expect(loadConfig({ JWT_SECRET: VALID_SECRET, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ JWT_SECRET: VALID_SECRET, TRUST_PROXY: '' }).trustProxy).toBe(false);
  });

  it('accepts TRUST_PROXY as a boolean, a hop count, or a proxy list', () => {
    expect(loadConfig({ JWT_SECRET: VALID_SECRET, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ JWT_SECRET: VALID_SECRET, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(loadConfig({ JWT_SECRET: VALID_SECRET, TRUST_PROXY: '10.0.0.0/8' }).trustProxy).toBe(
      '10.0.0.0/8',
    );
  });

  it('reads every overridable value from the environment', () => {
    const config = loadConfig({
      PORT: '4100',
      MONGO_URL: 'mongodb+srv://cluster.example.com',
      MONGO_DB: 'penka-staging',
      REDIS_URL: 'rediss://redis.internal:6380/2',
      JWT_SECRET: VALID_SECRET,
      RATE_LIMIT_MAX: '25',
    });

    expect(config.port).toBe(4100);
    expect(config.mongoUrl).toBe('mongodb+srv://cluster.example.com');
    expect(config.mongoDbName).toBe('penka-staging');
    expect(config.redisUrl).toBe('rediss://redis.internal:6380/2');
    expect(config.rateLimitMax).toBe(25);
  });

  it('fails fast when JWT_SECRET is missing', () => {
    expect(failureMessage({})).toContain('JWT_SECRET');
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    const message = failureMessage({ JWT_SECRET: 'too-short' });
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('32');
  });

  it('rejects a non-numeric PORT', () => {
    expect(failureMessage({ JWT_SECRET: VALID_SECRET, PORT: 'abc' })).toContain('PORT');
  });

  it('rejects a non-positive PORT', () => {
    expect(failureMessage({ JWT_SECRET: VALID_SECRET, PORT: '0' })).toContain('PORT');
  });

  it('rejects a MONGO_URL without a mongodb scheme', () => {
    expect(failureMessage({ JWT_SECRET: VALID_SECRET, MONGO_URL: 'http://mongo' })).toContain(
      'MONGO_URL',
    );
  });

  it('rejects a REDIS_URL without a redis scheme', () => {
    expect(failureMessage({ JWT_SECRET: VALID_SECRET, REDIS_URL: 'tcp://redis' })).toContain(
      'REDIS_URL',
    );
  });

  it('rejects a non-positive RATE_LIMIT_MAX', () => {
    expect(failureMessage({ JWT_SECRET: VALID_SECRET, RATE_LIMIT_MAX: '0' })).toContain(
      'RATE_LIMIT_MAX',
    );
  });

  it('reports every problem in a single message', () => {
    const message = failureMessage({ PORT: 'abc', REDIS_URL: 'tcp://redis' });
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('PORT');
    expect(message).toContain('REDIS_URL');
  });
});
