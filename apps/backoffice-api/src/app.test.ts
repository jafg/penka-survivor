import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { AppConfig } from './config';

const config: AppConfig = {
  port: 0,
  mongoUrl: 'mongodb://127.0.0.1:27017',
  mongoDbName: 'penka-unit',
  redisUrl: 'redis://127.0.0.1:6379',
  rabbitUrl: 'amqp://127.0.0.1:5672',
  adminApiKey: 'unit-test-admin-key-0123456789abcdef',
};

describe('buildApp', () => {
  it('creates a Fastify instance without side effects', () => {
    // No ready()/close() here on purpose: booting would open the Mongo, Redis
    // and RabbitMQ connections, and *constructing* the app must not touch the
    // network.
    const app = buildApp({ config });

    expect(app.inject).toBeTypeOf('function');
  });

  it('accepts an injected publisher instead of dialing a broker', () => {
    // The seam the resolve tests inject a broken channel through: given a
    // publisher, buildApp must not register the rabbit plugin at all. That it
    // really skips the connection is proven where a broker exists to skip —
    // test/integration/resolve.int.test.ts — since booting here would need
    // Mongo and Redis too.
    const app = buildApp({
      config,
      publisher: { publishResolutions: () => Promise.resolve() },
    });

    expect(app.hasDecorator('publisher')).toBe(true);
  });
});
