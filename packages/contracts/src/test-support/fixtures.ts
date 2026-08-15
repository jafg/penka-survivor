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
 * A catalog team code. Teams are identified by their stable, league-scoped
 * `code` everywhere — matches, picks and used-team lists all carry codes, never
 * a generated id.
 */
export const teamCode = 'RIV';

export const match = {
  id: 'match-1',
  matchdayId: 'matchday-1',
  homeTeamCode: 'RIV',
  awayTeamCode: 'BOC',
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
  usedTeams: ['RIV'],
  points: 3,
};

export const pick = {
  id: 'pick-1',
  entryId: 'entry-1',
  matchdayId: 'matchday-1',
  teamCode: 'RIV',
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

/**
 * A board player while the matchday is still open: `pick` is null because picks
 * only become public at lock (see BoardPlayerSchema).
 */
export const boardPlayer = { displayName: 'Ana', lives: 2, points: 3, pick: null };

export const board = {
  matchday: 2,
  lockAt: '2026-08-28T18:45:00.000Z',
  isLocked: false,
  isResolved: false,
  alive: [boardPlayer],
  island: [{ displayName: 'Luis', lives: 0, points: 1, pick: null }],
  history: [{ matchday: 1, eliminated: ['Luis'], resolvedAt: '2026-08-22T00:00:00.000Z' }],
  nextPollInSec: 30,
};

/**
 * The same board after the matchday locked: picks are revealed, and a null now
 * means the player never picked rather than "hidden". Clients tell the two
 * apart by reading `isLocked` — there is no flag on the player.
 */
export const lockedBoard = {
  ...board,
  isLocked: true,
  alive: [{ displayName: 'Ana', lives: 2, points: 3, pick: 'RIV' }],
  island: [{ displayName: 'Luis', lives: 0, points: 1, pick: null }],
  nextPollInSec: 15,
};

export const myEntry = {
  lives: 2,
  status: 'alive',
  myPick: 'RIV',
  usedTeams: ['RIV'],
};

export const tokens = { accessToken: 'access.token.jwt', refreshToken: 'refresh.token.jwt' };
