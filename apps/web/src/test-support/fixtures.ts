import type {
  Board,
  BoardPlayer,
  CurrentMatchdayResponse,
  Entry,
  League,
  LeagueDetailResponse,
  Match,
  Matchday,
  MyEntry,
  MyPenkaItem,
  Penka,
  Team,
  User,
} from '@penka/contracts';

/**
 * Contract-shaped fixtures. Everything here is a `@penka/contracts` type on
 * purpose: a fixture that drifts from the schema is a test that passes against
 * an API that does not exist.
 *
 * The values mirror the real catalog's `copa-libertadores` league so codes,
 * names and ids look like production data rather than `foo`/`bar`.
 */

export const LEAGUE_ID = 'copa-libertadores';
export const PENKA_ID = '6a80b60ffda322125df55e5f';
export const OTHER_PENKA_ID = '6a80b60ffda322125df55e70';

/** Far enough out that a countdown renders, close enough to reach with fake timers. */
export const LOCK_AT = '2026-08-21T21:00:00.000Z';
export const BEFORE_LOCK = '2026-08-21T19:00:00.000Z';

export const TEAMS: Team[] = [
  { code: 'RIV', name: 'River Plate', country: 'Argentina' },
  { code: 'BOC', name: 'Boca Juniors', country: 'Argentina' },
  { code: 'FLA', name: 'Flamengo', country: 'Brasil' },
  { code: 'PAL', name: 'Palmeiras', country: 'Brasil' },
  { code: 'PEN', name: 'Peñarol', country: 'Uruguay' },
  { code: 'NAC', name: 'Nacional', country: 'Uruguay' },
  { code: 'CCO', name: 'Colo-Colo', country: 'Chile' },
  { code: 'ATN', name: 'Atlético Nacional', country: 'Colombia' },
];

export const LEAGUE: League = {
  id: LEAGUE_ID,
  name: 'Copa Libertadores',
  region: 'america',
  season: '2026',
};

export function leagueDetail(overrides: Partial<LeagueDetailResponse> = {}): LeagueDetailResponse {
  return {
    league: LEAGUE,
    teams: TEAMS,
    fixtureTemplate: {
      leagueId: LEAGUE_ID,
      matchdays: [
        {
          number: 1,
          lockAtOffsetMinutes: 120,
          matchups: [
            { homeTeamCode: 'RIV', awayTeamCode: 'BOC' },
            { homeTeamCode: 'FLA', awayTeamCode: 'PAL' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

export function user(overrides: Partial<User> = {}): User {
  return {
    id: '6a80b60ffda322125df55e01',
    email: 'ana@example.com',
    displayName: 'Ana Suárez',
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

export function penka(overrides: Partial<Penka> = {}): Penka {
  return {
    id: PENKA_ID,
    leagueId: LEAGUE_ID,
    name: 'Survivor de la oficina',
    joinCode: '4821',
    settings: { lives: 2, islandEnabled: true },
    createdAt: '2026-08-10T12:00:00.000Z',
    ...overrides,
  };
}

export function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '6a80b60ffda322125df55e60',
    penkaId: PENKA_ID,
    userId: '6a80b60ffda322125df55e01',
    lives: 2,
    status: 'alive',
    usedTeams: [],
    points: 0,
    ...overrides,
  };
}

export function myPenkaItem(overrides: Partial<MyPenkaItem> = {}): MyPenkaItem {
  return { penka: penka(), entry: entry(), ...overrides };
}

export function myEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return { lives: 2, status: 'alive', myPick: null, usedTeams: [], ...overrides };
}

export function matchday(overrides: Partial<Matchday> = {}): Matchday {
  return {
    id: `${LEAGUE_ID}:md1`,
    leagueId: LEAGUE_ID,
    number: 1,
    status: 'open',
    lockAt: LOCK_AT,
    ...overrides,
  };
}

export function matches(overrides: Partial<Match>[] = []): Match[] {
  const base: Match[] = [
    {
      id: `${LEAGUE_ID}:md1:RIV-BOC`,
      matchdayId: `${LEAGUE_ID}:md1`,
      homeTeamCode: 'RIV',
      awayTeamCode: 'BOC',
      kickoffAt: LOCK_AT,
      outcome: null,
    },
    {
      id: `${LEAGUE_ID}:md1:FLA-PAL`,
      matchdayId: `${LEAGUE_ID}:md1`,
      homeTeamCode: 'FLA',
      awayTeamCode: 'PAL',
      kickoffAt: LOCK_AT,
      outcome: null,
    },
  ];
  return base.map((match, index) => ({ ...match, ...(overrides[index] ?? {}) }));
}

export function currentMatchday(
  overrides: Partial<CurrentMatchdayResponse> = {},
): CurrentMatchdayResponse {
  return { matchday: matchday(), matches: matches(), ...overrides };
}

export function boardPlayer(overrides: Partial<BoardPlayer> = {}): BoardPlayer {
  return { displayName: 'Ana Suárez', lives: 2, points: 0, pick: null, ...overrides };
}

export function board(overrides: Partial<Board> = {}): Board {
  return {
    matchday: 1,
    lockAt: LOCK_AT,
    isLocked: false,
    isResolved: false,
    alive: [boardPlayer(), boardPlayer({ displayName: 'Bruno Ferreira', lives: 1 })],
    island: [],
    history: [],
    nextPollInSec: 10,
    ...overrides,
  };
}
