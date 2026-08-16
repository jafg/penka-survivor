import type { APIRequestContext, APIResponse } from '@playwright/test';
import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';
import {
  ADMIN_KEY_HEADER,
  type AuthTokens,
  AdminMatchdayDetailResponseSchema,
  BoardResponseSchema,
  CloseMatchdayResponseSchema,
  CreatePenkaResponseSchema,
  CurrentMatchdayResponseSchema,
  JoinPenkaResponseSchema,
  type MatchOutcome,
  MyEntryResponseSchema,
  type PollingProfile,
  RegisterResponseSchema,
  ResolveMatchdayResponseSchema,
  SetPollingProfileResponseSchema,
  SetResultResponseSchema,
  SubmitPickResponseSchema,
  type User,
} from '@penka/contracts';
import { ADMIN_PREFIX, API_PREFIX, env } from './env';

/**
 * Every response the suite reads is checked against the TypeBox schema the API
 * was built from, so a contract drift fails here — with the offending field
 * named — instead of surfacing three assertions later as an undefined.
 */
function decode<T extends TSchema>(schema: T, body: unknown, label: string): Static<T> {
  if (Value.Check(schema, body)) {
    return body;
  }
  const problems = [...Value.Errors(schema, body)]
    .slice(0, 3)
    .map((error) => `${error.path === '' ? '(root)' : error.path}: ${error.message}`)
    .join('; ');
  throw new Error(`${label} does not match its contract schema — ${problems}\n${JSON.stringify(body)}`);
}

async function readJson(response: APIResponse, label: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok()) {
    // The API answers the canonical `{ status, code, message }` envelope, which
    // is far more useful in a failure than "expected 200".
    throw new Error(`${label} → HTTP ${response.status()}: ${text}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} → body was not JSON: ${text}`);
  }
}

async function call<T extends TSchema>(
  response: APIResponse,
  schema: T,
  label: string,
): Promise<Static<T>> {
  return decode(schema, await readJson(response, label), label);
}

// ── Player API (@penka/api, port 3000) ─────────────────────────────────────

export interface PlayerSession {
  user: User;
  tokens: AuthTokens;
}

function bearer(session: PlayerSession): Record<string, string> {
  return { authorization: `Bearer ${session.tokens.accessToken}` };
}

/**
 * A password only this suite ever holds: the account is created by the test,
 * used by the test, and wiped by the next run's reset.
 */
const E2E_PASSWORD = 'e2e-survivor-demo';

/** Unique per run, so a rerun never collides with a half-wiped database. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@e2e.penka.local`;
}

export async function registerPlayer(
  request: APIRequestContext,
  displayName: string,
): Promise<PlayerSession> {
  const response = await request.post(`${env.apiUrl}${API_PREFIX}/auth/register`, {
    data: { email: uniqueEmail(displayName.toLowerCase()), password: E2E_PASSWORD, displayName },
  });
  const body = await call(response, RegisterResponseSchema, `register ${displayName}`);
  return { user: body.user, tokens: body.tokens };
}

export async function createPenka(
  request: APIRequestContext,
  session: PlayerSession,
  name: string,
  leagueId: string,
): Promise<Static<typeof CreatePenkaResponseSchema>['penka']> {
  const response = await request.post(`${env.apiUrl}${API_PREFIX}/penkas`, {
    headers: bearer(session),
    // `settings: {}` on purpose — the demo script takes the defaults
    // (2 lives, island on) from DEFAULT_PENKA_SETTINGS.
    data: { name, leagueId, settings: {} },
  });
  return (await call(response, CreatePenkaResponseSchema, `create penka ${name}`)).penka;
}

export async function joinPenka(
  request: APIRequestContext,
  session: PlayerSession,
  joinCode: string,
): Promise<Static<typeof JoinPenkaResponseSchema>> {
  const response = await request.post(`${env.apiUrl}${API_PREFIX}/penkas/join`, {
    headers: bearer(session),
    data: { joinCode },
  });
  return call(response, JoinPenkaResponseSchema, `join penka with ${joinCode}`);
}

/** The public board — no token, because nothing on it is personal. */
export async function getBoard(
  request: APIRequestContext,
  penkaId: string,
): Promise<Static<typeof BoardResponseSchema>['board']> {
  const response = await request.get(`${env.apiUrl}${API_PREFIX}/penkas/${penkaId}/board`);
  return (await call(response, BoardResponseSchema, `board ${penkaId}`)).board;
}

export async function getCurrentMatchday(
  request: APIRequestContext,
  penkaId: string,
): Promise<Static<typeof CurrentMatchdayResponseSchema>> {
  const response = await request.get(
    `${env.apiUrl}${API_PREFIX}/penkas/${penkaId}/matchday/current`,
  );
  return call(response, CurrentMatchdayResponseSchema, `current matchday ${penkaId}`);
}

export async function getMyEntry(
  request: APIRequestContext,
  session: PlayerSession,
  penkaId: string,
): Promise<Static<typeof MyEntryResponseSchema>['myEntry']> {
  const response = await request.get(`${env.apiUrl}${API_PREFIX}/penkas/${penkaId}/me`, {
    headers: bearer(session),
  });
  return (await call(response, MyEntryResponseSchema, `my entry ${penkaId}`)).myEntry;
}

export async function submitPick(
  request: APIRequestContext,
  session: PlayerSession,
  penkaId: string,
  teamCode: string,
): Promise<Static<typeof SubmitPickResponseSchema>['myEntry']> {
  const response = await request.post(`${env.apiUrl}${API_PREFIX}/penkas/${penkaId}/picks`, {
    headers: bearer(session),
    data: { teamCode },
  });
  return (await call(response, SubmitPickResponseSchema, `pick ${teamCode} on ${penkaId}`)).myEntry;
}

// ── Admin API (@penka/backoffice-api, port 3001) ───────────────────────────

function adminHeaders(): Record<string, string> {
  return { [ADMIN_KEY_HEADER]: env.adminApiKey };
}

export async function getAdminMatchday(
  request: APIRequestContext,
  leagueId: string,
  number: number,
): Promise<Static<typeof AdminMatchdayDetailResponseSchema>> {
  const response = await request.get(
    `${env.adminApiUrl}${ADMIN_PREFIX}/leagues/${leagueId}/matchdays/${number}`,
    { headers: adminHeaders() },
  );
  return call(response, AdminMatchdayDetailResponseSchema, `admin matchday ${leagueId}/${number}`);
}

/**
 * Load one result. Match ids are derived and carry colons
 * (`copa-libertadores:md1:RIV-BOC`), so the client encodes them into the path —
 * the server decodes route params once, in find-my-way, and never again.
 */
export async function setResult(
  request: APIRequestContext,
  matchId: string,
  outcome: MatchOutcome,
): Promise<Static<typeof SetResultResponseSchema>> {
  const response = await request.post(
    `${env.adminApiUrl}${ADMIN_PREFIX}/matches/${encodeURIComponent(matchId)}/result`,
    { headers: adminHeaders(), data: { outcome } },
  );
  return call(response, SetResultResponseSchema, `set result ${matchId}=${outcome}`);
}

export async function closeMatchday(
  request: APIRequestContext,
  leagueId: string,
  number: number,
): Promise<Static<typeof CloseMatchdayResponseSchema>['matchday']> {
  const response = await request.post(
    `${env.adminApiUrl}${ADMIN_PREFIX}/leagues/${leagueId}/matchdays/${number}/close`,
    { headers: adminHeaders() },
  );
  return (await call(response, CloseMatchdayResponseSchema, `close ${leagueId}/${number}`)).matchday;
}

/**
 * Ask for resolution. Answers `{ queued: true }` — the workers do the work, and
 * the matchday only flips to `resolved` once every penka on the league has been
 * resolved. Callers wait for that flip; they never treat this as the outcome.
 */
export async function resolveMatchday(
  request: APIRequestContext,
  leagueId: string,
  number: number,
): Promise<Static<typeof ResolveMatchdayResponseSchema>> {
  const response = await request.post(
    `${env.adminApiUrl}${ADMIN_PREFIX}/leagues/${leagueId}/matchdays/${number}/resolve`,
    { headers: adminHeaders() },
  );
  return call(response, ResolveMatchdayResponseSchema, `resolve ${leagueId}/${number}`);
}

export async function setPollingProfile(
  request: APIRequestContext,
  profile: PollingProfile,
): Promise<PollingProfile> {
  const response = await request.put(`${env.adminApiUrl}${ADMIN_PREFIX}/polling-profile`, {
    headers: adminHeaders(),
    data: { profile },
  });
  return (await call(response, SetPollingProfileResponseSchema, `polling profile ${profile}`))
    .profile;
}

// ── Composite helpers ──────────────────────────────────────────────────────

/**
 * Close the matchday, then load every result on it, then ask for resolution:
 * the operator flow in the order the API enforces. Resolving before the close
 * is refused with `matchday_not_locked`, which is the point of the ordering.
 */
export async function closeAndResolve(
  request: APIRequestContext,
  leagueId: string,
  number: number,
  outcomes: ReadonlyMap<string, MatchOutcome>,
): Promise<Static<typeof ResolveMatchdayResponseSchema>> {
  await closeMatchday(request, leagueId, number);
  const { matches } = await getAdminMatchday(request, leagueId, number);
  for (const match of matches) {
    await setResult(request, match.id, outcomes.get(match.id) ?? 'draw');
  }
  return resolveMatchday(request, leagueId, number);
}
