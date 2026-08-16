import { Type, type Static } from '@sinclair/typebox';
import { IdSchema, MatchOutcomeSchema, MatchSchema, MatchdaySchema, PenkaSchema } from '../domain';
import { StrictObject } from '../strict';

/**
 * The header every admin route authenticates on, carrying the deployment's
 * shared `ADMIN_API_KEY`.
 *
 * It lives in the contract for the same reason `POLLING_PROFILE_KEY` does: two
 * apps must agree on it byte for byte — `@penka/backoffice-api` compares it,
 * `@penka/backoffice-web` sends it — and a header name is otherwise the one
 * thing no compiler checks across an app boundary. Spelled in both, a rename on
 * the API side would still compile everywhere and turn every operator request
 * into a 401 at runtime.
 *
 * **Lowercase on purpose.** The server reads it as `request.headers[...]`, an
 * exact lookup on an object Node has already lowercased; HTTP header names are
 * case-insensitive on the wire, so a browser sending `X-Admin-Key` matches this
 * fine, but a constant spelled that way would never match on the server.
 *
 * The shared-secret scheme itself is an MVP decision documented at its check
 * (`apps/backoffice-api/src/plugins/admin-auth.ts`); when it is replaced by
 * role-based users this constant goes with it.
 */
export const ADMIN_KEY_HEADER = 'x-admin-key';

/**
 * Board polling cadence profiles an operator can set for the DEPLOYMENT, not
 * for one penka: the profile is a load valve ("how hard may clients hammer us
 * right now"). Editorial speed-up needs no operator — a board tightens itself
 * inside the last minutes before its lock. See POLLING_PROFILE_KEY for the one
 * key it is stored under and for the per-penka design that was rejected.
 */
export const PollingProfileSchema = Type.Union([
  Type.Literal('live'),
  Type.Literal('normal'),
  Type.Literal('slow'),
]);
export type PollingProfile = Static<typeof PollingProfileSchema>;

/**
 * How every matchday route addresses its matchday: by the LEAGUE it belongs to
 * and its number. Matchdays belong to a league, not to a penka, and their
 * document id is derived from exactly these two values (`matchdayId`) — so
 * taking an id from the caller would let an operator address a document
 * belonging to a league other than the one in their path.
 */
export const LeagueMatchdayParamsSchema = StrictObject({
  leagueId: IdSchema,
  number: Type.Integer({ minimum: 1 }),
});
export type LeagueMatchdayParams = Static<typeof LeagueMatchdayParamsSchema>;

/**
 * A match, on the other hand, IS addressed by its id: it is the one thing an
 * operator has in hand from the matchday listing. Derived ids carry colons
 * (`copa-libertadores:md1:RIV-BOC`), which is nothing to a schema but means
 * clients must `encodeURIComponent` the id into the path.
 */
export const MatchParamsSchema = StrictObject({
  matchId: IdSchema,
});
export type MatchParams = Static<typeof MatchParamsSchema>;

// GET /admin/v1/penkas
export const AdminPoolSummarySchema = StrictObject({
  penka: PenkaSchema,
  entryCount: Type.Integer({ minimum: 0 }),
  aliveCount: Type.Integer({ minimum: 0 }),
  islandCount: Type.Integer({ minimum: 0 }),
  /** Picks in for the current matchday — whether the players are ready. */
  picksReceived: Type.Integer({ minimum: 0 }),
  /** How far the competition has actually run. */
  resolvedMatchdays: Type.Integer({ minimum: 0 }),
});
export type AdminPoolSummary = Static<typeof AdminPoolSummarySchema>;

export const AdminPoolsResponseSchema = StrictObject({
  pools: Type.Array(AdminPoolSummarySchema),
});
export type AdminPoolsResponse = Static<typeof AdminPoolsResponseSchema>;

// GET /admin/v1/leagues/:leagueId/matchdays/:number
export const AdminMatchdayDetailResponseSchema = StrictObject({
  matchday: MatchdaySchema,
  matches: Type.Array(MatchSchema),
  /** The cadence being served right now, on the same closed set the operator can write. */
  pollingProfile: PollingProfileSchema,
});
export type AdminMatchdayDetailResponse = Static<typeof AdminMatchdayDetailResponseSchema>;

// POST /admin/v1/matches/:matchId/result — the match is named by the path, never twice
export const SetResultRequestSchema = StrictObject({
  outcome: MatchOutcomeSchema,
});
export type SetResultRequest = Static<typeof SetResultRequestSchema>;

/**
 * The written match plus what the operator needs to decide their next step:
 * how many matches on that matchday still have no result, and whether resolve
 * would be accepted right now (locked AND complete). The back office greys out
 * its own button from `readyToResolve` instead of re-deriving the rule.
 */
export const SetResultResponseSchema = StrictObject({
  match: MatchSchema,
  pendingMatches: Type.Integer({ minimum: 0 }),
  readyToResolve: Type.Boolean(),
});
export type SetResultResponse = Static<typeof SetResultResponseSchema>;

// POST /admin/v1/leagues/:leagueId/matchdays/:number/close
export const CloseMatchdayResponseSchema = StrictObject({
  matchday: MatchdaySchema,
});
export type CloseMatchdayResponse = Static<typeof CloseMatchdayResponseSchema>;

// POST /admin/v1/leagues/:leagueId/matchdays/:number/resolve — queued, never synchronous
export const ResolveMatchdayResponseSchema = StrictObject({
  queued: Type.Literal(true),
  matchdayId: IdSchema,
});
export type ResolveMatchdayResponse = Static<typeof ResolveMatchdayResponseSchema>;

// PUT /admin/v1/polling-profile — deployment-wide, so the path carries no penka
export const SetPollingProfileRequestSchema = StrictObject({
  profile: PollingProfileSchema,
});
export type SetPollingProfileRequest = Static<typeof SetPollingProfileRequestSchema>;

export const SetPollingProfileResponseSchema = StrictObject({
  profile: PollingProfileSchema,
});
export type SetPollingProfileResponse = Static<typeof SetPollingProfileResponseSchema>;
