import { Type, type Static } from '@sinclair/typebox';
import { EntrySchema, IdSchema, PenkaSchema } from '../domain';
import { StrictObject } from '../strict';

/** Applied when a create request leaves a setting out. */
export const DEFAULT_PENKA_SETTINGS = { lives: 2, islandEnabled: true } as const;

// POST /penkas
/** Both settings are optional on the way in; the stored penka always has both. */
export const CreatePenkaSettingsSchema = StrictObject({
  lives: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 3, default: DEFAULT_PENKA_SETTINGS.lives }),
  ),
  islandEnabled: Type.Optional(Type.Boolean({ default: DEFAULT_PENKA_SETTINGS.islandEnabled })),
});
export type CreatePenkaSettings = Static<typeof CreatePenkaSettingsSchema>;

export const CreatePenkaRequestSchema = StrictObject({
  name: Type.String({ minLength: 1 }),
  leagueId: IdSchema,
  settings: CreatePenkaSettingsSchema,
});
export type CreatePenkaRequest = Static<typeof CreatePenkaRequestSchema>;

export const CreatePenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
});
export type CreatePenkaResponse = Static<typeof CreatePenkaResponseSchema>;

// POST /penkas/join
export const JoinPenkaRequestSchema = StrictObject({
  /**
   * Deliberately loose: the route answers 404 invalid_join_code for unknown AND
   * malformed codes, so a guesser cannot tell "wrong shape" from "wrong code".
   * A 400 from schema validation would give that away. The cap only stops a
   * client from posting a novel as a join code.
   */
  joinCode: Type.String({ maxLength: 64 }),
});
export type JoinPenkaRequest = Static<typeof JoinPenkaRequestSchema>;

export const JoinPenkaResponseSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type JoinPenkaResponse = Static<typeof JoinPenkaResponseSchema>;

// GET /me/penkas
export const MyPenkaItemSchema = StrictObject({
  penka: PenkaSchema,
  entry: EntrySchema,
});
export type MyPenkaItem = Static<typeof MyPenkaItemSchema>;

export const MyPenkasResponseSchema = StrictObject({
  penkas: Type.Array(MyPenkaItemSchema),
});
export type MyPenkasResponse = Static<typeof MyPenkasResponseSchema>;
