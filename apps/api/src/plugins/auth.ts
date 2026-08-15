import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../errors';
import { createTokenService, type TokenService } from '../services/token';

declare module 'fastify' {
  interface FastifyInstance {
    tokens: TokenService;
    authenticate(request: FastifyRequest): Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AuthPluginOptions {
  secret: string;
  accessTtlSeconds: number;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Decorates the token service and an `authenticate` preHandler. Protected
 * routes declare `preHandler: app.authenticate`; on success `request.userId`
 * carries the verified subject, on any failure the request dies with
 * 401 unauthorized.
 */
export const authPlugin = fp<AuthPluginOptions>(
  async (app, options) => {
    const tokens = createTokenService({
      secret: options.secret,
      accessTtlSeconds: options.accessTtlSeconds,
    });
    app.decorate('tokens', tokens);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const header = request.headers.authorization;
      if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
        throw new ApiError(401, 'unauthorized', 'Missing bearer token');
      }
      const verified = await tokens.verifyAccessToken(header.slice(BEARER_PREFIX.length));
      if (verified === null) {
        throw new ApiError(401, 'unauthorized', 'Invalid or expired access token');
      }
      request.userId = verified.userId;
    });
  },
  { name: 'auth' },
);
