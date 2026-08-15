import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ErrorCodes, ErrorResponseSchema, HealthResponseSchema } from './index';

describe('@penka/contracts', () => {
  it('accepts the canonical health payload', () => {
    expect(Value.Check(HealthResponseSchema, { status: 'ok' })).toBe(true);
    expect(Value.Check(HealthResponseSchema, { status: 'down' })).toBe(false);
  });

  it('only accepts canonical error codes', () => {
    expect(Value.Check(ErrorResponseSchema, { code: ErrorCodes.NOT_FOUND, message: 'x' })).toBe(
      true,
    );
    expect(Value.Check(ErrorResponseSchema, { code: 'MADE_UP_CODE', message: 'x' })).toBe(false);
  });
});
