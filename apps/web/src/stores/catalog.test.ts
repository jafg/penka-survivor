import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { apiError, server } from '../test-support/server';
import { useCatalogStore } from './catalog';

const { LEAGUE_ID } = fixtures;

describe('catalogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('turns a team code into the name a player recognises', async () => {
    // The game API speaks codes and only codes. "RIV" on a card is the catalog
    // leaking onto the screen.
    const catalog = useCatalogStore();

    await catalog.loadLeague(LEAGUE_ID);

    expect(catalog.teamName('RIV')).toBe('River Plate');
  });

  it('falls back to the code rather than rendering nothing', async () => {
    // A team the catalog has not loaded yet still has to be legible. An empty
    // card is worse than a code.
    const catalog = useCatalogStore();

    expect(catalog.teamName('RIV')).toBe('RIV');

    await catalog.loadLeague(LEAGUE_ID);
    expect(catalog.teamName('XXX')).toBe('XXX');
  });

  it('fetches a league once, however many screens ask for it', async () => {
    // The catalog is static for a season; the pick screen and the standings
    // screen both need it.
    let calls = 0;
    server.use(
      http.get(apiUrl('/catalog/leagues/:leagueId'), () => {
        calls += 1;
        return HttpResponse.json(fixtures.leagueDetail());
      }),
    );
    const catalog = useCatalogStore();

    await catalog.loadLeague(LEAGUE_ID);
    await catalog.loadLeague(LEAGUE_ID);

    expect(calls).toBe(1);
  });

  it('does not fire two requests for the same league at once', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/catalog/leagues/:leagueId'), () => {
        calls += 1;
        return HttpResponse.json(fixtures.leagueDetail());
      }),
    );
    const catalog = useCatalogStore();

    await Promise.all([catalog.loadLeague(LEAGUE_ID), catalog.loadLeague(LEAGUE_ID)]);

    expect(calls).toBe(1);
  });

  it('keeps the teams of each league apart', async () => {
    server.use(
      http.get(apiUrl('/catalog/leagues/:leagueId'), ({ params }) =>
        params['leagueId'] === LEAGUE_ID
          ? HttpResponse.json(fixtures.leagueDetail())
          : HttpResponse.json(
              fixtures.leagueDetail({
                league: { ...fixtures.LEAGUE, id: 'premier-league', name: 'Premier League' },
                teams: [{ code: 'ARS', name: 'Arsenal', country: 'Inglaterra' }],
              }),
            ),
      ),
    );
    const catalog = useCatalogStore();

    await catalog.loadLeague(LEAGUE_ID);
    await catalog.loadLeague('premier-league');

    expect(catalog.teamsOf(LEAGUE_ID).map((team) => team.code)).toEqual(
      fixtures.TEAMS.map((team) => team.code),
    );
    expect(catalog.teamsOf('premier-league').map((team) => team.code)).toEqual(['ARS']);
  });

  it('retries after a failure instead of caching the hole', async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl('/catalog/leagues/:leagueId'), () => {
        calls += 1;
        return calls === 1
          ? apiError(503, 'internal', 'El servicio no está disponible')
          : HttpResponse.json(fixtures.leagueDetail());
      }),
    );
    const catalog = useCatalogStore();

    await catalog.loadLeague(LEAGUE_ID);
    expect(catalog.teamName('RIV')).toBe('RIV');

    await catalog.loadLeague(LEAGUE_ID);
    expect(catalog.teamName('RIV')).toBe('River Plate');
  });

  it('lists the leagues a penka can be created for', async () => {
    const catalog = useCatalogStore();

    await catalog.loadLeagues();

    expect(catalog.leagues.map((league) => league.id)).toEqual([LEAGUE_ID]);
  });

  it('names a league from the listing, so a penka card need not load its teams', async () => {
    const catalog = useCatalogStore();

    await catalog.loadLeagues();

    expect(catalog.leagueName(LEAGUE_ID)).toBe('Copa Libertadores');
  });

  it('names a league from its detail too', async () => {
    const catalog = useCatalogStore();

    await catalog.loadLeague(LEAGUE_ID);

    expect(catalog.leagueName(LEAGUE_ID)).toBe('Copa Libertadores');
  });

  it('falls back to the league id when the catalog has not answered', () => {
    expect(useCatalogStore().leagueName(LEAGUE_ID)).toBe(LEAGUE_ID);
  });
});
