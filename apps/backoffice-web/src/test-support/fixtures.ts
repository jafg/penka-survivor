import {
  matchId,
  matchdayId,
  type AdminMatchdayDetailResponse,
  type AdminPoolSummary,
  type Match,
  type MatchOutcome,
  type Matchday,
  type MatchdayStatus,
  type Penka,
} from '@penka/contracts';

/**
 * The world the tests run in, built from `@penka/contracts` types so a contract
 * change breaks the fixtures before it breaks a component.
 *
 * Ids are DERIVED with the contract's own helpers rather than spelled out: they
 * carry colons, and a hand-written id that happened to omit one would quietly
 * excuse the client from the encoding the API demands.
 */

export const LEAGUE_ID = 'copa-libertadores';
export const MATCHDAY_NUMBER = 2;
export const MATCHDAY_ID = matchdayId(LEAGUE_ID, MATCHDAY_NUMBER);

/** The same eight teams the league's fixture template uses. */
export const MATCHUPS: readonly [string, string][] = [
  ['RIV', 'BOC'],
  ['FLA', 'PAL'],
  ['PEN', 'NAC'],
  ['CCO', 'ATN'],
];

/** Colon-bearing on purpose — this is the id the result route has to encode. */
export const MATCH_ID = matchId(MATCHDAY_ID, 'RIV', 'BOC');

const LOCK_AT = '2026-08-16T21:00:00.000Z';

export function match(overrides: Partial<Match> = {}): Match {
  return {
    id: MATCH_ID,
    matchdayId: MATCHDAY_ID,
    homeTeamCode: 'RIV',
    awayTeamCode: 'BOC',
    kickoffAt: '2026-08-16T21:30:00.000Z',
    outcome: null,
    ...overrides,
  };
}

/**
 * The matchday's four fixtures. `loadedResults` says how many of them already
 * have an outcome, counting from the top, so a test can ask for "two loaded,
 * two pending" without spelling out the array.
 */
export function matches(loadedResults = 0): Match[] {
  return MATCHUPS.map(([home, away], index) =>
    match({
      id: matchId(MATCHDAY_ID, home, away),
      homeTeamCode: home,
      awayTeamCode: away,
      kickoffAt: index < 2 ? '2026-08-16T21:30:00.000Z' : '2026-08-16T23:00:00.000Z',
      outcome: index < loadedResults ? outcomeFor(index) : null,
    }),
  );
}

function outcomeFor(index: number): MatchOutcome {
  const wheel: MatchOutcome[] = ['home', 'draw', 'away'];
  return wheel[index % wheel.length] as MatchOutcome;
}

export function matchday(status: MatchdayStatus = 'open'): Matchday {
  return {
    id: MATCHDAY_ID,
    leagueId: LEAGUE_ID,
    number: MATCHDAY_NUMBER,
    status,
    lockAt: LOCK_AT,
  };
}

/**
 * The league's whole calendar, the shape `GET /leagues/:leagueId/matchdays`
 * answers. Three matchdays, because that is what the catalog materializes
 * (`LOCK_OFFSET_MINUTES` has three entries) — and the count matters here: the
 * console derives "which matchday am I on?" from this list, and the bug it
 * exists to fix was walking one past the end.
 *
 * The default has matchday 1 resolved and the rest open, so the live matchday is
 * number 2 — `MATCHDAY_NUMBER`, which the detail fixtures agree with.
 *
 * `leagueId` is a parameter because a second league is the other half of the
 * reported bug, and a calendar carrying another league's derived ids would let a
 * test pass while the store's id-keyed bookkeeping quietly missed.
 */
export function calendar(
  statuses: MatchdayStatus[] = ['resolved', 'open', 'open'],
  leagueId: string = LEAGUE_ID,
): Matchday[] {
  return statuses.map((status, index) => ({
    id: matchdayId(leagueId, index + 1),
    leagueId,
    number: index + 1,
    status,
    lockAt: LOCK_AT,
  }));
}

export function matchdayDetail(
  overrides: Partial<AdminMatchdayDetailResponse> = {},
): AdminMatchdayDetailResponse {
  return {
    matchday: matchday(),
    matches: matches(),
    pollingProfile: 'normal',
    ...overrides,
  };
}

export function penka(overrides: Partial<Penka> = {}): Penka {
  return {
    id: 'penka-oficina',
    leagueId: LEAGUE_ID,
    name: 'Survivor de la oficina',
    joinCode: 'OFI123',
    settings: { lives: 2, islandEnabled: true },
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

export function poolSummary(overrides: Partial<AdminPoolSummary> = {}): AdminPoolSummary {
  return {
    penka: penka(),
    entryCount: 9,
    aliveCount: 6,
    islandCount: 3,
    picksReceived: 8,
    resolvedMatchdays: 1,
    ...overrides,
  };
}

/** Two penkas on the same league, the way the operator console meets them. */
export function pools(): AdminPoolSummary[] {
  return [
    poolSummary(),
    poolSummary({
      penka: penka({ id: 'penka-primos', name: 'Los primos', joinCode: 'PRI456' }),
      entryCount: 6,
      aliveCount: 2,
      islandCount: 4,
      picksReceived: 5,
    }),
  ];
}
