import { Type, type Static } from '@sinclair/typebox';
import { FixtureTemplateSchema, IdSchema, LeagueSchema, RegionSchema, TeamSchema } from '../domain';
import { StrictObject } from '../strict';

export const LeagueParamsSchema = StrictObject({
  leagueId: IdSchema,
});
export type LeagueParams = Static<typeof LeagueParamsSchema>;

/** Listing row: enough to render a league card without loading its teams. */
export const LeagueSummarySchema = StrictObject({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  region: RegionSchema,
  teamCount: Type.Integer({ minimum: 2 }),
});
export type LeagueSummary = Static<typeof LeagueSummarySchema>;

// GET /catalog/leagues?region=
/** Region is optional: omit it to list every league. */
export const ListLeaguesQuerySchema = StrictObject({
  region: Type.Optional(RegionSchema),
});
export type ListLeaguesQuery = Static<typeof ListLeaguesQuerySchema>;

export const ListLeaguesResponseSchema = StrictObject({
  leagues: Type.Array(LeagueSummarySchema),
});
export type ListLeaguesResponse = Static<typeof ListLeaguesResponseSchema>;

// GET /catalog/leagues/:leagueId
export const LeagueDetailResponseSchema = StrictObject({
  league: LeagueSchema,
  teams: Type.Array(TeamSchema),
  fixtureTemplate: FixtureTemplateSchema,
});
export type LeagueDetailResponse = Static<typeof LeagueDetailResponseSchema>;
