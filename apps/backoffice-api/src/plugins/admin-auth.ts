import { timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors';

declare module 'fastify' {
  interface FastifyInstance {
    /** Route-level guard: `{ preHandler: app.requireAdmin }`. */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AdminAuthPluginOptions {
  apiKey: string;
}

export const ADMIN_KEY_HEADER = 'x-admin-key';

/**
 * Constant-time comparison. A plain `===` returns as soon as two bytes differ,
 * so an attacker who can time the answer learns the key one character at a
 * time; the length is hashed into the comparison by rejecting a mismatch up
 * front, which leaks only how long the key is.
 */
function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Authentication for the whole back office: one shared key in `X-Admin-Key`,
 * checked against ADMIN_API_KEY.
 *
 * This is a deliberate MVP decision, not a design: a shared secret has no
 * identity behind it, so an audit log could not say WHO closed a matchday, and
 * rotating it logs out every operator at once. The production path is
 * role-based users (the `users` collection already exists, and this API would
 * check a role claim on the same JWTs @penka/api issues) — at which point this
 * plugin is replaced, not extended.
 *
 * It decorates a route-level guard rather than installing a global hook so
 * `/health` stays reachable: a load balancer has no admin key.
 */
export const adminAuthPlugin = fp<AdminAuthPluginOptions>(
  async (app, options) => {
    app.decorate('requireAdmin', async (request: FastifyRequest) => {
      const provided = request.headers[ADMIN_KEY_HEADER];
      if (typeof provided !== 'string' || !keyMatches(provided, options.apiKey)) {
        // One answer for missing, malformed and wrong: a caller without the key
        // learns nothing about which of the three they got wrong.
        throw new ApiError(401, 'unauthorized', 'Invalid admin key');
      }
    });
  },
  { name: 'admin-auth' },
);
