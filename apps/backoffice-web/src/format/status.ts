import type { MatchdayStatus } from '@penka/contracts';

/**
 * The prototype's three labels; the contract's three statuses.
 *
 * Shared rather than owned by `StatusPill`, because the matchday selector names
 * the same statuses in an `aria-label` where a pill cannot go — and two spellings
 * of "Resuelta" is exactly the drift no compiler catches.
 */
const LABELS: Record<MatchdayStatus, string> = {
  open: 'Abierta',
  locked: 'Cerrada',
  resolved: 'Resuelta',
};

export function matchdayStatusLabel(status: MatchdayStatus): string {
  return LABELS[status];
}
