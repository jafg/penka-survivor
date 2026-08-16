import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { apiError, server } from '../test-support/server';
import { useAuthStore } from './auth';
import { useMyEntryStore } from './my-entry';

const { PENKA_ID, OTHER_PENKA_ID } = fixtures;

async function signIn(): Promise<void> {
  await useAuthStore().login('ana@example.com', 'correct horse');
}

describe('myEntryStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await signIn();
  });

  it('loads the personal entry with the player token', async () => {
    let token: string | null = null;
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), ({ request }) => {
        token = request.headers.get('authorization');
        return HttpResponse.json({ myEntry: fixtures.myEntry({ lives: 1 }) });
      }),
    );
    const mine = useMyEntryStore();

    await mine.open(PENKA_ID);

    expect(token).toBe('Bearer access-1');
    expect(mine.myEntry?.lives).toBe(1);
  });

  it('drops the previous penka the moment another one is opened', async () => {
    // These are the numbers a player acts on. One poll of another penka's
    // lives under this penka's name is a wrong pick waiting to happen.
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    const pending = mine.open(OTHER_PENKA_ID);
    expect(mine.myEntry).toBeNull();

    await pending;
    expect(mine.penkaId).toBe(OTHER_PENKA_ID);
  });

  it('refuses to fetch before a penka is open', async () => {
    await expect(useMyEntryStore().refresh()).resolves.toBeUndefined();
  });

  it('submits the pick by team CODE', async () => {
    let body: { teamCode: string } | null = null;
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), async ({ request }) => {
        body = (await request.json()) as { teamCode: string };
        return HttpResponse.json({ myEntry: fixtures.myEntry({ myPick: 'RIV' }) });
      }),
    );
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    await mine.submitPick('RIV');

    expect(body).toEqual({ teamCode: 'RIV' });
  });

  it('takes the updated entry from the pick response, without asking for it again', async () => {
    // The route answers the UPDATED personal delta. A refetch of `/me` right
    // after would ask the server for something it just handed over — and open a
    // window where the screen shows the pre-pick state.
    let personalReads = 0;
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () => {
        personalReads += 1;
        return HttpResponse.json({ myEntry: fixtures.myEntry() });
      }),
      http.post(apiUrl('/penkas/:penkaId/picks'), () =>
        HttpResponse.json({
          myEntry: fixtures.myEntry({ myPick: 'RIV', usedTeams: ['BOC', 'RIV'] }),
        }),
      ),
    );
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);
    expect(personalReads).toBe(1);

    await mine.submitPick('RIV');

    expect(mine.myEntry?.myPick).toBe('RIV');
    expect(mine.myEntry?.usedTeams).toEqual(['BOC', 'RIV']);
    expect(personalReads).toBe(1);
  });

  it('flags the submission while it is in flight, so the button can lock', async () => {
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    const pending = mine.submitPick('RIV');
    expect(mine.isSubmitting).toBe(true);

    await pending;
    expect(mine.isSubmitting).toBe(false);
  });

  it('leaves the entry alone when the matchday locked first', async () => {
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), () =>
        apiError(409, 'matchday_locked', 'La fecha ya está cerrada'),
      ),
    );
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    await expect(mine.submitPick('RIV')).rejects.toMatchObject({ code: 'matchday_locked' });

    expect(mine.myEntry?.myPick).toBeNull();
    expect(mine.error?.message).toBe('La fecha ya está cerrada');
    expect(mine.isSubmitting).toBe(false);
  });

  it('carries the already-used rejection through with the API wording', async () => {
    server.use(
      http.post(apiUrl('/penkas/:penkaId/picks'), () =>
        apiError(422, 'team_already_used', 'Ya usaste River Plate en esta penka'),
      ),
    );
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    await expect(mine.submitPick('RIV')).rejects.toMatchObject({ code: 'team_already_used' });
    expect(mine.error?.message).toBe('Ya usaste River Plate en esta penka');
  });

  it('knows which teams are spent, for the struck-through cards', async () => {
    server.use(
      http.get(apiUrl('/penkas/:penkaId/me'), () =>
        HttpResponse.json({ myEntry: fixtures.myEntry({ usedTeams: ['BOC', 'FLA'] }) }),
      ),
    );
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    expect(mine.isTeamUsed('BOC')).toBe(true);
    expect(mine.isTeamUsed('RIV')).toBe(false);
  });

  it('forgets the entry when the player signs out', async () => {
    // Personal data must not outlive the session it belongs to.
    const mine = useMyEntryStore();
    await mine.open(PENKA_ID);

    useAuthStore().logout();

    expect(mine.myEntry).toBeNull();
    expect(mine.penkaId).toBeNull();
  });
});
