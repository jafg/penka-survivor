import type { MatchOutcome } from '@penka/contracts';
import { tryIsoToEpochMs } from '@penka/game-engine';

/**
 * `Vie 18:00` — the day and the kickoff, in the viewer's own timezone.
 *
 * A penka spans countries: the Libertadores has teams in six of them, and a
 * deadline printed in the server's zone is a deadline someone will miss. The
 * timezone is a parameter only so tests can pin one; production leaves it out
 * and gets the browser's.
 */
export function formatKickoff(iso: string, timeZone?: string): string {
  const epochMs = tryIsoToEpochMs(iso);
  if (epochMs === null) {
    return '—';
  }
  const parts = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).formatToParts(new Date(epochMs));

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '';
  // `es-AR` gives "vie"; the prototype's slot is capitalised.
  const day = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
  return `${day} ${hour}:${minute}`;
}

/**
 * What happened, in words.
 *
 * The prototype printed a scoreline — "2–0", "1–1" — but those digits were its
 * mock's invention: neither the mock nor the real API ever carried goals. A
 * `MatchSchema` has an outcome and nothing else, so this says exactly that much.
 */
export function outcomeLabel(outcome: MatchOutcome): string {
  if (outcome === 'home') {
    return 'Ganó local';
  }
  if (outcome === 'away') {
    return 'Ganó visitante';
  }
  return 'Empate';
}
