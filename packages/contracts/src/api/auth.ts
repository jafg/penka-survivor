import { Type, type Static } from '@sinclair/typebox';
import { EmailSchema, UserSchema } from '../domain';
import { StrictObject } from '../strict';

export const RefreshTokenSchema = Type.String({ minLength: 1 });

export const AuthTokensSchema = StrictObject({
  accessToken: Type.String({ minLength: 1 }),
  refreshToken: RefreshTokenSchema,
});
export type AuthTokens = Static<typeof AuthTokensSchema>;

// POST /auth/register
export const RegisterRequestSchema = StrictObject({
  email: EmailSchema,
  password: Type.String({ minLength: 8 }),
  displayName: Type.String({ minLength: 1 }),
});
export type RegisterRequest = Static<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = StrictObject({
  user: UserSchema,
  tokens: AuthTokensSchema,
});
export type RegisterResponse = Static<typeof RegisterResponseSchema>;

// POST /auth/login
export const LoginRequestSchema = StrictObject({
  email: EmailSchema,
  password: Type.String({ minLength: 1 }),
});
export type LoginRequest = Static<typeof LoginRequestSchema>;

export const LoginResponseSchema = StrictObject({
  user: UserSchema,
  tokens: AuthTokensSchema,
});
export type LoginResponse = Static<typeof LoginResponseSchema>;

// POST /auth/refresh
export const RefreshRequestSchema = StrictObject({
  refreshToken: RefreshTokenSchema,
});
export type RefreshRequest = Static<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = StrictObject({
  tokens: AuthTokensSchema,
});
export type RefreshResponse = Static<typeof RefreshResponseSchema>;

// GET /me
export const MeResponseSchema = StrictObject({
  user: UserSchema,
});
export type MeResponse = Static<typeof MeResponseSchema>;
