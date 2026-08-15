import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  AuthTokensSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from './auth';
import * as fx from '../test-support/fixtures';

const registerRequest = { email: 'ana@example.com', password: 'sup3r-secret', displayName: 'Ana' };
const loginRequest = { email: 'ana@example.com', password: 'sup3r-secret' };

describe('auth request schemas', () => {
  it('accepts valid register/login/refresh payloads', () => {
    expect(Value.Check(RegisterRequestSchema, registerRequest)).toBe(true);
    expect(Value.Check(LoginRequestSchema, loginRequest)).toBe(true);
    expect(Value.Check(RefreshRequestSchema, { refreshToken: fx.tokens.refreshToken })).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(Value.Check(RegisterRequestSchema, { ...registerRequest, email: 'nope' })).toBe(false);
    expect(Value.Check(LoginRequestSchema, { ...loginRequest, email: 'nope' })).toBe(false);
  });

  it('rejects short passwords on register with a useful error path', () => {
    const bad = { ...registerRequest, password: 'short' };
    expect(Value.Check(RegisterRequestSchema, bad)).toBe(false);
    expect([...Value.Errors(RegisterRequestSchema, bad)].some((e) => e.path === '/password')).toBe(
      true,
    );
  });

  it('rejects missing fields', () => {
    const withoutName = fx.omit(registerRequest, 'displayName');
    expect(Value.Check(RegisterRequestSchema, withoutName)).toBe(false);
    expect(Value.Check(RefreshRequestSchema, {})).toBe(false);
  });

  it('rejects extra fields', () => {
    expect(Value.Check(RegisterRequestSchema, { ...registerRequest, isAdmin: true })).toBe(false);
    expect(Value.Check(LoginRequestSchema, { ...loginRequest, remember: true })).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(Value.Check(LoginRequestSchema, { ...loginRequest, password: 12345678 })).toBe(false);
  });
});

describe('auth response schemas', () => {
  const authenticated = { user: fx.user, tokens: fx.tokens };

  it('accepts valid responses', () => {
    expect(Value.Check(RegisterResponseSchema, authenticated)).toBe(true);
    expect(Value.Check(LoginResponseSchema, authenticated)).toBe(true);
    expect(Value.Check(RefreshResponseSchema, { tokens: fx.tokens })).toBe(true);
    expect(Value.Check(MeResponseSchema, { user: fx.user })).toBe(true);
  });

  it('never lets a passwordHash through', () => {
    const leaked = { ...authenticated, user: { ...fx.user, passwordHash: 'bcrypt$...' } };
    expect(Value.Check(LoginResponseSchema, leaked)).toBe(false);
    expect(Value.Check(MeResponseSchema, { user: leaked.user })).toBe(false);
  });

  it('shares the refresh token constraint between the request and the token pair', () => {
    expect(RefreshRequestSchema.properties.refreshToken).toEqual(
      AuthTokensSchema.properties.refreshToken,
    );
  });

  it('rejects incomplete token pairs', () => {
    expect(
      Value.Check(RefreshResponseSchema, { tokens: { accessToken: fx.tokens.accessToken } }),
    ).toBe(false);
  });
});
