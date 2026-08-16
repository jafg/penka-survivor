import { tryIsoToEpochMs } from '@penka/game-engine';

/**
 * `18:30` — a kickoff or a lock time on the operator's own clock.
 *
 * The admin API sends full ISO instants; the prototype's mock sent `"18:30"`
 * strings and so never had to decide a timezone. A console run from Montevideo
 * against a UTC server would otherwise show times three hours off. The timezone
 * is a parameter only so tests can pin one.
 */
export function formatTime(iso: string, timeZone?: string): string {
  const epochMs = tryIsoToEpochMs(iso);
  if (epochMs === null) {
    return '—';
  }
  return new Intl.DateTimeFormat('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(epochMs));
}
