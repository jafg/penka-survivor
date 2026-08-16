import { Value } from '@sinclair/typebox/value';
import { PollingProfileSchema, type PollingProfile } from './api/admin';

/**
 * Where the operator's board cadence lives in Redis. ONE key for the whole
 * deployment: the profile answers "how hard may clients hammer us right now",
 * which is an operational question about the deployment, not an editorial one
 * about a single penka — a penka whose lock is minutes away already speeds
 * itself up without an operator (see `nextPollInSec` below).
 *
 * Rejected alternative, kept here as the upgrade path if editorial control is
 * ever wanted: a per-penka override read first, with this key as the fallback
 * (`penka:{penkaId}:pollingProfile` → `ops:pollingProfile` → `normal`).
 *
 * It lives in the contract because two apps must agree on it byte for byte —
 * the back office writes it, the public API reads it — and a Redis key name is
 * otherwise the one thing no compiler checks across an app boundary.
 */
export const POLLING_PROFILE_KEY = 'ops:pollingProfile';

/**
 * Whatever is stored under that key, narrowed to the contract. A missing key
 * means nobody has set a cadence; an unreadable one means the writer disagrees
 * with PollingProfileSchema, and neither is worth failing a board over.
 */
export function toPollingProfile(raw: string | null): PollingProfile {
  return Value.Check(PollingProfileSchema, raw) ? raw : 'normal';
}

/**
 * Where a penka's public board is cached. Same reason as the key above: two
 * processes must agree on it byte for byte — @penka/api builds a board here on
 * a miss and reads it on every poll, and @penka/workers overwrites it the
 * moment a matchday resolves, so players see the new standings without waiting
 * for the entry to expire.
 */
export function boardCacheKey(penkaId: string): string {
  return `penka:${penkaId}:board`;
}

/**
 * How long a cached board survives. It is a ceiling on staleness, not a
 * refresh schedule: the board is public and identical for every viewer, so one
 * entry serves all of them, and the staleness it buys errs on the safe side —
 * a board built before lock keeps hiding picks for up to a minute after it,
 * never the other way round.
 *
 * The worker writes with the same TTL rather than without one: a board that
 * outlived its writer would keep serving a resolution's standings after the
 * next matchday had already started.
 */
export const BOARD_CACHE_TTL_SECONDS = 60;

/** Seconds between board polls per profile. `slow` is for a deployment under strain. */
const POLL_SECONDS: Record<PollingProfile, number> = { live: 2, normal: 10, slow: 30 };

/** Last stretch before lock: picks land by the second, so normal speeds up. */
export const NEAR_LOCK_MS = 10 * 60_000;

export interface NextPollInput {
  profile: PollingProfile;
  now: Date;
  lockAt: Date;
}

/**
 * How long a client should wait before asking for the board again. The server
 * decides, not the client: it is the only side that knows how close the lock is
 * and how much load the deployment is under.
 *
 * `live` and `slow` are deliberate operator overrides and ignore the clock.
 * `normal` tightens to the live cadence inside the last ten minutes and stays
 * there once the matchday locks, which is exactly when picks are revealed and
 * results start landing.
 *
 * It sits beside the key an operator writes because the two are one feature —
 * and because the cadence is stamped into a cached board, so the process that
 * rebuilds that cache has to compute it the same way the one serving it does.
 */
export function nextPollInSec({ profile, now, lockAt }: NextPollInput): number {
  if (profile !== 'normal') {
    return POLL_SECONDS[profile];
  }
  const msToLock = lockAt.getTime() - now.getTime();
  return msToLock < NEAR_LOCK_MS ? POLL_SECONDS.live : POLL_SECONDS.normal;
}
