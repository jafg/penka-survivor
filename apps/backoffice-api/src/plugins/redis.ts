import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export interface RedisPluginOptions {
  url: string;
}

/** Pings at boot so a bad REDIS_URL fails fast; quits the client with the app. */
export const redisPlugin = fp<RedisPluginOptions>(
  async (app, options) => {
    // connectTimeout/maxRetriesPerRequest per @fastify/rate-limit guidance:
    // fail fast instead of queueing commands forever when Redis is down.
    const redis = new Redis(options.url, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
    await redis.ping();
    app.decorate('redis', redis);
    app.addHook('onClose', async () => {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    });
  },
  { name: 'redis' },
);
