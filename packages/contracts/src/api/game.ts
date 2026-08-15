import { Type, type Static } from '@sinclair/typebox';
import { BoardSchema, IdSchema, MatchSchema, MatchdaySchema, MyEntrySchema } from '../domain';
import { StrictObject } from '../strict';

export const PenkaParamsSchema = StrictObject({
  penkaId: IdSchema,
});
export type PenkaParams = Static<typeof PenkaParamsSchema>;

// GET /penkas/:penkaId/board — public read model, no personal data (see BoardSchema)
export const BoardResponseSchema = StrictObject({
  board: BoardSchema,
});
export type BoardResponse = Static<typeof BoardResponseSchema>;

// GET /penkas/:penkaId/me — the authenticated player's personal delta
export const MyEntryResponseSchema = StrictObject({
  myEntry: MyEntrySchema,
});
export type MyEntryResponse = Static<typeof MyEntryResponseSchema>;

// GET /penkas/:penkaId/matchday — current matchday with its fixtures
export const CurrentMatchdayResponseSchema = StrictObject({
  matchday: MatchdaySchema,
  matches: Type.Array(MatchSchema),
});
export type CurrentMatchdayResponse = Static<typeof CurrentMatchdayResponseSchema>;

// POST /penkas/:penkaId/picks
export const SubmitPickRequestSchema = StrictObject({
  teamId: IdSchema,
});
export type SubmitPickRequest = Static<typeof SubmitPickRequestSchema>;

export const SubmitPickResponseSchema = StrictObject({
  myEntry: MyEntrySchema,
});
export type SubmitPickResponse = Static<typeof SubmitPickResponseSchema>;
