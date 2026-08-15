import type { Entry, Match, Matchday, PenkaSettings, PlayerPick } from '@penka/contracts';
import type { EntryEffect, ResolveMatchdayResult } from './types';

export interface ResolveMatchdayInput {
  matchday: Matchday;
  entries: readonly Entry[];
  picks: readonly PlayerPick[];
  matches: readonly Match[];
  settings: PenkaSettings;
}

function findTeamMatch(matches: readonly Match[], teamCode: string): Match | undefined {
  return matches.find((match) => match.homeTeamCode === teamCode || match.awayTeamCode === teamCode);
}

function isWin(match: Match, teamCode: string): boolean {
  return (
    (match.outcome === 'home' && match.homeTeamCode === teamCode) ||
    (match.outcome === 'away' && match.awayTeamCode === teamCode)
  );
}

function islandEffect(
  entry: Entry,
  pick: PlayerPick | undefined,
  matches: readonly Match[],
  settings: PenkaSettings,
): EntryEffect {
  const base: EntryEffect = {
    entryId: entry.id,
    livesDelta: 0,
    pointsDelta: 0,
    newLives: entry.lives,
    newStatus: 'island',
    teamConsumed: null,
  };
  if (!settings.islandEnabled || pick === undefined) {
    return base;
  }
  const match = findTeamMatch(matches, pick.teamCode);
  if (match === undefined) {
    return base;
  }
  return { ...base, pointsDelta: isWin(match, pick.teamCode) ? 1 : 0, teamConsumed: pick.teamCode };
}

function aliveLossEffect(entry: Entry, teamConsumed: string | null): EntryEffect {
  const livesDelta = entry.lives > 0 ? -1 : 0;
  const newLives = entry.lives + livesDelta;
  return {
    entryId: entry.id,
    livesDelta,
    pointsDelta: 0,
    newLives,
    newStatus: newLives === 0 ? 'island' : 'alive',
    teamConsumed,
  };
}

function aliveEffect(
  entry: Entry,
  pick: PlayerPick | undefined,
  matches: readonly Match[],
): EntryEffect {
  if (pick === undefined) {
    return aliveLossEffect(entry, null);
  }
  const match = findTeamMatch(matches, pick.teamCode);
  if (match === undefined) {
    // Pick for a team not playing this matchday: counts as a missed pick,
    // and the team is not consumed.
    return aliveLossEffect(entry, null);
  }
  if (isWin(match, pick.teamCode)) {
    return {
      entryId: entry.id,
      livesDelta: 0,
      pointsDelta: 1,
      newLives: entry.lives,
      newStatus: 'alive',
      teamConsumed: pick.teamCode,
    };
  }
  return aliveLossEffect(entry, pick.teamCode);
}

/**
 * Resolve one matchday: pure data in, per-entry effect deltas out. Rules:
 * a winning pick survives (and counts a point), a draw/loss/missed pick costs an
 * alive entry one life, an entry reaching 0 lives moves to the island, island
 * entries never lose lives and earn a point per correct pick (unless the penka
 * has the island disabled, which voids their picks).
 *
 * Rejects with `already_resolved` when the matchday was resolved before, with
 * `matchday_not_locked` while it is still open for picks, and with
 * `results_missing` when any of its matches has no outcome yet.
 */
export function resolveMatchday(input: ResolveMatchdayInput): ResolveMatchdayResult {
  const { matchday, entries, picks, matches, settings } = input;

  if (matchday.status === 'resolved') {
    return { ok: false, code: 'already_resolved' };
  }
  if (matchday.status === 'open') {
    return { ok: false, code: 'matchday_not_locked' };
  }
  const matchdayMatches = matches.filter((match) => match.matchdayId === matchday.id);
  if (matchdayMatches.some((match) => match.outcome === null)) {
    return { ok: false, code: 'results_missing' };
  }

  // First submitted pick per entry wins; O(entries + picks) instead of a scan per entry.
  const pickByEntryId = new Map<string, PlayerPick>();
  for (const pick of picks) {
    if (pick.matchdayId === matchday.id && !pickByEntryId.has(pick.entryId)) {
      pickByEntryId.set(pick.entryId, pick);
    }
  }

  const resolvedEntries = entries.map((entry) => {
    const pick = pickByEntryId.get(entry.id);
    const effect =
      entry.status === 'island'
        ? islandEffect(entry, pick, matchdayMatches, settings)
        : aliveEffect(entry, pick, matchdayMatches);
    return { entry, effect };
  });

  const effects = resolvedEntries.map(({ effect }) => effect);
  const eliminatedEntryIds = resolvedEntries
    .filter(
      ({ entry, effect }) =>
        entry.status === 'alive' && effect.newStatus === 'island' && effect.livesDelta === -1,
    )
    .map(({ entry }) => entry.id);

  const aliveBefore = entries.filter((entry) => entry.status === 'alive').length;
  const aliveAfter = effects.filter((effect) => effect.newStatus === 'alive').length;

  return {
    ok: true,
    outcome: {
      matchdayId: matchday.id,
      matchdayNumber: matchday.number,
      effects,
      eliminatedEntryIds,
      summary: {
        totalEntries: entries.length,
        aliveBefore,
        aliveAfter,
        islandBefore: entries.length - aliveBefore,
        islandAfter: effects.length - aliveAfter,
        eliminated: eliminatedEntryIds.length,
      },
    },
  };
}
