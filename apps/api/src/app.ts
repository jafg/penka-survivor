import Fastify, { type FastifyInstance } from 'fastify';
import { HealthResponseSchema, type HealthResponse } from '@penka/contracts';

export interface BuildAppOptions {
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get(
    '/health',
    { schema: { response: { 200: HealthResponseSchema } } },
    async (): Promise<HealthResponse> => ({ status: 'ok' }),
  );

  return app;
}
