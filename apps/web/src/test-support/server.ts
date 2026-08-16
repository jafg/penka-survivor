import { setupServer } from 'msw/node';
import { HttpResponse, http, type HttpHandler } from 'msw';
import type { ErrorCode } from '@penka/contracts';
import { apiUrl } from '../api/client';
import * as fixtures from './fixtures';

/**
 * The test double for `@penka/api`.
 *
 * These handlers mirror the REAL contract, not the prototype's mock: picks are
 * POSTed by team CODE and answer with the updated `myEntry`, the penka listing
 * is `{ penkas: [{ penka, entry }] }`, joining is idempotent, and a board player
 * carries `points` and a nullable `pick`. A handler that agrees with the
 * prototype instead would let the app ship against an API nobody runs.
 */

export const server = setupServer(...defaultHandlers());

/** The canonical error envelope, so tests exercise the client's real parsing. */
export function apiError(status: number, code: ErrorCode, message: string): HttpResponse {
  return HttpResponse.json({ status, code, message }, { status });
}

export function defaultHandlers(): HttpHandler[] {
  return [
    http.post(apiUrl('/auth/register'), () =>
      HttpResponse.json({
        user: fixtures.user(),
        tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      }),
    ),
    http.post(apiUrl('/auth/login'), () =>
      HttpResponse.json({
        user: fixtures.user(),
        tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      }),
    ),
    http.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ tokens: { accessToken: 'access-2', refreshToken: 'refresh-2' } }),
    ),
    http.get(apiUrl('/me'), () => HttpResponse.json({ user: fixtures.user() })),

    http.get(apiUrl('/catalog/leagues'), () =>
      HttpResponse.json({
        leagues: [
          {
            id: fixtures.LEAGUE_ID,
            name: fixtures.LEAGUE.name,
            region: fixtures.LEAGUE.region,
            teamCount: fixtures.TEAMS.length,
          },
        ],
      }),
    ),
    http.get(apiUrl('/catalog/leagues/:leagueId'), () =>
      HttpResponse.json(fixtures.leagueDetail()),
    ),

    http.get(apiUrl('/me/penkas'), () =>
      HttpResponse.json({ penkas: [fixtures.myPenkaItem()] }),
    ),
    http.post(apiUrl('/penkas'), () => HttpResponse.json({ penka: fixtures.penka() })),
    http.post(apiUrl('/penkas/join'), () =>
      HttpResponse.json({ penka: fixtures.penka(), entry: fixtures.entry() }),
    ),

    http.get(apiUrl('/penkas/:penkaId/board'), () =>
      HttpResponse.json({ board: fixtures.board() }),
    ),
    http.get(apiUrl('/penkas/:penkaId/matchday/current'), () =>
      HttpResponse.json(fixtures.currentMatchday()),
    ),
    http.get(apiUrl('/penkas/:penkaId/me'), () =>
      HttpResponse.json({ myEntry: fixtures.myEntry() }),
    ),
    http.post(apiUrl('/penkas/:penkaId/picks'), async ({ request }) => {
      const body = (await request.json()) as { teamCode: string };
      return HttpResponse.json({ myEntry: fixtures.myEntry({ myPick: body.teamCode }) });
    }),
  ];
}
