import type { Entry, Match, Matchday, PenkaSettings, PlayerPick } from '@penka/contracts';

/** Deterministic fixture builders. Every field is overridable per test. */

export function buildMatchday(overrides: Partial<Matchday> = {}): Matchday {
  return {
    id: 'md-1',
    leagueId: 'league-1',
    number: 1,
    status: 'open',
    lockAt: '2026-08-21T18:45:00.000Z',
    ...overrides,
  };
}

export function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    matchdayId: 'md-1',
    homeTeamCode: 'HOME',
    awayTeamCode: 'AWAY',
    kickoffAt: '2026-08-21T19:00:00.000Z',
    outcome: 'home',
    ...overrides,
  };
}

export function buildEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    penkaId: 'penka-1',
    userId: 'user-1',
    lives: 2,
    status: 'alive',
    usedTeams: [],
    points: 0,
    ...overrides,
  };
}

export function buildPick(overrides: Partial<PlayerPick> = {}): PlayerPick {
  return {
    id: 'pick-1',
    entryId: 'entry-1',
    matchdayId: 'md-1',
    teamCode: 'HOME',
    createdAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

export function buildSettings(overrides: Partial<PenkaSettings> = {}): PenkaSettings {
  return { lives: 2, islandEnabled: true, ...overrides };
}

/** Recursively freeze a value so any mutation attempt throws under strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Seeded LCG in [0, 1) so property-style tests are reproducible. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
