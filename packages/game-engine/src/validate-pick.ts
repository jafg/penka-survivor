import type { Entry, Match, Matchday, PenkaSettings } from '@penka/contracts';
import { tryIsoToEpochMs } from './time';
import type { PickValidation } from './types';

export interface ValidatePickInput {
  entry: Entry;
  matchday: Matchday;
  matches: readonly Match[];
  teamId: string;
  /** The caller's clock as an ISO-8601 instant — the engine never reads the system clock. */
  now: string;
  settings: PenkaSettings;
}

/**
 * Can this entry pick this team right now? Checks run in a fixed order:
 * matchday_locked → validation_failed (unparsable timestamps) → on_island →
 * team_not_playing → team_already_used. Never throws: a malformed `now` or
 * `lockAt` is a typed rejection, not an exception.
 *
 * Island entries may keep picking (they earn points) unless the penka has the
 * island disabled, in which case they are out of the game entirely.
 */
export function validatePick(input: ValidatePickInput): PickValidation {
  const { entry, matchday, matches, teamId, now, settings } = input;

  if (matchday.status !== 'open') {
    return { ok: false, code: 'matchday_locked' };
  }
  const nowMs = tryIsoToEpochMs(now);
  const lockAtMs = tryIsoToEpochMs(matchday.lockAt);
  if (nowMs === null || lockAtMs === null) {
    return { ok: false, code: 'validation_failed' };
  }
  if (nowMs >= lockAtMs) {
    return { ok: false, code: 'matchday_locked' };
  }
  if (entry.status === 'island' && !settings.islandEnabled) {
    return { ok: false, code: 'on_island' };
  }
  const playing = matches.some(
    (match) =>
      match.matchdayId === matchday.id &&
      (match.homeTeamId === teamId || match.awayTeamId === teamId),
  );
  if (!playing) {
    return { ok: false, code: 'team_not_playing' };
  }
  if (entry.usedTeams.includes(teamId)) {
    return { ok: false, code: 'team_already_used' };
  }
  return { ok: true };
}
