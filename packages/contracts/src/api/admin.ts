import { Type, type Static } from '@sinclair/typebox';
import {
  IdSchema,
  MatchOutcomeSchema,
  MatchSchema,
  MatchdaySchema,
  PenkaSchema,
} from '../domain';
import { StrictObject } from '../strict';

/** Board polling cadence profiles an operator can set per penka. */
export const PollingProfileSchema = Type.Union([
  Type.Literal('live'),
  Type.Literal('normal'),
  Type.Literal('slow'),
]);
export type PollingProfile = Static<typeof PollingProfileSchema>;

export const MatchdayParamsSchema = StrictObject({
  matchdayId: IdSchema,
});
export type MatchdayParams = Static<typeof MatchdayParamsSchema>;

// GET /admin/pools
export const AdminPoolSummarySchema = StrictObject({
  penka: PenkaSchema,
  entryCount: Type.Integer({ minimum: 0 }),
  aliveCount: Type.Integer({ minimum: 0 }),
  islandCount: Type.Integer({ minimum: 0 }),
});
export type AdminPoolSummary = Static<typeof AdminPoolSummarySchema>;

export const AdminPoolsResponseSchema = StrictObject({
  pools: Type.Array(AdminPoolSummarySchema),
});
export type AdminPoolsResponse = Static<typeof AdminPoolsResponseSchema>;

// GET /admin/matchdays/:matchdayId
export const AdminMatchdayDetailResponseSchema = StrictObject({
  matchday: MatchdaySchema,
  matches: Type.Array(MatchSchema),
});
export type AdminMatchdayDetailResponse = Static<typeof AdminMatchdayDetailResponseSchema>;

// PUT /admin/matchdays/:matchdayId/results
export const SetResultRequestSchema = StrictObject({
  matchId: IdSchema,
  outcome: MatchOutcomeSchema,
});
export type SetResultRequest = Static<typeof SetResultRequestSchema>;

export const SetResultResponseSchema = StrictObject({
  match: MatchSchema,
});
export type SetResultResponse = Static<typeof SetResultResponseSchema>;

// POST /admin/matchdays/:matchdayId/close
export const CloseMatchdayResponseSchema = StrictObject({
  matchday: MatchdaySchema,
});
export type CloseMatchdayResponse = Static<typeof CloseMatchdayResponseSchema>;

// POST /admin/matchdays/:matchdayId/resolve — resolution is queued, never synchronous
export const ResolveMatchdayResponseSchema = StrictObject({
  queued: Type.Literal(true),
  matchdayId: IdSchema,
});
export type ResolveMatchdayResponse = Static<typeof ResolveMatchdayResponseSchema>;

// PUT /admin/penkas/:penkaId/polling-profile
export const SetPollingProfileRequestSchema = StrictObject({
  profile: PollingProfileSchema,
});
export type SetPollingProfileRequest = Static<typeof SetPollingProfileRequestSchema>;

export const SetPollingProfileResponseSchema = StrictObject({
  profile: PollingProfileSchema,
});
export type SetPollingProfileResponse = Static<typeof SetPollingProfileResponseSchema>;
