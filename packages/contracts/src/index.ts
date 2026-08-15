import { Type, type Static } from '@sinclair/typebox';

/**
 * Canonical error codes. Every API error response must use one of these —
 * never invent ad-hoc codes in an app.
 */
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorResponseSchema = Type.Object({
  code: Type.Union(Object.values(ErrorCodes).map((code) => Type.Literal(code))),
  message: Type.String(),
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
});

export type HealthResponse = Static<typeof HealthResponseSchema>;
