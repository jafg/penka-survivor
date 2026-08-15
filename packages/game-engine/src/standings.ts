import type { Entry } from '@penka/contracts';

export interface Standings {
  alive: Entry[];
  island: Entry[];
}

/** Lexicographic id comparison — a deterministic final tiebreaker (no locale involved). */
function byIdAsc(a: Entry, b: Entry): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function byAliveRank(a: Entry, b: Entry): number {
  return b.lives - a.lives || b.points - a.points || byIdAsc(a, b);
}

function byIslandRank(a: Entry, b: Entry): number {
  return b.points - a.points || byIdAsc(a, b);
}

/**
 * Split entries into the two boards. Sort order (documented, deterministic):
 * - alive: lives desc, then points (correct picks) desc, then id asc
 * - island: points desc, then id asc
 * The input is not mutated; new arrays are returned.
 */
export function computeStandings(entries: readonly Entry[]): Standings {
  return {
    alive: entries.filter((entry) => entry.status === 'alive').sort(byAliveRank),
    island: entries.filter((entry) => entry.status === 'island').sort(byIslandRank),
  };
}

/**
 * Final ordering at tournament end: every alive entry outranks every island
 * entry; alive entries rank by most lives, then most total correct picks
 * (points), then id for determinism. The first element is the winner.
 */
export function rankWinners(entries: readonly Entry[]): Entry[] {
  const { alive, island } = computeStandings(entries);
  return [...alive, ...island];
}
