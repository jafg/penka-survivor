import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  LeagueDetailResponseSchema,
  LeagueParamsSchema,
  ListLeaguesQuerySchema,
  ListLeaguesResponseSchema,
} from '@penka/contracts';
import { ApiError } from '../../errors';
import { findLeague, listLeagues } from './catalog';

/**
 * The catalog is public, hardcoded and read-only: no auth, no database, no
 * rate limiting — every response is served from memory.
 */
export const catalogRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    '/catalog/leagues',
    {
      schema: {
        querystring: ListLeaguesQuerySchema,
        response: { 200: ListLeaguesResponseSchema },
      },
    },
    async (request) => ({ leagues: listLeagues(request.query.region) }),
  );

  app.get(
    '/catalog/leagues/:leagueId',
    { schema: { params: LeagueParamsSchema, response: { 200: LeagueDetailResponseSchema } } },
    async (request) => {
      const entry = findLeague(request.params.leagueId);
      if (entry === undefined) {
        throw new ApiError(404, 'league_not_found', 'Unknown league');
      }
      return entry;
    },
  );
};
