import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config';
import { penkaRoutes } from './routes';

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

/** Enough of a Db to satisfy ensurePenkaIndexes without touching a network. */
const fakeDb = {
  collection: () => ({ createIndex: () => Promise.resolve('ok') }),
} as unknown as Db;

type Decorator = 'db' | 'authenticate' | 'createRateLimit';

function appWithDecorators(present: readonly Decorator[]): FastifyInstance {
  const app = Fastify({ logger: false });
  if (present.includes('db')) app.decorate('db', fakeDb);
  if (present.includes('authenticate')) app.decorate('authenticate', () => Promise.resolve());
  if (present.includes('createRateLimit')) {
    app.decorate('createRateLimit', () => () => Promise.resolve({ isAllowed: true, key: 'k' }));
  }
  app.register(penkaRoutes, { prefix: '/api/v1', config });
  return app;
}

async function bootFailure(present: readonly Decorator[]): Promise<string> {
  const app = appWithDecorators(present);
  try {
    await app.ready();
  } catch (error) {
    return (error as Error).message;
  } finally {
    await app.close();
  }
  throw new Error('expected the app to fail booting');
}

describe('penkaRoutes plugin dependencies', () => {
  it('fails to boot with a clear message when Mongo is not registered first', async () => {
    const message = await bootFailure([]);

    expect(message).toContain('db');
    expect(message).toContain('penkaRoutes');
  });

  it('fails to boot when the auth plugin is not registered first', async () => {
    expect(await bootFailure(['db'])).toContain('authenticate');
  });

  it('fails to boot when the rate limiter is not registered first', async () => {
    // Joining builds its two budgets at boot; without the limiter the 4-digit
    // join code would be wide open to brute force.
    expect(await bootFailure(['db', 'authenticate'])).toContain('createRateLimit');
  });

  it('boots once every dependency is in place', async () => {
    const app = appWithDecorators(['db', 'authenticate', 'createRateLimit']);

    await expect(app.ready()).resolves.toBeDefined();

    await app.close();
  });
});
