import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { ErrorCodes } from '@penka/contracts';
import { ApiError } from '../errors';

export interface RateLimitPluginOptions {
  max: number;
}

/**
 * Registered with global:false — only routes that opt in via
 * `config.rateLimit` (register and login) are limited, at `max` requests per
 * minute per IP. Counters live in Redis so the limit holds across instances.
 * The 429 body is the canonical error envelope with code rate_limited.
 */
export const rateLimitPlugin = fp<RateLimitPluginOptions>(
  async (app, options) => {
    await app.register(rateLimit, {
      global: false,
      max: options.max,
      timeWindow: '1 minute',
      redis: app.redis,
      // The builder's result travels through the app error handler, so return
      // an ApiError and let the handler shape the canonical envelope.
      errorResponseBuilder: (_request, context) =>
        new ApiError(429, ErrorCodes.rate_limited, `Rate limit exceeded, retry in ${context.after}`),
    });
  },
  { name: 'rate-limit', dependencies: ['redis'] },
);
