import { Type, type Static } from '@sinclair/typebox';
import { StrictObject } from './strict';

export const HealthResponseSchema = StrictObject({
  status: Type.Literal('ok'),
});

export type HealthResponse = Static<typeof HealthResponseSchema>;
