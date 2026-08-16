import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import { getMe } from '../api/endpoints';
import { apiError, server } from '../test-support/server';
import { useAuthStore } from './auth';

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the tokens and the user the API answered with', async () => {
    const auth = useAuthStore();

    await auth.login('ana@example.com', 'correct horse');

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.accessToken).toBe('access-1');
    expect(auth.refreshToken).toBe('refresh-1');
    expect(auth.user?.displayName).toBe('Ana Suárez');
  });

  it('survives a reload', async () => {
    // Refresh tokens live seven days. A player who closes the tab at half time
    // should come back to the same session, not to the login screen.
    await useAuthStore().login('ana@example.com', 'correct horse');

    setActivePinia(createPinia());
    const restored = useAuthStore();

    expect(restored.isAuthenticated).toBe(true);
    expect(restored.accessToken).toBe('access-1');
    expect(restored.user?.email).toBe('ana@example.com');
  });

  it('starts signed out when the stored session is unreadable', () => {
    localStorage.setItem('penka.survivor.auth', '{ not json');

    const auth = useAuthStore();

    expect(auth.isAuthenticated).toBe(false);
  });

  it('takes the rotated pair from a refresh', async () => {
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');

    await expect(auth.refresh()).resolves.toBe(true);

    expect(auth.accessToken).toBe('access-2');
    expect(auth.refreshToken).toBe('refresh-2');
  });

  it('spends the refresh token once when two calls race for it', async () => {
    // Refresh tokens rotate: two calls that each spend one would make the
    // second fail and sign out a player whose session was perfectly good.
    let calls = 0;
    server.use(
      http.post(apiUrl('/auth/refresh'), () => {
        calls += 1;
        return HttpResponse.json({
          tokens: { accessToken: 'access-2', refreshToken: 'refresh-2' },
        });
      }),
    );
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');

    const [first, second] = await Promise.all([auth.refresh(), auth.refresh()]);

    expect([first, second]).toEqual([true, true]);
    expect(calls).toBe(1);
  });

  it('reports a rejected refresh instead of throwing at the caller', async () => {
    server.use(
      http.post(apiUrl('/auth/refresh'), () =>
        apiError(401, 'invalid_token', 'El token de sesión no es válido'),
      ),
    );
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');

    await expect(auth.refresh()).resolves.toBe(false);
  });

  it('does not call the API to refresh a session it never had', async () => {
    // `onUnhandledRequest: 'error'` is not what catches this — the handler
    // exists. The store has to decline on its own, because there is no token
    // to send.
    const auth = useAuthStore();

    await expect(auth.refresh()).resolves.toBe(false);
  });

  it('forgets the session on logout, including the stored copy', async () => {
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');

    auth.logout();

    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('penka.survivor.auth')).toBeNull();
  });

  it('is the session the API client uses, so a 401 refreshes and replays', async () => {
    let seen: string[] = [];
    server.use(
      http.get(apiUrl('/me'), ({ request }) => {
        const token = request.headers.get('authorization');
        seen.push(token ?? '');
        if (token === 'Bearer access-1') {
          return apiError(401, 'invalid_token', 'El token expiró');
        }
        return HttpResponse.json({ user: { id: 'u1', email: 'a@b.c', displayName: 'Ana', createdAt: '2026-08-01T12:00:00.000Z' } });
      }),
    );
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');
    seen = [];

    await getMe();

    expect(seen).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(auth.accessToken).toBe('access-2');
  });

  it('signs the player out when the refresh behind a 401 also fails', async () => {
    server.use(
      http.get(apiUrl('/me'), () => apiError(401, 'invalid_token', 'El token expiró')),
      http.post(apiUrl('/auth/refresh'), () =>
        apiError(401, 'invalid_token', 'El refresh token no es válido'),
      ),
    );
    const auth = useAuthStore();
    await auth.login('ana@example.com', 'correct horse');

    await expect(getMe()).rejects.toThrow();

    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('penka.survivor.auth')).toBeNull();
  });
});
