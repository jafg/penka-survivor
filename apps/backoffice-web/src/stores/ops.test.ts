import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOpsStore } from './ops';
import { apiUrl } from '../api/client';
import { apiError, server } from '../test-support/server';

describe('opsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('writes the contract profile and keeps the one the API answered', async () => {
    const store = useOpsStore();
    let sent: unknown = null;
    server.use(
      http.put(apiUrl('/polling-profile'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ profile: 'slow' });
      }),
    );

    await store.setProfile('slow');

    expect(sent).toEqual({ profile: 'slow' });
    expect(store.profile).toBe('slow');
  });

  it('leaves the profile alone when the API refuses the write', async () => {
    const store = useOpsStore();
    store.observe('normal');
    server.use(
      http.put(apiUrl('/polling-profile'), () =>
        apiError(400, 'invalid_profile', 'Profile must be live, normal or slow'),
      ),
    );

    await expect(store.setProfile('live')).rejects.toMatchObject({ code: 'invalid_profile' });

    // Showing `live` as selected after a refusal would tell the operator the
    // deployment is polling twice a second when it is not.
    expect(store.profile).toBe('normal');
  });

  it('takes the served profile from a matchday read', () => {
    const store = useOpsStore();

    store.observe('live');

    expect(store.profile).toBe('live');
  });

  it('computes the cadence with the same function the public API serves', () => {
    const store = useOpsStore();
    const lockAt = '2026-08-16T21:00:00.000Z';
    store.stamp(new Date('2026-08-16T20:00:00.000Z'));

    store.observe('normal');
    expect(store.intervalSec(lockAt)).toBe(10);

    store.observe('live');
    expect(store.intervalSec(lockAt)).toBe(2);

    store.observe('slow');
    expect(store.intervalSec(lockAt)).toBe(30);
  });

  it('reflects the tightening `normal` does inside the last ten minutes', () => {
    // The API does this on its own, so a console that showed a flat 10 s would
    // be reporting a cadence nobody is serving.
    const store = useOpsStore();
    store.observe('normal');
    store.stamp(new Date('2026-08-16T20:55:00.000Z'));

    expect(store.intervalSec('2026-08-16T21:00:00.000Z')).toBe(2);
  });

  it('reports no cadence at all until a matchday says when it locks', () => {
    const store = useOpsStore();

    expect(store.intervalSec(null)).toBeNull();
  });
});
