import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  closeMatchday,
  getMatchday,
  listPools,
  resolveMatchday,
  setPollingProfile,
  setResult,
} from './endpoints';
import { apiUrl } from './client';
import { server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

/** The URLs the API actually received, in order. */
function recordUrls(): string[] {
  const urls: string[] = [];
  server.events.on('request:start', ({ request }) => urls.push(request.url));
  return urls;
}

describe('setResult', () => {
  it('percent-encodes the colon-bearing match id into the path', async () => {
    // Derived ids look like `copa-libertadores:md2:RIV-BOC`. A raw colon in a
    // path segment is legal for a URL but not for the route the API registered,
    // and the handler deliberately does not decode a second time — so the
    // encoding has to happen exactly once, here.
    const urls = recordUrls();

    await setResult(fixtures.MATCH_ID, { outcome: 'home' });

    expect(urls).toEqual([
      apiUrl('/matches/copa-libertadores%3Amd2%3ARIV-BOC/result'),
    ]);
  });

  it('POSTs the outcome and answers with the match plus the resolve preconditions', async () => {
    let sent: unknown = null;
    server.use(
      http.post(apiUrl('/matches/:matchId/result'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          match: fixtures.match({ outcome: 'away' }),
          pendingMatches: 2,
          readyToResolve: false,
        });
      }),
    );

    const response = await setResult(fixtures.MATCH_ID, { outcome: 'away' });

    expect(sent).toEqual({ outcome: 'away' });
    expect(response).toMatchObject({ pendingMatches: 2, readyToResolve: false });
    expect(response.match.outcome).toBe('away');
  });
});

describe('matchday routes', () => {
  it('addresses a matchday by its league and number, never by its id', async () => {
    // A matchday id is derivable from exactly these two values, so accepting an
    // id from the caller would let an operator address another league's matchday.
    const urls = recordUrls();

    await getMatchday(fixtures.LEAGUE_ID, fixtures.MATCHDAY_NUMBER);
    await closeMatchday(fixtures.LEAGUE_ID, fixtures.MATCHDAY_NUMBER);
    await resolveMatchday(fixtures.LEAGUE_ID, fixtures.MATCHDAY_NUMBER);

    expect(urls).toEqual([
      apiUrl('/leagues/copa-libertadores/matchdays/2'),
      apiUrl('/leagues/copa-libertadores/matchdays/2/close'),
      apiUrl('/leagues/copa-libertadores/matchdays/2/resolve'),
    ]);
  });

  it('encodes a league id too, since nothing promises it is URL-safe', async () => {
    const urls = recordUrls();
    server.use(
      http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () =>
        HttpResponse.json(fixtures.matchdayDetail()),
      ),
    );

    await getMatchday('copa/libertadores', 2);

    expect(urls).toEqual([apiUrl('/leagues/copa%2Flibertadores/matchdays/2')]);
  });

  it('reports resolve as queued, because the workers do the resolving', async () => {
    const response = await resolveMatchday(fixtures.LEAGUE_ID, fixtures.MATCHDAY_NUMBER);

    expect(response).toEqual({ queued: true, matchdayId: fixtures.MATCHDAY_ID });
  });
});

describe('setPollingProfile', () => {
  it('PUTs the contract profile to the deployment-wide route', async () => {
    const urls = recordUrls();
    let sent: unknown = null;
    server.use(
      http.put(apiUrl('/polling-profile'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ profile: 'slow' });
      }),
    );

    const response = await setPollingProfile('slow');

    expect(urls).toEqual([apiUrl('/polling-profile')]);
    expect(sent).toEqual({ profile: 'slow' });
    expect(response.profile).toBe('slow');
  });
});

describe('listPools', () => {
  it('reads the operator listing from GET /admin/v1/penkas', async () => {
    const urls = recordUrls();

    const response = await listPools();

    expect(urls).toEqual([apiUrl('/penkas')]);
    // `resolvedMatchdays` is a COUNT, not a list of numbers — the prototype's
    // mock has it the other way round.
    expect(response.pools[0]?.resolvedMatchdays).toBe(1);
  });
});
