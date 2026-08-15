import { Type, type Static } from '@sinclair/typebox';
import { EntrySchema, IdSchema, PenkaSchema, PenkaSettingsSchema } from '../domain';
import { StrictObject } from '../strict';

// POST /penkas
export const CreatePenkaRequestSchema = StrictObject({
  name: Type.String({ minLength: 1 }),
  leagueId: IdSchema,
  settings: PenkaSettingsSchema,
});
export type CreatePenkaRequest = Static<typeof CreatePenkaRequestSchema>;

export const CreatePenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
});
export type CreatePenkaResponse = Static<typeof CreatePenkaResponseSchema>;

// POST /penkas/join
export const JoinPenkaRequestSchema = StrictObject({
  joinCode: Type.String({ minLength: 1 }),
});
export type JoinPenkaRequest = Static<typeof JoinPenkaRequestSchema>;

export const JoinPenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type JoinPenkaResponse = Static<typeof JoinPenkaResponseSchema>;

// GET /penkas/mine
export const MyPenkaItemSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type MyPenkaItem = Static<typeof MyPenkaItemSchema>;

export const MyPenkasResponseSchema = StrictObject({
  penkas: Type.Array(MyPenkaItemSchema),
});
export type MyPenkasResponse = Static<typeof MyPenkasResponseSchema>;
