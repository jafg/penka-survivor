import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, ErrorCodes } from './errors';

const SPEC_CODES = [
  'invalid_credentials',
  'email_taken',
  'unauthorized',
  'forbidden',
  'penka_not_found',
  'invalid_join_code',
  'join_code_space_exhausted',
  'matchday_locked',
  'matchday_not_found',
  'team_already_used',
  'team_not_playing',
  'on_island',
  'results_missing',
  'already_resolved',
  'invalid_outcome',
  'invalid_profile',
  'rate_limited',
  'validation_failed',
  'internal',
] as const;

describe('ErrorCodes', () => {
  it('is exactly the canonical, exhaustive set', () => {
    expect(Object.values(ErrorCodes).sort()).toEqual([...SPEC_CODES].sort());
  });

  it('has unique codes', () => {
    const values = Object.values(ErrorCodes);
    expect(new Set(values).size).toBe(values.length);
  });

  it('maps every key to itself so lookups and values never drift', () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(key).toBe(value);
    }
  });
});

describe('ApiErrorSchema', () => {
  const validError = { status: 403, code: ErrorCodes.forbidden, message: 'Operators only' };

  it('accepts a canonical error payload', () => {
    expect(Value.Check(ApiErrorSchema, validError)).toBe(true);
  });

  it('accepts every canonical code', () => {
    for (const code of Object.values(ErrorCodes)) {
      expect(Value.Check(ApiErrorSchema, { status: 400, code, message: 'x' })).toBe(true);
    }
  });

  it('rejects non-canonical codes', () => {
    expect(Value.Check(ApiErrorSchema, { ...validError, code: 'made_up_code' })).toBe(false);
  });

  it('rejects missing fields with a useful error path', () => {
    const withoutMessage = { status: validError.status, code: validError.code };
    expect(Value.Check(ApiErrorSchema, withoutMessage)).toBe(false);

    const errors = [...Value.Errors(ApiErrorSchema, withoutMessage)];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.path === '/message')).toBe(true);
    for (const e of errors) expect(e.message).toBeTruthy();
  });

  it('rejects a non-integer status', () => {
    expect(Value.Check(ApiErrorSchema, { ...validError, status: '403' })).toBe(false);
    expect(Value.Check(ApiErrorSchema, { ...validError, status: 403.5 })).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(ApiErrorSchema, { ...validError, stack: 'Error: boom' })).toBe(false);
  });
});
