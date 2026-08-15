import { describe, expect, it } from 'vitest';
import type { Entry, Match, MatchOutcome, PlayerPick } from '@penka/contracts';
import { resolveMatchday } from './resolve-matchday';
import { computeStandings } from './standings';
import {
  buildEntry,
  buildMatch,
  buildMatchday,
  buildPick,
  buildSettings,
  createRng,
  deepFreeze,
} from './test-support/build';

const OUTCOMES: MatchOutcome[] = ['home', 'draw', 'away'];

function randomScenario(seed: number) {
  const rand = createRng(seed);
  const int = (max: number) => Math.floor(rand() * max);

  const matchCount = 2 + int(4);
  const matches: Match[] = [];
  for (let i = 0; i < matchCount; i += 1) {
    matches.push(
      buildMatch({
        id: `match-${i}`,
        homeTeamId: `team-${2 * i}`,
        awayTeamId: `team-${2 * i + 1}`,
        outcome: OUTCOMES[int(3)],
      }),
    );
  }

  const entryCount = 1 + int(8);
  const entries: Entry[] = [];
  const picks: PlayerPick[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    const alive = rand() < 0.7;
    entries.push(
      buildEntry({
        id: `entry-${i}`,
        status: alive ? 'alive' : 'island',
        lives: alive ? 1 + int(3) : 0,
        points: int(5),
      }),
    );
    if (rand() < 0.8) {
      picks.push(
        buildPick({ id: `pick-${i}`, entryId: `entry-${i}`, teamId: `team-${int(2 * matchCount)}` }),
      );
    }
  }

  return deepFreeze({
    matchday: buildMatchday({ status: 'locked' as const }),
    entries,
    picks,
    matches,
    settings: buildSettings({ islandEnabled: rand() < 0.5 }),
  });
}

describe('property: entry conservation over random valid scenarios', () => {
  it('alive + island always sum to the input entries, and resolution stays deterministic', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const input = randomScenario(seed);
      const result = resolveMatchday(input);
      if (!result.ok) throw new Error(`seed ${seed}: unexpected rejection ${result.code}`);
      const { outcome } = result;

      expect(outcome.effects).toHaveLength(input.entries.length);
      expect(outcome.summary.aliveAfter + outcome.summary.islandAfter).toBe(input.entries.length);

      const updated: Entry[] = input.entries.map((entry, index) => {
        const effect = outcome.effects[index];
        if (effect === undefined) throw new Error(`seed ${seed}: missing effect at ${index}`);
        expect(effect.entryId).toBe(entry.id);
        expect(effect.newLives).toBeGreaterThanOrEqual(0);
        return {
          ...entry,
          lives: effect.newLives,
          status: effect.newStatus,
          points: entry.points + effect.pointsDelta,
        };
      });
      const { alive, island } = computeStandings(updated);
      expect(alive.length + island.length).toBe(input.entries.length);

      expect(resolveMatchday(input)).toEqual(result);
    }
  });
});
