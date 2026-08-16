import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdminPoolsResponseSchema } from '@penka/contracts';
import { MAX_ENTRIES, useConsoleStore } from './console';
import { apiRequest, apiUrl } from '../api/client';
import { apiError, server } from '../test-support/server';
import { http } from 'msw';

describe('consoleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('records the client’s traffic newest first', async () => {
    const store = useConsoleStore();
    store.listen();

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });
    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });
    await apiRequest('/leagues/copa-libertadores/matchdays/2', {
      schema: AdminPoolsResponseSchema,
    }).catch(() => undefined);

    // Newest first: an operator watching a flow reads the top of the panel, not
    // the bottom of a list that grows past the fold.
    expect(store.entries.map((entry) => entry.path)).toEqual([
      '/admin/v1/leagues/copa-libertadores/matchdays/2',
      '/admin/v1/penkas',
      '/admin/v1/penkas',
    ]);
  });

  it('marks a non-2xx entry as failed and keeps the API’s error code', async () => {
    const store = useConsoleStore();
    store.listen();
    server.use(
      http.get(apiUrl('/penkas'), () => apiError(401, 'unauthorized', 'Invalid admin key')),
    );

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema }).catch(() => undefined);

    expect(store.entries[0]).toMatchObject({ status: 401, code: 'unauthorized' });
    expect(store.isFailure(store.entries[0]!)).toBe(true);
  });

  it('treats a connection failure as a failed entry, not a quiet 0', () => {
    const store = useConsoleStore();

    expect(store.isFailure({ method: 'GET', path: '/admin/v1/penkas', status: 0, ms: 4 })).toBe(
      true,
    );
    expect(store.isFailure({ method: 'GET', path: '/admin/v1/penkas', status: 204, ms: 4 })).toBe(
      false,
    );
  });

  it('caps the log so a long session cannot grow without bound', () => {
    const store = useConsoleStore();

    for (let index = 0; index < MAX_ENTRIES + 10; index += 1) {
      store.record({ method: 'GET', path: `/admin/v1/penkas?${index}`, status: 200, ms: 5 });
    }

    expect(store.entries).toHaveLength(MAX_ENTRIES);
    // The oldest ten fell off the end, not the newest.
    expect(store.entries[0]?.path).toBe(`/admin/v1/penkas?${MAX_ENTRIES + 9}`);
  });

  it('stops recording once it has stopped listening', async () => {
    const store = useConsoleStore();
    store.listen();
    store.stopListening();

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });

    expect(store.entries).toHaveLength(0);
  });

  it('clears on request, the way the panel’s Limpiar button does', () => {
    const store = useConsoleStore();
    store.record({ method: 'GET', path: '/admin/v1/penkas', status: 200, ms: 5 });

    store.clear();

    expect(store.entries).toHaveLength(0);
  });
});
