import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { adminRoutes } from './routes';

/** Enough of a Db to satisfy ensureAdminIndexes without touching a network. */
const fakeDb = {
  collection: () => ({ createIndex: () => Promise.resolve('ok') }),
} as unknown as Db;

type Decorator = 'db' | 'redis' | 'publisher' | 'requireAdmin';

function appWithDecorators(present: readonly Decorator[]): FastifyInstance {
  const app = Fastify({ logger: false });
  if (present.includes('db')) app.decorate('db', fakeDb);
  if (present.includes('redis')) app.decorate('redis', {} as FastifyInstance['redis']);
  if (present.includes('publisher')) {
    app.decorate('publisher', { publishResolutions: () => Promise.resolve() });
  }
  if (present.includes('requireAdmin')) app.decorate('requireAdmin', () => Promise.resolve());
  app.register(adminRoutes, { prefix: '/admin/v1' });
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

describe('adminRoutes plugin dependencies', () => {
  it('fails to boot with a clear message when Mongo is not registered first', async () => {
    const message = await bootFailure([]);

    expect(message).toContain('db');
    expect(message).toContain('adminRoutes');
  });

  it('fails to boot when Redis is not registered first', async () => {
    // The polling profile lives in Redis; without it the operator's load valve
    // would accept a write that goes nowhere.
    expect(await bootFailure(['db'])).toContain('redis');
  });

  it('fails to boot when the publisher is not registered first', async () => {
    // Resolution is queued, never synchronous: an admin API that boots without
    // a broker would accept resolve requests nothing will ever run.
    expect(await bootFailure(['db', 'redis'])).toContain('publisher');
  });

  it('fails to boot when the admin auth plugin is not registered first', async () => {
    // Loud at boot rather than quiet in production: the same mistake would
    // otherwise leave every operator endpoint open to anyone who can reach it.
    expect(await bootFailure(['db', 'redis', 'publisher'])).toContain('requireAdmin');
  });

  it('boots once every dependency is in place', async () => {
    const app = appWithDecorators(['db', 'redis', 'publisher', 'requireAdmin']);

    await expect(app.ready()).resolves.toBeDefined();

    await app.close();
  });
});

/** Every route the plugin registers, as `METHOD /path`. HEAD is Fastify's own. */
async function registeredRoutes(app: FastifyInstance): Promise<string[]> {
  const routes: string[] = [];
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD') routes.push(`${method} ${route.path}`);
    }
  });
  await app.ready();
  return routes;
}

describe('adminRoutes surface', () => {
  it('exposes the six operator endpoints and nothing else', async () => {
    const app = appWithDecorators(['db', 'redis', 'publisher', 'requireAdmin']);

    const routes = await registeredRoutes(app);

    expect(routes.sort()).toEqual([
      'GET /admin/v1/leagues/:leagueId/matchdays/:number',
      'GET /admin/v1/penkas',
      'POST /admin/v1/leagues/:leagueId/matchdays/:number/close',
      'POST /admin/v1/leagues/:leagueId/matchdays/:number/resolve',
      'POST /admin/v1/matches/:matchId/result',
      'PUT /admin/v1/polling-profile',
    ]);

    await app.close();
  });

  it('guards every route with the admin key', async () => {
    // The check is per route rather than a global hook so /health stays open,
    // which only works if no route is ever registered without it.
    const unguarded: string[] = [];
    const app = appWithDecorators(['db', 'redis', 'publisher', 'requireAdmin']);
    app.addHook('onRoute', (route) => {
      const handlers = [route.preHandler ?? []].flat();
      if (handlers.length === 0) unguarded.push(`${String(route.method)} ${route.path}`);
    });
    await app.ready();

    expect(unguarded).toEqual([]);

    await app.close();
  });
});
