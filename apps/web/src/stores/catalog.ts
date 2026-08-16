import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LeagueSummary, Team } from '@penka/contracts';
import { getLeague, listLeagues } from '../api/endpoints';

/**
 * The league catalog: leagues to create a penka in, and the team codes → names
 * mapping every other screen needs.
 *
 * The game API speaks catalog CODES and nothing else — a board pick is `"RIV"`,
 * a fixture is `RIV` vs `BOC`. This store is the only place that knows those
 * codes stand for "River Plate" and "Boca Juniors", and it learns it from the
 * catalog route. Hard-coding the mapping in a component would make the app wrong
 * the day an operator adds a league.
 *
 * PUBLIC and static for a season, so it is cached per league and fetched once.
 */
export const useCatalogStore = defineStore('catalog', () => {
  const leagues = ref<LeagueSummary[]>([]);
  const teamsByLeague = ref<Record<string, Team[]>>({});
  const namesByCode = ref<Record<string, string>>({});
  const leagueNamesById = ref<Record<string, string>>({});

  /** Requests in flight, so two screens mounting together fetch once. */
  const pending = new Map<string, Promise<void>>();

  async function loadLeagues(): Promise<void> {
    try {
      const listing = (await listLeagues()).leagues;
      leagues.value = listing;
      leagueNamesById.value = {
        ...leagueNamesById.value,
        ...Object.fromEntries(listing.map((league) => [league.id, league.name])),
      };
    } catch {
      // The catalog is decoration on every screen but the create form, and that
      // form reports its own empty state. Failing loudly here would take down
      // a board over a list of league names.
    }
  }

  async function loadLeague(leagueId: string): Promise<void> {
    if (teamsByLeague.value[leagueId] !== undefined) {
      return;
    }
    const existing = pending.get(leagueId);
    if (existing !== undefined) {
      return existing;
    }
    const request = getLeague(leagueId)
      .then((detail) => {
        teamsByLeague.value = { ...teamsByLeague.value, [leagueId]: detail.teams };
        namesByCode.value = {
          ...namesByCode.value,
          ...Object.fromEntries(detail.teams.map((team) => [team.code, team.name])),
        };
        leagueNamesById.value = {
          ...leagueNamesById.value,
          [detail.league.id]: detail.league.name,
        };
      })
      .catch(() => {
        // Nothing cached: `teamName` falls back to the code and the next screen
        // that needs the catalog tries again. Caching the hole would leave a
        // penka showing codes until a reload.
      })
      .finally(() => {
        pending.delete(leagueId);
      });
    pending.set(leagueId, request);
    return request;
  }

  /**
   * The code itself when the catalog has not answered yet. A player reading
   * "RIV" can still play; a player reading an empty card cannot.
   */
  function teamName(teamCode: string): string {
    return namesByCode.value[teamCode] ?? teamCode;
  }

  function teamsOf(leagueId: string): Team[] {
    return teamsByLeague.value[leagueId] ?? [];
  }

  /** Same fallback as `teamName`, and for the same reason. */
  function leagueName(leagueId: string): string {
    return leagueNamesById.value[leagueId] ?? leagueId;
  }

  return { leagues, loadLeagues, loadLeague, teamName, teamsOf, leagueName };
});
