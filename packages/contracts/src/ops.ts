import { Value } from '@sinclair/typebox/value';
import { PollingProfileSchema, type PollingProfile } from './api/admin';

/**
 * Where the operator's board cadence lives in Redis. ONE key for the whole
 * deployment: the profile answers "how hard may clients hammer us right now",
 * which is an operational question about the deployment, not an editorial one
 * about a single penka — a penka whose lock is minutes away already speeds
 * itself up without an operator (see `nextPollInSec` in @penka/api).
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
