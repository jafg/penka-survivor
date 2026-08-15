import Fastify, { type FastifyInstance } from 'fastify';
import { HealthResponseSchema, type HealthResponse } from '@penka/contracts';
import type { AppConfig } from './config';
import { errorHandler, notFoundHandler } from './errors';
import { authRoutes } from './modules/auth/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { authPlugin } from './plugins/auth';
import { mongoPlugin } from './plugins/mongo';
import { rateLimitPlugin } from './plugins/rate-limit';
import { redisPlugin } from './plugins/redis';

export interface BuildAppOptions {
  config: AppConfig;
  logger?: boolean;
}

/**
 * Composition root: wires the error handler, infrastructure plugins, and
 * routes. Constructing the app has no side effects — Mongo/Redis connections
 * open at ready()/listen() and fail fast there.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    // Rate limiting keys on request.ip, so forwarded headers are only honored
    // when a trusted proxy is actually in front of the API.
    trustProxy: config.trustProxy,
    // AJV strips unknown properties by default; that would silently defeat the
    // closed (additionalProperties: false) schemas in @penka/contracts.
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(mongoPlugin, { url: config.mongoUrl, dbName: config.mongoDbName });
  app.register(redisPlugin, { url: config.redisUrl });
  app.register(rateLimitPlugin, { max: config.rateLimitMax });
  app.register(authPlugin, {
    secret: config.jwtSecret,
    accessTtlSeconds: config.accessTokenTtlSeconds,
  });

  app.get(
    '/health',
    { schema: { response: { 200: HealthResponseSchema } } },
    async (): Promise<HealthResponse> => ({ status: 'ok' }),
  );

  app.register(authRoutes, { prefix: '/api/v1', config });
  app.register(catalogRoutes, { prefix: '/api/v1' });

  return app;
}
