import { HttpResponse, http } from 'msw';
import { screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MatchdayStatus } from '@penka/contracts';
import { apiUrl } from '../api/client';
import { server } from '../test-support/server';
import { flush, renderApp } from '../test-support/render';
import * as fixtures from '../test-support/fixtures';

/**
 * The control that answers "which competition, which fecha?" — and the reason the
 * console can no longer ask the API for a matchday that was never materialized.
 *
 * Both halves of the reported failure live here: a finished league whose next
 * number does not exist, and a second league that nothing on screen could reach.
 */

/** The URLs the API actually received, in order. */
function recordUrls(): string[] {
  const urls: string[] = [];
  server.events.on('request:start', ({ request }) => urls.push(request.url));
  return urls;
}

/**
 * Serves a whole deployment: one penka per named league, each league's calendar,
 * and a detail route that AGREES with that calendar. The two have to agree the
 * way the real API's do — the store folds every detail read back into the
 * calendar it holds, so handlers that contradicted each other would be testing a
 * state no deployment can produce.
 */
function serveLeagues(leagues: Record<string, MatchdayStatus[]>): void {
  const calendars = new Map(
    Object.entries(leagues).map(([leagueId, statuses]) => [
      leagueId,
      fixtures.calendar(statuses, leagueId),
    ]),
  );

  server.use(
    http.get(apiUrl('/penkas'), () =>
      HttpResponse.json({
        pools: [...calendars.keys()].map((leagueId, index) =>
          fixtures.poolSummary({
            penka: fixtures.penka({ id: `penka-${index}`, leagueId }),
          }),
        ),
      }),
    ),
    http.get(apiUrl('/leagues/:leagueId/matchdays'), ({ params }) =>
      HttpResponse.json({ matchdays: calendars.get(String(params['leagueId'])) ?? [] }),
    ),
    http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), ({ params }) => {
      const entry = calendars
        .get(String(params['leagueId']))
        ?.find((day) => day.number === Number(params['number']));
      return HttpResponse.json(
        fixtures.matchdayDetail(entry === undefined ? {} : { matchday: entry }),
      );
    }),
  );
}

describe('MatchdaySelector · choosing a league', () => {
  it('offers every league with a penka on it', async () => {
    serveLeagues({
      'copa-libertadores': ['resolved', 'open', 'open'],
      'copa-america': ['open', 'open', 'open'],
    });

    await renderApp();

    const leagues = screen.getByLabelText('Liga');
    expect([...leagues.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'copa-libertadores',
      'copa-america',
    ]);
    expect(leagues).toHaveValue('copa-libertadores');
  });

  it('switches league by reading the new calendar BEFORE any matchday', async () => {
    // Half of the reported failure: penkas on a second league were unreachable,
    // because nothing on screen let an operator leave the first one.
    serveLeagues({
      'copa-libertadores': ['resolved', 'open', 'open'],
      'copa-america': ['open', 'open', 'open'],
    });
    const urls = recordUrls();
    await renderApp();

    await userEvent.selectOptions(screen.getByLabelText('Liga'), 'copa-america');
    await flush();

    expect(urls.slice(-2)).toEqual([
      apiUrl('/leagues/copa-america/matchdays'),
      apiUrl('/leagues/copa-america/matchdays/1'),
    ]);
    expect(screen.getByText('copa-america · Fecha 1')).toBeInTheDocument();
  });
});

describe('MatchdaySelector · choosing a matchday', () => {
  it('offers the matchdays the league really has, and marks the one on screen', async () => {
    await renderApp();

    expect(
      screen.getAllByRole('button', { name: /^Fecha \d/ }).map((button) => button.textContent?.trim()),
    ).toEqual(['1', '2', '3']);
    expect(screen.getByRole('button', { name: 'Fecha 2 · Abierta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('moves to another matchday without asking for the calendar again', async () => {
    const urls = recordUrls();
    await renderApp();

    await userEvent.click(screen.getByRole('button', { name: /^Fecha 3/ }));
    await flush();

    expect(urls.filter((url) => url === apiUrl('/leagues/copa-libertadores/matchdays'))).toHaveLength(
      1,
    );
    expect(urls).toContain(apiUrl('/leagues/copa-libertadores/matchdays/3'));
    expect(screen.getByText('copa-libertadores · Fecha 3')).toBeInTheDocument();
  });
});

describe('MatchdaySelector · a league with nothing left to do', () => {
  it('lands on the LAST matchday instead of walking off the end of the calendar', async () => {
    // The reported failure, exactly: the console used to open on "one after the
    // last resolved", which for a finished three-matchday league is number 4 —
    // a matchday that was never materialized, so `matchday_not_found`, with no
    // operator action to blame and no way to navigate out of it.
    serveLeagues({ 'copa-libertadores': ['resolved', 'resolved', 'resolved'] });
    const urls = recordUrls();

    await renderApp();

    expect(urls).not.toContain(apiUrl('/leagues/copa-libertadores/matchdays/4'));
    expect(screen.getByText('copa-libertadores · Fecha 3')).toBeInTheDocument();
    expect(screen.getByText('Competencia finalizada')).toBeInTheDocument();
  });

  it('says a league has no calendar rather than asking for a matchday anyway', async () => {
    serveLeagues({ 'copa-libertadores': [] });
    const urls = recordUrls();

    await renderApp();

    expect(urls).toEqual([
      apiUrl('/penkas'),
      apiUrl('/leagues/copa-libertadores/matchdays'),
    ]);
    expect(screen.getByText('Sin fechas')).toBeInTheDocument();
  });
});
