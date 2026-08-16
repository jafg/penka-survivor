import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BoardResponseSchema, MeResponseSchema, MyPenkasResponseSchema } from '@penka/contracts';
import { ApiError, apiRequest, apiUrl, installSession, type Session } from './client';
import { apiError, server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

function session(overrides: Partial<Session> = {}) {
  const refresh = vi.fn(overrides.refresh ?? (async () => true));
  const expire = vi.fn(overrides.expire ?? (() => undefined));
  const built: Session = {
    accessToken: overrides.accessToken ?? (() => 'access-1'),
    refresh,
    expire,
  };
  installSession(built);
  return { session: built, refresh, expire };
}

describe('apiRequest', () => {
  it('sends the bearer token on authenticated calls and leaves public ones bare', async () => {
    session();
    const seen: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/me'), ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ user: fixtures.user() });
      }),
      http.get(apiUrl('/penkas/:penkaId/board'), ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ board: fixtures.board() });
      }),
    );

    await apiRequest('/me', { auth: true, schema: MeResponseSchema });
    await apiRequest(`/penkas/${fixtures.PENKA_ID}/board`, { schema: BoardResponseSchema });

    expect(seen).toEqual(['Bearer access-1', null]);
  });

  it('relays the API error envelope field for field', async () => {
    server.use(
      http.get(apiUrl('/me'), () => apiError(429, 'rate_limited', 'Rate limit exceeded, retry in 42')),
    );

    const error = await apiRequest('/me', { auth: true, schema: MeResponseSchema }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'Rate limit exceeded, retry in 42',
    });
  });

  it('reports a body that is not the error envelope as internal, never as a fragment', async () => {
    // A proxy's HTML error page, say: readable as text, meaningless as an error.
    server.use(http.get(apiUrl('/me'), () => new HttpResponse('<html>502</html>', { status: 502 })));

    const error = (await apiRequest('/me', { auth: true, schema: MeResponseSchema }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.code).toBe('internal');
    expect(error.status).toBe(502);
  });

  it('refuses a 200 whose body does not match its contract schema', async () => {
    // The alternative is casting, which turns an API change into a crash three
    // components deep instead of one error here.
    server.use(http.get(apiUrl('/me'), () => HttpResponse.json({ user: { id: 'x' } })));

    await expect(apiRequest('/me', { auth: true, schema: MeResponseSchema })).rejects.toMatchObject({
      code: 'internal',
    });
  });

  it('refreshes once on a 401 and replays the request with the new token', async () => {
    const tokens = ['access-1', 'access-2'];
    let index = 0;
    const { refresh, expire } = session({
      accessToken: () => tokens[index] ?? null,
      refresh: vi.fn(async () => {
        index = 1;
        return true;
      }),
    });
    const seen: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/me/penkas'), ({ request }) => {
        const authorization = request.headers.get('authorization');
        seen.push(authorization);
        return authorization === 'Bearer access-2'
          ? HttpResponse.json({ penkas: [fixtures.myPenkaItem()] })
          : apiError(401, 'unauthorized', 'Invalid access token');
      }),
    );

    const response = await apiRequest('/me/penkas', {
      auth: true,
      schema: MyPenkasResponseSchema,
    });

    expect(response.penkas).toHaveLength(1);
    expect(seen).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expire).not.toHaveBeenCalled();
  });

  it('expires the session and gives up when the refresh itself fails', async () => {
    const { refresh, expire } = session({ refresh: vi.fn(async () => false) });
    let calls = 0;
    server.use(
      http.get(apiUrl('/me'), () => {
        calls += 1;
        return apiError(401, 'unauthorized', 'Invalid access token');
      }),
    );

    await expect(apiRequest('/me', { auth: true, schema: MeResponseSchema })).rejects.toMatchObject({
      status: 401,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledTimes(1);
    // One attempt, not two: the API already said no and the refresh could not change that.
    expect(calls).toBe(1);
  });

  it('retries a 401 exactly once, then expires instead of looping', async () => {
    const { refresh, expire } = session({ refresh: vi.fn(async () => true) });
    let calls = 0;
    server.use(
      http.get(apiUrl('/me'), () => {
        calls += 1;
        return apiError(401, 'unauthorized', 'Invalid access token');
      }),
    );

    await expect(apiRequest('/me', { auth: true, schema: MeResponseSchema })).rejects.toMatchObject({
      status: 401,
    });

    expect(calls).toBe(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('never refreshes a call that did not send a token', async () => {
    const { refresh } = session();
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), () =>
        apiError(401, 'unauthorized', 'Invalid access token'),
      ),
    );

    await expect(
      apiRequest(`/penkas/${fixtures.PENKA_ID}/board`, { schema: BoardResponseSchema }),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
  });
});
