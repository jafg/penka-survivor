import type { AdminPoolSummary, Entry, Matchday, Penka } from '@penka/contracts';
import { selectCurrentMatchday } from '@penka/game-engine';

/** The only two fields of a pick this listing reads. */
export interface PickRef {
  entryId: string;
  matchdayId: string;
}

export interface PoolInput {
  penkas: readonly Penka[];
  entries: readonly Entry[];
  matchdays: readonly Matchday[];
  picks: readonly PickRef[];
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group === undefined) {
      groups.set(key(item), [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

/**
 * The matchday being played on each of these leagues. The route uses it to
 * bound its pick query: `picksReceived` only ever asks about the current
 * matchday, so loading a season's worth of picks to count one matchday's would
 * grow that query for nothing.
 */
export function currentMatchdayIds(matchdays: readonly Matchday[]): string[] {
  return [...groupBy(matchdays, (matchday) => matchday.leagueId).values()].flatMap((ofLeague) => {
    const current = selectCurrentMatchday(ofLeague);
    return current === undefined ? [] : [current.id];
  });
}

/**
 * The operator's overview, assembled in memory from four flat reads.
 *
 * Pure on purpose: the route does the I/O, so what "picks received" means is
 * testable without a database. It is a projection, not a rule — which matchday
 * is current comes from the engine (`selectCurrentMatchday`), the same answer
 * the players' API shows, so the two can never disagree about which matchday an
 * operator is looking at.
 *
 * Penkas on the SAME league share a calendar and therefore share matchday ids,
 * so a pick belongs to a penka only through its entry — never through its
 * matchday.
 */
export function summarizePools(input: PoolInput): AdminPoolSummary[] {
  const entriesByPenka = groupBy(input.entries, (entry) => entry.penkaId);
  const matchdaysByLeague = groupBy(input.matchdays, (matchday) => matchday.leagueId);
  const pickedEntriesByMatchday = groupBy(input.picks, (pick) => pick.matchdayId);

  return input.penkas.map((penka) => {
    const entries = entriesByPenka.get(penka.id) ?? [];
    const matchdays = matchdaysByLeague.get(penka.leagueId) ?? [];
    const current = selectCurrentMatchday(matchdays);
    const entryIds = new Set(entries.map((entry) => entry.id));
    const picks = current === undefined ? [] : (pickedEntriesByMatchday.get(current.id) ?? []);

    return {
      penka,
      entryCount: entries.length,
      aliveCount: entries.filter((entry) => entry.status === 'alive').length,
      islandCount: entries.filter((entry) => entry.status === 'island').length,
      picksReceived: picks.filter((pick) => entryIds.has(pick.entryId)).length,
      resolvedMatchdays: matchdays.filter((matchday) => matchday.status === 'resolved').length,
    };
  });
}
