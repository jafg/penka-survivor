import { Type, type Static } from '@sinclair/typebox';
import { StrictObject } from './strict';

/**
 * Canonical error codes — the exhaustive, closed set. Every API error response
 * uses one of these; never invent ad-hoc codes in an app. Extending this set is
 * a deliberate, reviewed decision.
 */
export const ErrorCodes = {
  invalid_credentials: 'invalid_credentials',
  email_taken: 'email_taken',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  /** Generic 404: an unroutable path or method. Specific misses have their own codes. */
  not_found: 'not_found',
  penka_not_found: 'penka_not_found',
  invalid_join_code: 'invalid_join_code',
  join_code_space_exhausted: 'join_code_space_exhausted',
  matchday_locked: 'matchday_locked',
  matchday_not_found: 'matchday_not_found',
  team_already_used: 'team_already_used',
  team_not_playing: 'team_not_playing',
  on_island: 'on_island',
  results_missing: 'results_missing',
  already_resolved: 'already_resolved',
  matchday_not_locked: 'matchday_not_locked',
  invalid_outcome: 'invalid_outcome',
  invalid_profile: 'invalid_profile',
  rate_limited: 'rate_limited',
  // Generic fallbacks: request-schema validation failures and unhandled server errors.
  validation_failed: 'validation_failed',
  internal: 'internal',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorCodeSchema = Type.Union(
  Object.values(ErrorCodes).map((code) => Type.Literal(code)),
);

/** Canonical error envelope for every non-2xx API response. */
export const ApiErrorSchema = StrictObject({
  status: Type.Integer({ minimum: 400, maximum: 599 }),
  code: ErrorCodeSchema,
  message: Type.String({ minLength: 1 }),
});

export type ApiError = Static<typeof ApiErrorSchema>;
