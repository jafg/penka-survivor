import { Type, type Static } from '@sinclair/typebox';
import { IdSchema, LeagueSchema, TeamSchema } from '../domain';
import { StrictObject } from '../strict';

export const LeagueParamsSchema = StrictObject({
  leagueId: IdSchema,
});
export type LeagueParams = Static<typeof LeagueParamsSchema>;

// GET /catalog/leagues
export const ListLeaguesResponseSchema = StrictObject({
  leagues: Type.Array(LeagueSchema),
});
export type ListLeaguesResponse = Static<typeof ListLeaguesResponseSchema>;

// GET /catalog/leagues/:leagueId
export const LeagueDetailResponseSchema = StrictObject({
  league: LeagueSchema,
  teams: Type.Array(TeamSchema),
});
export type LeagueDetailResponse = Static<typeof LeagueDetailResponseSchema>;
