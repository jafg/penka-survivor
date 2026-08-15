/**
 * Shared valid payloads for contract tests. Every fixture must pass its schema;
 * tests derive invalid payloads from these by omitting, mutating, or extending fields.
 */

export function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const copy = { ...source } as Record<string, unknown>;
  delete copy[key as string];
  return copy as Omit<T, K>;
}

export const team = { code: 'RIV', name: 'River Plate', country: 'Argentina' };

export const league = {
  id: 'league-1',
  name: 'Liga Profesional',
  region: 'america',
  season: '2026',
};

export const leagueSummary = {
  id: 'league-1',
  name: 'Liga Profesional',
  region: 'america',
  teamCount: 8,
};

export const fixtureTemplate = {
  leagueId: 'league-1',
  matchdays: [
    {
      number: 1,
      lockAtOffsetMinutes: 120,
      matchups: [{ homeTeamCode: 'RIV', awayTeamCode: 'BOC' }],
    },
    {
      number: 2,
      lockAtOffsetMinutes: 1560,
      matchups: [{ homeTeamCode: 'BOC', awayTeamCode: 'RIV' }],
    },
  ],
};

/**
 * A materialized team id. Catalog teams are identified by their stable `code`;
 * once a fixture template is materialized into a penka, teams get real ids.
 */
export const teamId = 'team-1';

export const match = {
  id: 'match-1',
  matchdayId: 'matchday-1',
  homeTeamId: 'team-1',
  awayTeamId: 'team-2',
  kickoffAt: '2026-08-21T19:00:00.000Z',
  outcome: null,
};

export const matchday = {
  id: 'matchday-1',
  leagueId: 'league-1',
  number: 1,
  status: 'open',
  lockAt: '2026-08-21T18:45:00.000Z',
};

export const user = {
  id: 'user-1',
  email: 'ana@example.com',
  displayName: 'Ana',
  createdAt: '2026-08-01T12:00:00.000Z',
};

export const penkaSettings = { lives: 2, islandEnabled: true };

export const penka = {
  id: 'penka-1',
  leagueId: 'league-1',
  name: 'Oficina BA',
  joinCode: 'ABC123',
  settings: penkaSettings,
  createdAt: '2026-08-02T12:00:00.000Z',
};

export const entry = {
  id: 'entry-1',
  penkaId: 'penka-1',
  userId: 'user-1',
  lives: 2,
  status: 'alive',
  usedTeams: ['team-1'],
  points: 3,
};

export const pick = {
  id: 'pick-1',
  entryId: 'entry-1',
  matchdayId: 'matchday-1',
  teamId: 'team-1',
  createdAt: '2026-08-20T10:00:00.000Z',
};

export const resolution = {
  id: 'resolution-1',
  penkaId: 'penka-1',
  matchdayId: 'matchday-1',
  resolvedAt: '2026-08-22T00:00:00.000Z',
  eliminatedEntryIds: ['entry-2'],
  islandEntryIds: ['entry-3'],
};

export const boardPlayer = { displayName: 'Ana', lives: 2 };

export const board = {
  matchday: 2,
  lockAt: '2026-08-28T18:45:00.000Z',
  isLocked: false,
  isResolved: false,
  alive: [boardPlayer],
  island: [{ displayName: 'Luis', lives: 0 }],
  history: [{ matchday: 1, eliminated: ['Luis'], resolvedAt: '2026-08-22T00:00:00.000Z' }],
  nextPollInSec: 30,
};

export const myEntry = {
  lives: 2,
  status: 'alive',
  myPick: 'team-1',
  usedTeams: ['team-1'],
};

export const tokens = { accessToken: 'access.token.jwt', refreshToken: 'refresh.token.jwt' };
