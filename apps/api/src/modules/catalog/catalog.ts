import type { FixtureTemplate, League, LeagueSummary, Region, Team } from '@penka/contracts';
import { LEAGUES, type LeagueData } from './data';
import { buildRoundRobin } from './schedule';

export interface CatalogLeague {
  league: League;
  teams: Team[];
  fixtureTemplate: FixtureTemplate;
}

/**
 * When each matchday locks, in minutes AFTER the template is materialized into
 * a penka: +2h, +26h, +50h. The offsets are relative on purpose — a demo seeded
 * at any hour of any day always opens with matchday 1 pickable for two hours
 * and the next two a day apart, so nothing goes stale and no data needs
 * reseeding before a presentation.
 */
export const LOCK_OFFSET_MINUTES = [2 * 60, 26 * 60, 50 * 60];

const MATCHDAY_COUNT = LOCK_OFFSET_MINUTES.length;

function buildCatalogLeague(data: LeagueData): CatalogLeague {
  const rounds = buildRoundRobin(
    data.teams.map((team) => team.code),
    MATCHDAY_COUNT,
  );
  return {
    league: { id: data.id, name: data.name, region: data.region, season: data.season },
    teams: data.teams,
    fixtureTemplate: {
      leagueId: data.id,
      matchdays: rounds.map((matchups, index) => {
        const lockAtOffsetMinutes = LOCK_OFFSET_MINUTES[index];
        if (lockAtOffsetMinutes === undefined) {
          throw new Error(`no lock offset configured for matchday ${index + 1}`);
        }
        return { number: index + 1, lockAtOffsetMinutes, matchups };
      }),
    },
  };
}

/** The whole catalog, assembled once at module load — it never changes at runtime. */
export const CATALOG: CatalogLeague[] = LEAGUES.map(buildCatalogLeague);

export function listLeagues(region?: Region): LeagueSummary[] {
  return CATALOG.filter((entry) => region === undefined || entry.league.region === region).map(
    ({ league, teams }) => ({
      id: league.id,
      name: league.name,
      region: league.region,
      teamCount: teams.length,
    }),
  );
}

export function findLeague(leagueId: string): CatalogLeague | undefined {
  return CATALOG.find((entry) => entry.league.id === leagueId);
}
