import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Board, Match, MatchOutcome } from '@penka/contracts';
import { adminHeaders } from './harness';

/**
 * Seeding goes through the two real APIs, never through hand-written documents.
 * A fixture that drifted from what @penka/api actually writes would make this
 * suite pass while the worker resolved something production never produces —
 * and the calendar only exists at all because a player created a penka.
 *
 * Team codes are catalog codes (`^[A-Z0-9]{2,5}$`): copa-libertadores matchday 1
 * pairs RIV-ATN, BOC-CCO, FLA-NAC and PAL-PEN.
 */
export const LEAGUE_ID = 'copa-libertadores';

export interface TestUser {
  token: string;
  userId: string;
  displayName: string;
}

const PASSWORD = 'penka-password-1';

export async function registerUser(app: FastifyInstance, label: string): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `${label}-${randomUUID().slice(0, 8)}@test.penka.dev`,
      displayName: label,
      password: PASSWORD,
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{ user: { id: string }; tokens: { accessToken: string } }>();
  return { token: body.tokens.accessToken, userId: body.user.id, displayName: label };
}

function bearer(user: TestUser): Record<string, string> {
  return { authorization: `Bearer ${user.token}` };
}

export interface TestPenka {
  id: string;
  joinCode: string;
}

export interface CreatePenkaOptions {
  leagueId?: string;
  name?: string;
  /** Both fields are optional on the way in; the stored penka always has both. */
  settings?: { lives?: number; islandEnabled?: boolean };
}

export async function createPenka(
  app: FastifyInstance,
  user: TestUser,
  options: CreatePenkaOptions = {},
): Promise<TestPenka> {
  const leagueId = options.leagueId ?? LEAGUE_ID;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas',
    headers: bearer(user),
    payload: {
      name: options.name ?? `Penka ${leagueId}`,
      leagueId,
      settings: options.settings ?? {},
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ penka: TestPenka }>().penka;
}

export async function joinPenka(
  app: FastifyInstance,
  user: TestUser,
  joinCode: string,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/penkas/join',
    headers: bearer(user),
    payload: { joinCode },
  });
  expect(response.statusCode).toBe(200);
}

export async function submitPick(
  app: FastifyInstance,
  user: TestUser,
  penkaId: string,
  teamCode: string,
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/penkas/${penkaId}/picks`,
    headers: bearer(user),
    payload: { teamCode },
  });
  expect(response.statusCode).toBe(200);
}

export async function getBoard(app: FastifyInstance, penkaId: string): Promise<Board> {
  const response = await app.inject({ method: 'GET', url: `/api/v1/penkas/${penkaId}/board` });
  expect(response.statusCode).toBe(200);
  return response.json<{ board: Board }>().board;
}

// ── Operator side ──────────────────────────────────────────────────────────

export async function listMatches(
  admin: FastifyInstance,
  matchday: number,
  leagueId = LEAGUE_ID,
): Promise<Match[]> {
  const response = await admin.inject({
    method: 'GET',
    url: `/admin/v1/leagues/${leagueId}/matchdays/${matchday}`,
    headers: adminHeaders(),
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ matches: Match[] }>().matches;
}

export async function closeMatchday(
  admin: FastifyInstance,
  matchday: number,
  leagueId = LEAGUE_ID,
): Promise<void> {
  const response = await admin.inject({
    method: 'POST',
    url: `/admin/v1/leagues/${leagueId}/matchdays/${matchday}/close`,
    headers: adminHeaders(),
  });
  expect(response.statusCode).toBe(200);
}

export async function setResult(
  admin: FastifyInstance,
  matchId: string,
  outcome: MatchOutcome,
): Promise<void> {
  const response = await admin.inject({
    method: 'POST',
    url: `/admin/v1/matches/${encodeURIComponent(matchId)}/result`,
    headers: adminHeaders(),
    payload: { outcome },
  });
  expect(response.statusCode).toBe(200);
}

/**
 * Load a result for every match of the matchday. `home` throughout is the
 * simplest fixture that still separates winners from losers: whoever backed a
 * home side survives, whoever backed an away side goes down a life.
 */
export async function setAllResults(
  admin: FastifyInstance,
  matchday: number,
  outcome: MatchOutcome = 'home',
  leagueId = LEAGUE_ID,
): Promise<Match[]> {
  const matches = await listMatches(admin, matchday, leagueId);
  for (const match of matches) {
    await setResult(admin, match.id, outcome);
  }
  return matches.map((match) => ({ ...match, outcome }));
}

/** Press resolve. The response is `{ queued: true }` — the work happens later. */
export async function requestResolve(
  admin: FastifyInstance,
  matchday: number,
  leagueId = LEAGUE_ID,
): Promise<void> {
  const response = await admin.inject({
    method: 'POST',
    url: `/admin/v1/leagues/${leagueId}/matchdays/${matchday}/resolve`,
    headers: adminHeaders(),
  });
  expect(response.statusCode).toBe(200);
}

/** close → results → resolve, the operator flow the back office documents. */
export async function runMatchday(
  admin: FastifyInstance,
  matchday: number,
  outcome: MatchOutcome = 'home',
  leagueId = LEAGUE_ID,
): Promise<Match[]> {
  await closeMatchday(admin, matchday, leagueId);
  const matches = await setAllResults(admin, matchday, outcome, leagueId);
  await requestResolve(admin, matchday, leagueId);
  return matches;
}
