import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from '../errors';
import { adminAuthPlugin } from './admin-auth';

const KEY = 'k'.repeat(32);

async function appWithGuardedRoute() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminAuthPlugin, { apiKey: KEY });
  app.get('/guarded', { preHandler: app.requireAdmin }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('adminAuthPlugin', () => {
  it('lets a request through with the right key', async () => {
    const app = await appWithGuardedRoute();

    const response = await app.inject({
      method: 'GET',
      url: '/guarded',
      headers: { 'x-admin-key': KEY },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a wrong, missing, or truncated key with the same 401', async () => {
    const app = await appWithGuardedRoute();

    for (const headers of [
      {},
      { 'x-admin-key': '' },
      { 'x-admin-key': 'wrong' },
      // A prefix of the real key: a comparison that stops at the first
      // difference would answer these at measurably different speeds.
      { 'x-admin-key': KEY.slice(0, 31) },
      { 'x-admin-key': `${KEY}x` },
    ]) {
      const response = await app.inject({ method: 'GET', url: '/guarded', headers });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        status: 401,
        code: 'unauthorized',
        message: 'Invalid admin key',
      });
    }
    await app.close();
  });

  it('reads the header case-insensitively, as HTTP defines it', async () => {
    const app = await appWithGuardedRoute();

    const response = await app.inject({
      method: 'GET',
      url: '/guarded',
      headers: { 'X-Admin-Key': KEY },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('guards nothing on its own — a route must ask for it', async () => {
    // The health check must answer without a key (a load balancer has none), so
    // the plugin decorates a preHandler instead of installing a global hook.
    const app = Fastify();
    await app.register(adminAuthPlugin, { apiKey: KEY });
    app.get('/health', async () => ({ status: 'ok' }));
    await app.ready();

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    await app.close();
  });
});
