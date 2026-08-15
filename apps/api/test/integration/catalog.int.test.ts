import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Value } from '@sinclair/typebox/value';
import {
  ApiErrorSchema,
  LeagueDetailResponseSchema,
  ListLeaguesResponseSchema,
} from '@penka/contracts';
import { buildApp } from '../../src/app';
import { makeTestConfig, startInfra, type TestInfra } from './harness';

describe('catalog endpoints', () => {
  let infra: TestInfra;
  let app: FastifyInstance;

  beforeAll(async () => {
    infra = await startInfra();
    app = buildApp({ config: makeTestConfig(infra) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await infra.stop();
  });

  describe('GET /api/v1/catalog/leagues', () => {
    it('lists every league in the shape the contract declares', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/leagues' });

      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      expect(Value.Check(ListLeaguesResponseSchema, body)).toBe(true);
      expect(response.json<{ leagues: { id: string }[] }>().leagues.map((l) => l.id)).toEqual([
        'copa-america',
        'copa-libertadores',
        'champions-league',
        'premier-league',
        'la-liga',
        'fifa-world-cup',
      ]);
    });

    it('needs no authentication — the catalog is public', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/leagues' });

      expect(response.statusCode).toBe(200);
    });

    it('filters by region', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/leagues?region=europe',
      });

      expect(response.statusCode).toBe(200);
      const { leagues } = response.json<{ leagues: { id: string; region: string }[] }>();
      expect(leagues.map((league) => league.id)).toEqual([
        'champions-league',
        'premier-league',
        'la-liga',
      ]);
      for (const league of leagues) {
        expect(league.region).toBe('europe');
      }
    });

    it('rejects an unknown region', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/leagues?region=antarctica',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ status: 400, code: 'validation_failed' });
      expect(Value.Check(ApiErrorSchema, response.json())).toBe(true);
    });
  });

  describe('GET /api/v1/catalog/leagues/:leagueId', () => {
    it('returns the league, its teams and its fixture template', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/leagues/copa-libertadores',
      });

      expect(response.statusCode).toBe(200);
      const body: unknown = response.json();
      expect(Value.Check(LeagueDetailResponseSchema, body)).toBe(true);

      const detail = response.json<{
        league: { id: string; name: string; region: string };
        teams: { code: string; name: string; country?: string }[];
        fixtureTemplate: {
          leagueId: string;
          matchdays: {
            number: number;
            lockAtOffsetMinutes: number;
            matchups: { homeTeamCode: string; awayTeamCode: string }[];
          }[];
        };
      }>();
      expect(detail.league).toEqual({
        id: 'copa-libertadores',
        name: 'Copa Libertadores',
        region: 'america',
        season: '2026',
      });
      expect(detail.teams).toHaveLength(8);
      expect(detail.fixtureTemplate.leagueId).toBe('copa-libertadores');
      expect(
        detail.fixtureTemplate.matchdays.map((matchday) => matchday.lockAtOffsetMinutes),
      ).toEqual([120, 1560, 3000]);
      for (const matchday of detail.fixtureTemplate.matchdays) {
        expect(matchday.matchups).toHaveLength(4);
      }
    });

    it('serves the teamCount the listing advertises', async () => {
      const listing = await app.inject({ method: 'GET', url: '/api/v1/catalog/leagues' });
      const { leagues } = listing.json<{ leagues: { id: string; teamCount: number }[] }>();

      for (const league of leagues) {
        const detail = await app.inject({
          method: 'GET',
          url: `/api/v1/catalog/leagues/${league.id}`,
        });
        expect(detail.statusCode).toBe(200);
        expect(detail.json<{ teams: unknown[] }>().teams).toHaveLength(league.teamCount);
      }
    });

    it('answers an unknown league with 404 league_not_found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/leagues/serie-a',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ status: 404, code: 'league_not_found' });
      expect(Value.Check(ApiErrorSchema, response.json())).toBe(true);
    });

    it('does not fall back to the generic not_found envelope', async () => {
      const unknownLeague = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/leagues/serie-a',
      });
      const unknownRoute = await app.inject({ method: 'GET', url: '/api/v1/catalog/nope' });

      expect(unknownLeague.json<{ code: string }>().code).toBe('league_not_found');
      expect(unknownRoute.json<{ code: string }>().code).toBe('not_found');
    });
  });
});
