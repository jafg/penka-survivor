import { describe, expect, it } from 'vitest';
import { resolveMatchday } from './resolve-matchday';
import { pickResultOf } from './pick-result';
import type { EntryEffect } from './types';
import { buildEntry, buildMatch, buildMatchday, buildPick, buildSettings } from './test-support/build';

function effect(overrides: Partial<EntryEffect> = {}): EntryEffect {
  return {
    entryId: 'entry-1',
    livesDelta: 0,
    pointsDelta: 0,
    newLives: 2,
    newStatus: 'alive',
    teamConsumed: null,
    ...overrides,
  };
}

describe('pickResultOf', () => {
  it('calls a scoring pick won', () => {
    expect(pickResultOf(effect({ pointsDelta: 1, teamConsumed: 'HOME' }))).toBe('won');
  });

  it('calls a pick that cost a life lost', () => {
    expect(pickResultOf(effect({ livesDelta: -1, newLives: 1, teamConsumed: 'HOME' }))).toBe('lost');
  });

  it('calls an island pick that scored nothing lost, not void', () => {
    // Island players cannot lose a life, so livesDelta alone would read every
    // one of their wrong picks as "never counted" — but it did count: the team
    // was consumed and the point was not earned.
    expect(pickResultOf(effect({ newStatus: 'island', newLives: 0, teamConsumed: 'HOME' }))).toBe(
      'lost',
    );
  });

  it('calls a pick the resolution never counted void', () => {
    // Nothing happened to the entry and no team was spent: the penka has the
    // island disabled, so this player's pick was voided rather than played.
    expect(pickResultOf(effect({ newStatus: 'island', newLives: 0 }))).toBe('void');
  });

  it('calls a pick for a team that did not play lost, because it still cost a life', () => {
    expect(pickResultOf(effect({ livesDelta: -1, newLives: 1 }))).toBe('lost');
  });
});

describe('pickResultOf over real resolution effects', () => {
  const matches = [
    buildMatch({ id: 'm1', homeTeamCode: 'HOME', awayTeamCode: 'AWAY', outcome: 'home' }),
  ];
  const matchday = buildMatchday({ status: 'locked' });

  function resultsFor(entries: ReturnType<typeof buildEntry>[], islandEnabled = true) {
    const result = resolveMatchday({
      matchday,
      entries,
      picks: entries.map((entry) =>
        buildPick({
          id: `pick-${entry.id}`,
          entryId: entry.id,
          teamCode: entry.id === 'winner' ? 'HOME' : 'AWAY',
        }),
      ),
      matches,
      settings: buildSettings({ islandEnabled }),
    });
    if (!result.ok) {
      throw new Error(`expected a resolvable matchday, got ${result.code}`);
    }
    return result.outcome.effects.map(pickResultOf);
  }

  it('labels the picks of a played matchday', () => {
    expect(
      resultsFor([
        buildEntry({ id: 'winner' }),
        buildEntry({ id: 'loser' }),
        buildEntry({ id: 'islander', status: 'island', lives: 0 }),
      ]),
    ).toEqual(['won', 'lost', 'lost']);
  });

  it('voids island picks in a penka that has the island turned off', () => {
    expect(
      resultsFor([buildEntry({ id: 'islander', status: 'island', lives: 0 })], false),
    ).toEqual(['void']);
  });
});
