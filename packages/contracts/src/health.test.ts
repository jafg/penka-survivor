import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from './health';

describe('HealthResponseSchema', () => {
  it('accepts the canonical health payload', () => {
    expect(Value.Check(HealthResponseSchema, { status: 'ok' })).toBe(true);
    expect(Value.Check(HealthResponseSchema, { status: 'down' })).toBe(false);
  });

  it('rejects extra fields like every other contract schema', () => {
    expect(Value.Check(HealthResponseSchema, { status: 'ok', debug: 'extra' })).toBe(false);
  });
});
