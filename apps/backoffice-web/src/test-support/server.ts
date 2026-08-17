import { setupServer } from 'msw/node';
import { HttpResponse, http, type HttpHandler } from 'msw';
import type { ErrorCode } from '@penka/contracts';
import { apiUrl } from '../api/client';
import * as fixtures from './fixtures';

/**
 * The test double for `@penka/backoffice-api`.
 *
 * These handlers mirror the REAL admin routes, not the prototype's mock, which
 * disagrees with them on nearly every point that matters: results, close and
 * resolve are LEAGUE-scoped here, match ids carry colons, resolve answers
 * `{ queued: true }` and does no resolving itself, `resolvedMatchdays` is a
 * count, and the polling response carries only the profile. A handler that
 * agreed with the prototype would let the console ship against an API nobody
 * runs.
 */

export const server = setupServer(...defaultHandlers());

/** The canonical error envelope, so tests exercise the client's real parsing. */
export function apiError(status: number, code: ErrorCode, message: string): HttpResponse {
  return HttpResponse.json({ status, code, message }, { status });
}

export function defaultHandlers(): HttpHandler[] {
  return [
    http.get(apiUrl('/penkas'), () => HttpResponse.json({ pools: fixtures.pools() })),

    // The calendar, and the reason the console never asks for a matchday number
    // that was never materialized.
    http.get(apiUrl('/leagues/:leagueId/matchdays'), ({ params }) =>
      HttpResponse.json({ matchdays: fixtures.calendar(undefined, String(params['leagueId'])) }),
    ),

    // Answered out of the SAME calendar the route above serves. The console folds
    // every detail read back into the calendar it holds, so two handlers telling
    // different stories about one matchday would test a state no deployment can
    // reach.
    http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), ({ params }) => {
      const entry = fixtures
        .calendar(undefined, String(params['leagueId']))
        .find((day) => day.number === Number(params['number']));
      return HttpResponse.json(
        fixtures.matchdayDetail(entry === undefined ? {} : { matchday: entry }),
      );
    }),

    http.post(apiUrl('/matches/:matchId/result'), async ({ params, request }) => {
      const body = (await request.json()) as { outcome: 'home' | 'draw' | 'away' };
      const written = fixtures
        .matches()
        .find((candidate) => candidate.id === params['matchId']);
      return HttpResponse.json({
        match: { ...(written ?? fixtures.match()), outcome: body.outcome },
        pendingMatches: fixtures.MATCHUPS.length - 1,
        readyToResolve: false,
      });
    }),

    http.post(apiUrl('/leagues/:leagueId/matchdays/:number/close'), () =>
      HttpResponse.json({ matchday: fixtures.matchday('locked') }),
    ),

    // `queued`, never `resolved`: the workers do the resolving.
    http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
      HttpResponse.json({ queued: true, matchdayId: fixtures.MATCHDAY_ID }),
    ),

    http.put(apiUrl('/polling-profile'), async ({ request }) => {
      const body = (await request.json()) as { profile: string };
      return HttpResponse.json({ profile: body.profile });
    }),
  ];
}
