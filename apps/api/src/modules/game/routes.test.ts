import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { gameRoutes } from './routes';

/** Enough of a Db to satisfy ensureGameIndexes without touching a network. */
const fakeDb = {
  collection: () => ({ createIndex: () => Promise.resolve('ok') }),
} as unknown as Db;

type Decorator = 'db' | 'redis' | 'authenticate';

function appWithDecorators(present: readonly Decorator[]): FastifyInstance {
  const app = Fastify({ logger: false });
  if (present.includes('db')) app.decorate('db', fakeDb);
  if (present.includes('redis')) app.decorate('redis', {} as FastifyInstance['redis']);
  if (present.includes('authenticate')) app.decorate('authenticate', () => Promise.resolve());
  app.register(gameRoutes, { prefix: '/api/v1' });
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

describe('gameRoutes plugin dependencies', () => {
  it('fails to boot with a clear message when Mongo is not registered first', async () => {
    const message = await bootFailure([]);

    expect(message).toContain('db');
    expect(message).toContain('gameRoutes');
  });

  it('fails to boot when Redis is not registered first', async () => {
    // Without Redis the board would silently recompute from Mongo on every
    // poll — the cache is what makes a public board pollable at all.
    expect(await bootFailure(['db'])).toContain('redis');
  });

  it('fails to boot when the auth plugin is not registered first', async () => {
    expect(await bootFailure(['db', 'redis'])).toContain('authenticate');
  });

  it('boots once every dependency is in place', async () => {
    const app = appWithDecorators(['db', 'redis', 'authenticate']);

    await expect(app.ready()).resolves.toBeDefined();

    await app.close();
  });
});

describe('gameRoutes surface', () => {
  it('exposes the four game endpoints and nothing else', async () => {
    const app = appWithDecorators(['db', 'redis', 'authenticate']);
    await app.ready();

    const routes = app
      .printRoutes({ commonPrefix: false })
      .split('\n')
      .filter((line) => line.includes('('));

    expect(routes.join('\n')).toContain('/api/v1/penkas/:penkaId/board (GET, HEAD)');
    expect(routes.join('\n')).toContain('/api/v1/penkas/:penkaId/me (GET, HEAD)');
    expect(routes.join('\n')).toContain('/api/v1/penkas/:penkaId/matchday/current (GET, HEAD)');
    expect(routes.join('\n')).toContain('/api/v1/penkas/:penkaId/picks (POST)');

    await app.close();
  });
});
