import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config';
import { authRoutes } from './routes';

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

/** Enough of a Db to satisfy ensureAuthIndexes without touching a network. */
const fakeDb = {
  collection: () => ({ createIndex: () => Promise.resolve('ok') }),
} as unknown as Db;

type Decorator = 'db' | 'tokens' | 'authenticate' | 'rateLimit';

function appWithDecorators(present: readonly Decorator[]): FastifyInstance {
  const app = Fastify({ logger: false });
  if (present.includes('db')) app.decorate('db', fakeDb);
  if (present.includes('tokens')) {
    app.decorate('tokens', {
      signAccessToken: () => Promise.resolve('token'),
      verifyAccessToken: () => Promise.resolve(null),
      generateRefreshToken: () => 'refresh',
      hashRefreshToken: () => 'hash',
    });
  }
  if (present.includes('authenticate')) app.decorate('authenticate', () => Promise.resolve());
  if (present.includes('rateLimit')) app.decorate('rateLimit', () => () => Promise.resolve());
  app.register(authRoutes, { prefix: '/api/v1', config });
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

describe('authRoutes plugin dependencies', () => {
  it('fails to boot with a clear message when Mongo is not registered first', async () => {
    const message = await bootFailure([]);

    expect(message).toContain('db');
    expect(message).toContain('authRoutes');
  });

  it('fails to boot when the auth plugin is not registered first', async () => {
    expect(await bootFailure(['db'])).toContain('tokens');
    expect(await bootFailure(['db', 'tokens'])).toContain('authenticate');
  });

  it('fails to boot when the rate limiter is not registered first', async () => {
    // Registered after the routes, @fastify/rate-limit silently skips them —
    // booting must fail loudly instead of leaving login unthrottled.
    expect(await bootFailure(['db', 'tokens', 'authenticate'])).toContain('rateLimit');
  });

  it('boots once every dependency is in place', async () => {
    const app = appWithDecorators(['db', 'tokens', 'authenticate', 'rateLimit']);

    await expect(app.ready()).resolves.toBeDefined();

    await app.close();
  });
});
