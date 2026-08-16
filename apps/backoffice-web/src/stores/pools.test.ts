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

  it('suggests the matchday to open on: the one after the last resolved', async () => {
    // The admin API exposes no "current matchday" route, and `resolvedMatchdays`
    // is a count — so one resolved matchday means number 2 is the live one.
    const store = usePoolsStore();

    await store.load();

    expect(store.suggestedSelection).toEqual({ leagueId: fixtures.LEAGUE_ID, number: 2 });
  });

  it('suggests the first matchday when nothing has been resolved yet', async () => {
    server.use(
      http.get(apiUrl('/penkas'), () =>
        HttpResponse.json({ pools: [fixtures.poolSummary({ resolvedMatchdays: 0 })] }),
      ),
    );
    const store = usePoolsStore();

    await store.load();

    expect(store.suggestedSelection).toEqual({ leagueId: fixtures.LEAGUE_ID, number: 1 });
  });

  it('suggests nothing at all while no penka exists', async () => {
    server.use(http.get(apiUrl('/penkas'), () => HttpResponse.json({ pools: [] })));
    const store = usePoolsStore();

    await store.load();

    expect(store.suggestedSelection).toBeNull();
    expect(store.picksReceived).toBe(0);
  });
});
