import { Value } from '@sinclair/typebox/value';
import { PollingProfileSchema, type PollingProfile } from '@penka/contracts';

/**
 * Where the back office will publish the cadence (a later prompt writes it).
 * One key for the whole deployment: the profile answers "how hard may clients
 * hammer us right now", which is an operational question, not a per-penka one.
 */
export const POLLING_PROFILE_KEY = 'ops:pollingProfile';

/**
 * Seconds between board polls per profile. `slow` is the contract's third
 * profile (PollingProfileSchema) — the one to set when the deployment is under
 * strain and every extra poll costs more than freshness is worth.
 */
const POLL_SECONDS: Record<PollingProfile, number> = { live: 2, normal: 10, slow: 30 };

/** Last stretch before lock: picks land by the second, so normal speeds up. */
export const NEAR_LOCK_MS = 10 * 60_000;

/**
 * Whatever the back office wrote, narrowed to the contract. A missing key means
 * nobody has set a cadence; an unreadable one means the writer disagrees with
 * PollingProfileSchema, and neither is worth failing a public board over.
 */
export function toPollingProfile(raw: string | null): PollingProfile {
  return Value.Check(PollingProfileSchema, raw) ? raw : 'normal';
}

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
 */
export function nextPollInSec({ profile, now, lockAt }: NextPollInput): number {
  if (profile !== 'normal') {
    return POLL_SECONDS[profile];
  }
  const msToLock = lockAt.getTime() - now.getTime();
  return msToLock < NEAR_LOCK_MS ? POLL_SECONDS.live : POLL_SECONDS.normal;
}
