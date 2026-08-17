import { HttpResponse, http } from 'msw';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorCodes } from '@penka/contracts';
import { ADMIN_KEY_STORAGE_KEY, adminKey, apiUrl, setAdminKey } from '../api/client';
import { listPools } from '../api/endpoints';
import { apiError, server } from '../test-support/server';
import * as fixtures from '../test-support/fixtures';

import { useSessionStore } from './session';

/** Every admin route answers 401 to a key the deployment does not know. */
function refuseEveryKey(): void {
  server.use(
    http.get(apiUrl('/penkas'), () =>
      apiError(401, ErrorCodes.unauthorized, 'Invalid admin key'),
    ),
  );
}

/** Refuse until `good` shows up, the way a real deployment behaves. */
function acceptOnly(good: string): void {
  server.use(
    http.get(apiUrl('/penkas'), ({ request }) =>
      request.headers.get('x-admin-key') === good
        ? HttpResponse.json({ pools: fixtures.pools() })
        : apiError(401, ErrorCodes.unauthorized, 'Invalid admin key'),
    ),
  );
}

describe('the admin session', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts out neither locked nor confirmed — nothing has been asked yet', () => {
    const session = useSessionStore();

    expect(session.status).toBe('unknown');
    expect(session.isLocked).toBe(false);
  });

  it('locks the console when any call comes back 401', async () => {
    // The listener is on the client's traffic feed, not on one endpoint, so a
    // key that stops working locks the console whichever panel noticed first.
    refuseEveryKey();
    const session = useSessionStore();

    await expect(listPools()).rejects.toThrow();

    expect(session.status).toBe('unauthorized');
    expect(session.isLocked).toBe(true);
  });

  it('leaves the console open when a call fails for any other reason', async () => {
    // A 500 or an unreachable API is not an auth problem, and showing a key
    // prompt for one would send an operator hunting for the wrong thing.
    server.use(
      http.get(apiUrl('/penkas'), () => apiError(500, ErrorCodes.internal, 'boom')),
    );
    const session = useSessionStore();

    await expect(listPools()).rejects.toThrow();

    expect(session.isLocked).toBe(false);
  });

  it('stores a key that works and unlocks', async () => {
    acceptOnly('the-real-admin-key-0123456789abcdef');
    const session = useSessionStore();

    const accepted = await session.signIn('the-real-admin-key-0123456789abcdef');

    expect(accepted).toBe(true);
    expect(session.status).toBe('authorized');
    expect(session.isLocked).toBe(false);
    expect(localStorage.getItem(ADMIN_KEY_STORAGE_KEY)).toBe('the-real-admin-key-0123456789abcdef');
  });

  it('refuses a key the API rejects, and does not keep it', async () => {
    // A wrong key left in localStorage would shadow the build-time fallback for
    // good — the operator would be locked out even after the deployment is fixed.
    acceptOnly('the-real-admin-key-0123456789abcdef');
    const session = useSessionStore();

    const accepted = await session.signIn('wrong');

    expect(accepted).toBe(false);
    expect(session.isLocked).toBe(true);
    expect(localStorage.getItem(ADMIN_KEY_STORAGE_KEY)).toBeNull();
  });

  it('relays the API message, so the operator reads the server, not us', async () => {
    refuseEveryKey();
    const session = useSessionStore();

    await session.signIn('wrong');

    expect(session.errorMessage).toBe('Invalid admin key');
  });

  it('asks for a key rather than posting an empty one', async () => {
    const session = useSessionStore();

    const accepted = await session.signIn('   ');

    expect(accepted).toBe(false);
    expect(session.errorMessage).not.toBe('');
  });

  it('trims what was pasted', async () => {
    acceptOnly('the-real-admin-key-0123456789abcdef');
    const session = useSessionStore();

    await session.signIn('  the-real-admin-key-0123456789abcdef\n');

    expect(adminKey()).toBe('the-real-admin-key-0123456789abcdef');
  });

  it('signing out drops the stored key and locks the console', () => {
    setAdminKey('whatever-was-there-0123456789abcdef');
    const session = useSessionStore();

    session.signOut();

    expect(localStorage.getItem(ADMIN_KEY_STORAGE_KEY)).toBeNull();
    expect(session.isLocked).toBe(true);
  });
});
