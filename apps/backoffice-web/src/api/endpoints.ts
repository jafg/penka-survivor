import {
  AdminMatchdayDetailResponseSchema,
  AdminPoolsResponseSchema,
  CloseMatchdayResponseSchema,
  ResolveMatchdayResponseSchema,
  SetPollingProfileResponseSchema,
  SetResultResponseSchema,
  type AdminMatchdayDetailResponse,
  type AdminPoolsResponse,
  type CloseMatchdayResponse,
  type PollingProfile,
  type ResolveMatchdayResponse,
  type SetPollingProfileResponse,
  type SetResultRequest,
  type SetResultResponse,
} from '@penka/contracts';
import { apiRequest } from './client';

/**
 * Every call the back office is allowed to make, one function each, named after
 * the route. Request and response shapes come from `@penka/contracts` without
 * exception — nothing in this app describes a payload itself.
 *
 * All of them are admin routes: the operator console never touches the public
 * `@penka/api`.
 */

/**
 * A matchday is addressed by LEAGUE and NUMBER, never by its id. Both go through
 * `encodeURIComponent`: the number is safe by construction, but a league id is
 * catalog data and nothing promises it stays URL-safe.
 */
function matchdayPath(leagueId: string, number: number): string {
  return `/leagues/${encodeURIComponent(leagueId)}/matchdays/${encodeURIComponent(String(number))}`;
}

export function getMatchday(
  leagueId: string,
  number: number,
): Promise<AdminMatchdayDetailResponse> {
  return apiRequest(matchdayPath(leagueId, number), {
    schema: AdminMatchdayDetailResponseSchema,
  });
}

/**
 * Locks the matchday: no more picks, and — the part the operator flow depends on
 * — the precondition of resolving it. Idempotent on the API side, so a
 * double-click is not an error.
 */
export function closeMatchday(leagueId: string, number: number): Promise<CloseMatchdayResponse> {
  return apiRequest(`${matchdayPath(leagueId, number)}/close`, {
    method: 'POST',
    schema: CloseMatchdayResponseSchema,
  });
}

/**
 * ASYNCHRONOUS. The API publishes one message per penka on the league and
 * answers `{ queued: true }` immediately; `@penka/workers` does the resolving,
 * and the matchday's status only changes when they are done. Callers report that
 * resolution was QUEUED and re-read the matchday to learn the rest.
 */
export function resolveMatchday(
  leagueId: string,
  number: number,
): Promise<ResolveMatchdayResponse> {
  return apiRequest(`${matchdayPath(leagueId, number)}/resolve`, {
    method: 'POST',
    schema: ResolveMatchdayResponseSchema,
  });
}

/**
 * A match, unlike a matchday, IS addressed by its id — it is the one thing the
 * operator has in hand from the listing. Derived ids carry colons
 * (`copa-libertadores:md2:RIV-BOC`), so the id is encoded exactly once here; the
 * API's handler deliberately does not decode again.
 */
export function setResult(matchId: string, body: SetResultRequest): Promise<SetResultResponse> {
  return apiRequest(`/matches/${encodeURIComponent(matchId)}/result`, {
    method: 'POST',
    body,
    schema: SetResultResponseSchema,
  });
}

/** Deployment-wide, so the path carries no penka and no league. */
export function setPollingProfile(profile: PollingProfile): Promise<SetPollingProfileResponse> {
  return apiRequest('/polling-profile', {
    method: 'PUT',
    body: { profile },
    schema: SetPollingProfileResponseSchema,
  });
}

export function listPools(): Promise<AdminPoolsResponse> {
  return apiRequest('/penkas', { schema: AdminPoolsResponseSchema });
}
