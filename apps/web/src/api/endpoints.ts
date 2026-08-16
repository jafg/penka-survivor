import {
  BoardResponseSchema,
  CurrentMatchdayResponseSchema,
  JoinPenkaResponseSchema,
  LeagueDetailResponseSchema,
  ListLeaguesResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  MyEntryResponseSchema,
  MyPenkasResponseSchema,
  CreatePenkaResponseSchema,
  RefreshResponseSchema,
  RegisterResponseSchema,
  SubmitPickResponseSchema,
  type BoardResponse,
  type CreatePenkaRequest,
  type CreatePenkaResponse,
  type CurrentMatchdayResponse,
  type JoinPenkaResponse,
  type LeagueDetailResponse,
  type ListLeaguesResponse,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type MyEntryResponse,
  type MyPenkasResponse,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
  type SubmitPickRequest,
  type SubmitPickResponse,
} from '@penka/contracts';
import { apiRequest } from './client';

/**
 * Every call the player app is allowed to make, one function each, named after
 * the route. Request and response shapes come from `@penka/contracts` without
 * exception — nothing in this app describes a payload itself.
 *
 * `auth: true` marks the routes that carry personal data. The public board and
 * the catalog deliberately do not: they are the same bytes for every viewer, so
 * sending a token would only make them uncacheable.
 */

// ── Auth ───────────────────────────────────────────────────────────────────

export function register(body: RegisterRequest): Promise<RegisterResponse> {
  return apiRequest('/auth/register', { method: 'POST', body, schema: RegisterResponseSchema });
}

export function login(body: LoginRequest): Promise<LoginResponse> {
  return apiRequest('/auth/login', { method: 'POST', body, schema: LoginResponseSchema });
}

/**
 * Not `auth: true`: the refresh token IS the credential here, and a call made
 * *because* the access token was refused must not carry it — nor may it recurse
 * into the client's own refresh-and-retry.
 */
export function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  return apiRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    schema: RefreshResponseSchema,
  });
}

export function getMe(): Promise<MeResponse> {
  return apiRequest('/me', { auth: true, schema: MeResponseSchema });
}

// ── Catalog (public) ───────────────────────────────────────────────────────

export function listLeagues(): Promise<ListLeaguesResponse> {
  return apiRequest('/catalog/leagues', { schema: ListLeaguesResponseSchema });
}

export function getLeague(leagueId: string): Promise<LeagueDetailResponse> {
  return apiRequest(`/catalog/leagues/${encodeURIComponent(leagueId)}`, {
    schema: LeagueDetailResponseSchema,
  });
}

// ── Penkas ─────────────────────────────────────────────────────────────────

export function listMyPenkas(): Promise<MyPenkasResponse> {
  return apiRequest('/me/penkas', { auth: true, schema: MyPenkasResponseSchema });
}

export function createPenka(body: CreatePenkaRequest): Promise<CreatePenkaResponse> {
  return apiRequest('/penkas', {
    method: 'POST',
    body,
    auth: true,
    schema: CreatePenkaResponseSchema,
  });
}

export function joinPenka(joinCode: string): Promise<JoinPenkaResponse> {
  return apiRequest('/penkas/join', {
    method: 'POST',
    body: { joinCode },
    auth: true,
    schema: JoinPenkaResponseSchema,
  });
}

// ── Game ───────────────────────────────────────────────────────────────────

/** PUBLIC. No token: the board is identical for every viewer of the penka. */
export function getBoard(penkaId: string): Promise<BoardResponse> {
  return apiRequest(`/penkas/${encodeURIComponent(penkaId)}/board`, {
    schema: BoardResponseSchema,
  });
}

/** PUBLIC, like the board — the fixtures are the same for everyone. */
export function getCurrentMatchday(penkaId: string): Promise<CurrentMatchdayResponse> {
  return apiRequest(`/penkas/${encodeURIComponent(penkaId)}/matchday/current`, {
    schema: CurrentMatchdayResponseSchema,
  });
}

/** PERSONAL. */
export function getMyEntry(penkaId: string): Promise<MyEntryResponse> {
  return apiRequest(`/penkas/${encodeURIComponent(penkaId)}/me`, {
    auth: true,
    schema: MyEntryResponseSchema,
  });
}

/**
 * PERSONAL. The answer is the UPDATED personal delta, so a caller that stores
 * it is already up to date — re-fetching `/me` afterwards would ask the server
 * for something it just handed over.
 */
export function submitPick(penkaId: string, body: SubmitPickRequest): Promise<SubmitPickResponse> {
  return apiRequest(`/penkas/${encodeURIComponent(penkaId)}/picks`, {
    method: 'POST',
    body,
    auth: true,
    schema: SubmitPickResponseSchema,
  });
}
