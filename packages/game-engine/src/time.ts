/**
 * Deterministic ISO-8601 → epoch-milliseconds conversion. The engine never
 * reads the system clock; every instant arrives as an argument and is compared
 * through this helper.
 */
export function isoToEpochMs(iso: string): number {
  const ms = tryIsoToEpochMs(iso);
  if (ms === null) {
    throw new Error(`Invalid ISO-8601 timestamp: ${iso}`);
  }
  return ms;
}

/** Non-throwing variant: null instead of an exception for unparsable input. */
export function tryIsoToEpochMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}
