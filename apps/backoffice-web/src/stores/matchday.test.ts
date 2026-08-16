import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOLVE_POLL_ATTEMPTS, RESOLVE_POLL_MS, useMatchdayStore } from './matchday';
import { useOpsStore } from './ops';
import { useToastStore } from './toast';
import { apiUrl } from '../api/client';
import { apiError, server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

/** The URLs the API actually received, in order. */
function recordUrls(): string[] {
  const urls: string[] = [];
  server.events.on('request:start', ({ request }) => urls.push(request.url));
  return urls;
}

/** A store already pointed at the fixture league's second matchday. */
function selected(): ReturnType<typeof useMatchdayStore> {
  const store = useMatchdayStore();
  store.select(fixtures.LEAGUE_ID, fixtures.MATCHDAY_NUMBER);
  return store;
}

/** Serves the matchday in a given shape for every read in the test. */
function serveMatchday(detail = fixtures.matchdayDetail()): void {
  server.use(
    http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () => HttpResponse.json(detail)),
  );
}

describe('matchdayStore · loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('reads the matchday by league and number and keeps what the API served', async () => {
    const urls = recordUrls();
    const store = selected();

    await store.load();

    expect(urls).toEqual([apiUrl('/leagues/copa-libertadores/matchdays/2')]);
    expect(store.matchday?.id).toBe(fixtures.MATCHDAY_ID);
    expect(store.matches).toHaveLength(4);
    expect(store.isLoaded).toBe(true);
  });

  it('hands the served polling profile to the ops panel', async () => {
    // The cadence the deployment is serving arrives with the matchday; the ops
    // panel must show that, not whatever it last wrote.
    serveMatchday(fixtures.matchdayDetail({ pollingProfile: 'live' }));
    const store = selected();

    await store.load();

    expect(useOpsStore().profile).toBe('live');
  });

  it('reports a failed read with the API’s own message', async () => {
    server.use(
      http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () =>
        apiError(404, 'matchday_not_found', 'Matchday 2 does not exist in this league'),
      ),
    );
    const store = selected();

    await store.load();

    const toast = useToastStore();
    expect(toast.isError).toBe(true);
    expect(toast.message).toBe('Matchday 2 does not exist in this league');
    expect(store.isLoaded).toBe(false);
  });

  it('counts the results that are in and the ones still missing', async () => {
    serveMatchday(fixtures.matchdayDetail({ matches: fixtures.matches(3) }));
    const store = selected();

    await store.load();

    expect(store.resultsLoaded).toBe(3);
    expect(store.pendingMatches).toBe(1);
    expect(store.matchCount).toBe(4);
  });
});

describe('matchdayStore · resolve preconditions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('refuses to resolve an OPEN matchday even with every result loaded', async () => {
    // The prototype enabled the button on results alone. The API answers 409
    // `matchday_not_locked`, so the operator flow is close → results → resolve.
    serveMatchday(
      fixtures.matchdayDetail({ matchday: fixtures.matchday('open'), matches: fixtures.matches(4) }),
    );
    const store = selected();

    await store.load();

    expect(store.resolveRejection).toBe('matchday_not_locked');
    expect(store.canResolve).toBe(false);
  });

  it('refuses to resolve a locked matchday while a match has no result', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(3),
      }),
    );
    const store = selected();

    await store.load();

    expect(store.resolveRejection).toBe('results_missing');
    expect(store.canResolve).toBe(false);
  });

  it('allows resolve only once the matchday is locked AND complete', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(4),
      }),
    );
    const store = selected();

    await store.load();

    expect(store.resolveRejection).toBeNull();
    expect(store.canResolve).toBe(true);
  });

  it('offers no action at all on a resolved matchday', async () => {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('resolved'),
        matches: fixtures.matches(4),
      }),
    );
    const store = selected();

    await store.load();

    expect(store.isResolved).toBe(true);
    expect(store.canResolve).toBe(false);
    expect(store.canClose).toBe(false);
    // The API answers 409 `already_resolved` to a second write, so the selectors
    // go dead rather than inviting one.
    expect(store.canLoadResults).toBe(false);
  });
});

describe('matchdayStore · close', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('closes through the league-scoped route and takes the locked matchday back', async () => {
    const urls = recordUrls();
    const store = selected();
    await store.load();

    await store.close();

    expect(urls).toContain(apiUrl('/leagues/copa-libertadores/matchdays/2/close'));
    expect(store.matchday?.status).toBe('locked');
    expect(useToastStore().message).toBe('Fecha cerrada · no se aceptan más picks');
  });

  it('relays a refusal to close verbatim', async () => {
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/close'), () =>
        apiError(409, 'already_resolved', 'This matchday has already been resolved'),
      ),
    );
    const store = selected();
    await store.load();

    await store.close();

    expect(useToastStore().isError).toBe(true);
    expect(useToastStore().message).toBe('This matchday has already been resolved');
  });
});

describe('matchdayStore · results', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('writes one match and updates only that row from the response', async () => {
    const urls = recordUrls();
    const store = selected();
    await store.load();

    await store.loadResult(fixtures.MATCH_ID, 'away');

    expect(urls).toContain(apiUrl('/matches/copa-libertadores%3Amd2%3ARIV-BOC/result'));
    expect(store.matches.find((match) => match.id === fixtures.MATCH_ID)?.outcome).toBe('away');
    expect(store.matches.filter((match) => match.outcome !== null)).toHaveLength(1);
  });

  it('takes the pending counter from the response, not from its own arithmetic', async () => {
    // The API counts across the whole matchday, including rows this client may
    // not have re-read; its number wins.
    server.use(
      http.post(apiUrl('/matches/:matchId/result'), () =>
        HttpResponse.json({
          match: fixtures.match({ outcome: 'home' }),
          pendingMatches: 2,
          readyToResolve: false,
        }),
      ),
    );
    const store = selected();
    await store.load();

    await store.loadResult(fixtures.MATCH_ID, 'home');

    expect(useToastStore().message).toBe('Resultado cargado · faltan 2');
  });

  it('announces that the matchday is ready once the last result is in', async () => {
    server.use(
      http.post(apiUrl('/matches/:matchId/result'), () =>
        HttpResponse.json({
          match: fixtures.match({ outcome: 'draw' }),
          pendingMatches: 0,
          readyToResolve: true,
        }),
      ),
    );
    const store = selected();
    await store.load();

    await store.loadResult(fixtures.MATCH_ID, 'draw');

    expect(useToastStore().message).toBe('Resultado cargado · la fecha está lista para resolver');
  });

  it('renders the API’s refusal to overwrite a resolved matchday', async () => {
    server.use(
      http.post(apiUrl('/matches/:matchId/result'), () =>
        apiError(409, 'already_resolved', 'This matchday has already been resolved'),
      ),
    );
    const store = selected();
    await store.load();

    await store.loadResult(fixtures.MATCH_ID, 'home');

    expect(useToastStore().isError).toBe(true);
    expect(useToastStore().message).toBe('This matchday has already been resolved');
  });
});

describe('matchdayStore · resolve', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function locked(): Promise<ReturnType<typeof useMatchdayStore>> {
    serveMatchday(
      fixtures.matchdayDetail({
        matchday: fixtures.matchday('locked'),
        matches: fixtures.matches(4),
      }),
    );
    const store = selected();
    await store.load();
    return store;
  }

  it('reports resolution as QUEUED and leaves the status where the API left it', async () => {
    const urls = recordUrls();
    const store = await locked();

    await store.resolve();

    expect(urls).toContain(apiUrl('/leagues/copa-libertadores/matchdays/2/resolve'));
    // The endpoint publishes one message per penka and returns; nothing is
    // resolved yet, so claiming "fecha resuelta" here would be a lie.
    expect(useToastStore().message).toBe(
      'Resolución encolada · un job por Penka; el estado se actualiza al terminar',
    );
    expect(store.matchday?.status).toBe('locked');
    expect(store.isAwaitingResolution).toBe(true);
  });

  it('re-reads the matchday until the workers have finished', async () => {
    const store = await locked();
    let reads = 0;
    server.use(
      http.get(apiUrl('/leagues/:leagueId/matchdays/:number'), () => {
        reads += 1;
        return HttpResponse.json(
          fixtures.matchdayDetail({
            matchday: fixtures.matchday(reads >= 2 ? 'resolved' : 'locked'),
            matches: fixtures.matches(4),
          }),
        );
      }),
    );

    await store.resolve();
    await vi.advanceTimersByTimeAsync(RESOLVE_POLL_MS * RESOLVE_POLL_ATTEMPTS);

    expect(store.matchday?.status).toBe('resolved');
    expect(store.isAwaitingResolution).toBe(false);
    // It stopped as soon as the answer arrived instead of spending the budget.
    expect(reads).toBe(2);
  });

  it('gives up politely when the workers are slower than the poll budget', async () => {
    const store = await locked();

    await store.resolve();
    await vi.advanceTimersByTimeAsync(RESOLVE_POLL_MS * (RESOLVE_POLL_ATTEMPTS + 1));

    expect(store.matchday?.status).toBe('locked');
    expect(store.isAwaitingResolution).toBe(false);
    // A manual refresh is the honest way out; the console never pretends.
    expect(useToastStore().message).toBe('La resolución sigue en curso · actualizá para ver el estado');
  });

  it('renders a 409 matchday_not_locked verbatim', async () => {
    const store = await locked();
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(409, 'matchday_not_locked', 'Close this matchday before resolving it'),
      ),
    );

    await store.resolve();

    expect(useToastStore().isError).toBe(true);
    expect(useToastStore().message).toBe('Close this matchday before resolving it');
    expect(store.isAwaitingResolution).toBe(false);
  });

  it('renders a 409 results_missing verbatim', async () => {
    const store = await locked();
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(409, 'results_missing', 'Some matches still have no result'),
      ),
    );

    await store.resolve();

    expect(useToastStore().message).toBe('Some matches still have no result');
  });

  it('renders a 404 penka_not_found verbatim, the league nobody plays', async () => {
    const store = await locked();
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(404, 'penka_not_found', 'No penka plays this league'),
      ),
    );

    await store.resolve();

    expect(useToastStore().isError).toBe(true);
    expect(useToastStore().message).toBe('No penka plays this league');
  });
});
