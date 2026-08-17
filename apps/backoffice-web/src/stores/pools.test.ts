import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePoolsStore } from './pools';
import { useToastStore } from './toast';
import { apiUrl } from '../api/client';
import { apiError, server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

describe('poolsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('lists the penkas the operator runs', async () => {
    const store = usePoolsStore();

    await store.load();

    expect(store.pools.map((pool) => pool.penka.name)).toEqual([
      'Survivor de la oficina',
      'Los primos',
    ]);
  });

  it('adds up the picks the whole deployment has received', async () => {
    // The status panel's "Picks recibidos" is a deployment-wide number; no
    // single penka carries it.
    const store = usePoolsStore();

    await store.load();

    expect(store.picksReceived).toBe(13);
  });

  it('reports a failed listing with the API’s own message', async () => {
    server.use(http.get(apiUrl('/penkas'), () => apiError(401, 'unauthorized', 'Invalid admin key')));
    const store = usePoolsStore();

    await store.load();

    expect(useToastStore().isError).toBe(true);
    expect(useToastStore().message).toBe('Invalid admin key');
  });

  it('suggests which LEAGUE to open, and leaves the matchday to the calendar', async () => {
    // It used to answer a matchday too, as `resolvedMatchdays + 1`. That is
    // right in the middle of a competition and wrong at the end of one: a league
    // with every matchday resolved has no next number, and asking for it was the
    // `matchday_not_found` an operator could not clear. The number now comes
    // from the league's own calendar (`stores/matchday.ts`).
    const store = usePoolsStore();

    await store.load();

    expect(store.suggestedLeagueId).toBe(fixtures.LEAGUE_ID);
  });

  it('names every league in play, so the console can offer them all', async () => {
    // The reported failure: penkas on a second league were unreachable, because
    // the console only ever looked at the first penka listed.
    server.use(
      http.get(apiUrl('/penkas'), () =>
        HttpResponse.json({
          pools: [
            fixtures.poolSummary(),
            fixtures.poolSummary({ penka: fixtures.penka({ id: 'p2', leagueId: 'copa-america' }) }),
            // A second penka on the first league must not list it twice.
            fixtures.poolSummary({ penka: fixtures.penka({ id: 'p3' }) }),
          ],
        }),
      ),
    );
    const store = usePoolsStore();

    await store.load();

    expect(store.leaguesInPlay).toEqual([fixtures.LEAGUE_ID, 'copa-america']);
  });

  it('suggests nothing at all while no penka exists', async () => {
    server.use(http.get(apiUrl('/penkas'), () => HttpResponse.json({ pools: [] })));
    const store = usePoolsStore();

    await store.load();

    expect(store.suggestedLeagueId).toBeNull();
    expect(store.leaguesInPlay).toEqual([]);
    expect(store.picksReceived).toBe(0);
  });
});
