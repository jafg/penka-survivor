import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { HealthResponseSchema, type HealthResponse } from '@penka/contracts';
import type { AppConfig } from './config';
import { errorHandler, notFoundHandler } from './errors';
import type { ResolutionPublisher } from './messaging/publisher';
import { adminRoutes } from './modules/admin/routes';
import { adminAuthPlugin } from './plugins/admin-auth';
import { mongoPlugin } from './plugins/mongo';
import { rabbitPlugin } from './plugins/rabbit';
import { redisPlugin } from './plugins/redis';

export interface BuildAppOptions {
  config: AppConfig;
  /**
   * `true` in production. Tests that assert on a log line — the resolve
   * rollback is only visible there — pass pino options with their own stream.
   */
  logger?: FastifyServerOptions['logger'];
  /**
   * Seam for tests that need to watch — or break — what gets published;
   * production connects to RabbitMQ through the plugin below.
   */
  publisher?: ResolutionPublisher;
}

/**
 * Composition root: wires the error handler, infrastructure plugins, and the
 * admin routes. Constructing the app has no side effects — the Mongo, Redis and
 * RabbitMQ connections open at ready()/listen() and fail fast there.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    // AJV strips unknown properties by default; that would silently defeat the
    // closed (additionalProperties: false) schemas in @penka/contracts.
    ajv: { customOptions: { removeAdditional: false } },
    // No trustProxy: this API is operator-only and keys nothing on the client
    // IP, so there is no header worth trusting (see src/config.ts).
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.register(mongoPlugin, { url: config.mongoUrl, dbName: config.mongoDbName });
  app.register(redisPlugin, { url: config.redisUrl });
  if (options.publisher === undefined) {
    app.register(rabbitPlugin, { url: config.rabbitUrl });
  } else {
    // Decorated here rather than through a plugin so an injected publisher is in
    // place before boot: nothing dials a broker that was never needed.
    app.decorate('publisher', options.publisher);
  }
  app.register(adminAuthPlugin, { apiKey: config.adminApiKey });

  app.get(
    '/health',
    // Deliberately outside the admin guard: a load balancer has no admin key,
    // and the answer says nothing an operator would not want it to.
    { schema: { response: { 200: HealthResponseSchema } } },
    async (): Promise<HealthResponse> => ({ status: 'ok' }),
  );

  app.register(adminRoutes, { prefix: '/admin/v1' });

  return app;
}
