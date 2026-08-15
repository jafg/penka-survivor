import { matchId, matchdayId } from '@penka/contracts';
import type { CatalogLeague } from '../catalog/catalog';
import type { MatchDoc, MatchdayDoc } from './store';

export interface LeagueCalendar {
  matchdays: MatchdayDoc[];
  matches: MatchDoc[];
}

/**
 * Turn a league's fixture template into the documents Mongo stores, resolving
 * the template's RELATIVE lock offsets against `now`. This is the one moment
 * the calendar meets the clock: whichever penka materializes a league first
 * fixes its dates for every penka that follows.
 *
 * Pure — no I/O, no clock reading — so materialization stays testable and the
 * document ids stay deterministic.
 */
export function buildLeagueCalendar(entry: CatalogLeague, now: Date): LeagueCalendar {
  const leagueId = entry.league.id;
  const matchdays: MatchdayDoc[] = [];
  const matches: MatchDoc[] = [];

  for (const template of entry.fixtureTemplate.matchdays) {
    const _id = matchdayId(leagueId, template.number);
    const lockAt = new Date(now.getTime() + template.lockAtOffsetMinutes * 60_000);
    matchdays.push({ _id, leagueId, number: template.number, status: 'open', lockAt });

    for (const { homeTeamCode, awayTeamCode } of template.matchups) {
      matches.push({
        _id: matchId(_id, homeTeamCode, awayTeamCode),
        matchdayId: _id,
        leagueId,
        homeTeamCode,
        awayTeamCode,
        // The MVP locks picks at kickoff: one instant per matchday.
        kickoffAt: lockAt,
        outcome: null,
      });
    }
  }

  return { matchdays, matches };
}
