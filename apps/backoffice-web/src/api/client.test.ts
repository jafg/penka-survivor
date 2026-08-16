import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { AdminPoolsResponseSchema, CloseMatchdayResponseSchema } from '@penka/contracts';
import {
  ADMIN_KEY_HEADER,
  ADMIN_KEY_STORAGE_KEY,
  ApiError,
  adminKey,
  apiRequest,
  apiUrl,
  onTraffic,
  setAdminKey,
  type TrafficEntry,
} from './client';
import { apiError, server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

describe('adminKey', () => {
  it('falls back to the build-time key when the operator has stored none', () => {
    // MVP: one shared secret per deployment. `.env.development` supplies the
    // local one so a fresh clone can talk to the API without ceremony.
    expect(adminKey()).toBe(import.meta.env.VITE_ADMIN_API_KEY ?? '');
  });

  it('prefers a stored key, so a built bundle can be pointed at another stack', () => {
    setAdminKey('key-from-the-operator');

    expect(adminKey()).toBe('key-from-the-operator');
    expect(localStorage.getItem(ADMIN_KEY_STORAGE_KEY)).toBe('key-from-the-operator');
  });

  it('clears the stored key rather than storing an empty string', () => {
    setAdminKey('key-from-the-operator');
    setAdminKey(null);

    expect(localStorage.getItem(ADMIN_KEY_STORAGE_KEY)).toBeNull();
  });
});

describe('apiRequest', () => {
  it('sends the admin key on every call', async () => {
    setAdminKey('key-from-the-operator');
    const seen: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/penkas'), ({ request }) => {
        seen.push(request.headers.get(ADMIN_KEY_HEADER));
        return HttpResponse.json({ pools: fixtures.pools() });
      }),
    );

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });

    // Every route behind `/admin/v1` is guarded, so there is no "public" call
    // to leave bare — unlike the player app, which has several.
    expect(seen).toEqual(['key-from-the-operator']);
  });

  it('relays the API error envelope field for field', async () => {
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/close'), () =>
        apiError(409, 'already_resolved', 'This matchday was already resolved and cannot be closed again'),
      ),
    );

    const error = await apiRequest(
      `/leagues/${fixtures.LEAGUE_ID}/matchdays/2/close`,
      { method: 'POST', schema: CloseMatchdayResponseSchema },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'already_resolved',
      message: 'This matchday was already resolved and cannot be closed again',
    });
  });

  it('reports a body that is not the error envelope as internal, never as a fragment', async () => {
    server.use(
      http.get(apiUrl('/penkas'), () => new HttpResponse('<html>502</html>', { status: 502 })),
    );

    const error = (await apiRequest('/penkas', { schema: AdminPoolsResponseSchema }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.code).toBe('internal');
    expect(error.status).toBe(502);
  });

  it('refuses a 200 whose body does not match its contract schema', async () => {
    // The alternative is casting, which turns an API change into a crash three
    // components deep instead of one error here.
    server.use(http.get(apiUrl('/penkas'), () => HttpResponse.json({ pools: [{ penka: {} }] })));

    await expect(apiRequest('/penkas', { schema: AdminPoolsResponseSchema })).rejects.toMatchObject({
      code: 'internal',
    });
  });

  it('reports an unreachable API as a connection failure rather than a status', async () => {
    server.use(http.get(apiUrl('/penkas'), () => HttpResponse.error()));

    const error = (await apiRequest('/penkas', { schema: AdminPoolsResponseSchema }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.status).toBe(0);
    expect(error.code).toBe('internal');
    expect(error.message).toBe('No pudimos conectarnos con el servidor');
  });
});

describe('traffic', () => {
  it('announces every request with its method, path, status and latency', async () => {
    const seen: TrafficEntry[] = [];
    onTraffic((entry) => seen.push(entry));

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'GET', path: '/admin/v1/penkas', status: 200 });
    // The console renders this as `· 42ms`, so it has to be a number of them.
    expect(seen[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  it('announces failures too, carrying the API error code the console colours red', async () => {
    const seen: TrafficEntry[] = [];
    onTraffic((entry) => seen.push(entry));
    server.use(
      http.post(apiUrl('/leagues/:leagueId/matchdays/:number/resolve'), () =>
        apiError(409, 'matchday_not_locked', 'Close this matchday before resolving it'),
      ),
    );

    await apiRequest(`/leagues/${fixtures.LEAGUE_ID}/matchdays/2/resolve`, {
      method: 'POST',
      schema: CloseMatchdayResponseSchema,
    }).catch(() => undefined);

    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: `/admin/v1/leagues/${fixtures.LEAGUE_ID}/matchdays/2/resolve`,
      status: 409,
      code: 'matchday_not_locked',
    });
  });

  it('announces a connection failure as status 0, so the console shows the attempt', async () => {
    const seen: TrafficEntry[] = [];
    onTraffic((entry) => seen.push(entry));
    server.use(http.get(apiUrl('/penkas'), () => HttpResponse.error()));

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema }).catch(() => undefined);

    expect(seen[0]).toMatchObject({ status: 0, path: '/admin/v1/penkas' });
  });

  it('stops announcing to a listener that has unsubscribed', async () => {
    const listener = vi.fn();
    const stop = onTraffic(listener);

    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });
    stop();
    await apiRequest('/penkas', { schema: AdminPoolsResponseSchema });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
