import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { AppConfig } from './config';

const config: AppConfig = {
  port: 0,
  mongoUrl: 'mongodb://127.0.0.1:27017',
  mongoDbName: 'penka-unit',
  redisUrl: 'redis://127.0.0.1:6379',
  jwtSecret: 'unit-test-secret-0123456789abcdef',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 604_800,
  rateLimitMax: 10,
  trustProxy: false,
};

describe('buildApp', () => {
  it('creates a Fastify instance without side effects', () => {
    // No ready()/close() here on purpose: booting would open the Mongo/Redis
    // connections, and *constructing* the app must not touch the network.
    const app = buildApp({ config });

    expect(app.inject).toBeTypeOf('function');
  });
});
