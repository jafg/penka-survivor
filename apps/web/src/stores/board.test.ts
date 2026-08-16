import { createPinia, setActivePinia } from 'pinia';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiUrl } from '../api/client';
import * as fixtures from '../test-support/fixtures';
import { apiError, server } from '../test-support/server';
import { useBoardStore } from './board';

const { PENKA_ID, OTHER_PENKA_ID, LOCK_AT } = fixtures;

describe('boardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads the board and the matchday together', async () => {
    const board = useBoardStore();

    await board.open(PENKA_ID);

    expect(board.board?.matchday).toBe(1);
    expect(board.matchday?.lockAt).toBe(LOCK_AT);
    expect(board.matches).toHaveLength(2);
  });

  it('sends no token — the board is the same bytes for every viewer', async () => {
    const headers: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), ({ request }) => {
        headers.push(request.headers.get('authorization'));
        return HttpResponse.json({ board: fixtures.board() });
      }),
      http.get(apiUrl('/penkas/:penkaId/matchday/current'), ({ request }) => {
        headers.push(request.headers.get('authorization'));
        return HttpResponse.json(fixtures.currentMatchday());
      }),
    );

    await useBoardStore().open(PENKA_ID);

    expect(headers).toEqual([null, null]);
  });

  it('answers the cadence the server asked for, so the poll can arm itself', async () => {
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), () =>
        HttpResponse.json({ board: fixtures.board({ nextPollInSec: 2 }) }),
      ),
    );
    const board = useBoardStore();
    board.open(PENKA_ID);

    await expect(board.refresh()).resolves.toBe(2);
  });

  it('refuses to fetch before a penka is open', async () => {
    // `onUnhandledRequest: 'error'` would not catch this; the handlers exist.
    // The store has to decline on its own rather than build `/penkas//board`.
    const board = useBoardStore();

    await expect(board.refresh()).resolves.toBeNull();
  });

  it('drops the previous penka the moment another one is opened', async () => {
    // Two penkas share this screen. Leaving the old board up for one poll shows
    // a player another competition's standings under their penka's name.
    const board = useBoardStore();
    await board.open(PENKA_ID);

    const pending = board.open(OTHER_PENKA_ID);
    expect(board.board).toBeNull();

    await pending;
    expect(board.penkaId).toBe(OTHER_PENKA_ID);
  });

  it('keeps the last good board when a poll fails', async () => {
    // A blip mid-match must not blank the standings everyone is watching.
    const board = useBoardStore();
    await board.open(PENKA_ID);
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), () =>
        apiError(503, 'internal', 'El servicio no está disponible'),
      ),
    );

    await board.refresh();

    expect(board.board?.matchday).toBe(1);
    expect(board.error?.message).toBe('El servicio no está disponible');
  });

  it('clears the error once a poll succeeds again', async () => {
    const board = useBoardStore();
    await board.open(PENKA_ID);
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), () =>
        apiError(503, 'internal', 'El servicio no está disponible'),
      ),
    );
    await board.refresh();

    server.resetHandlers();
    await board.refresh();

    expect(board.error).toBeNull();
  });

  it('keeps the server order of the island, which the engine already ranked', async () => {
    // Points ordering is a game rule and lives in `computeStandings`. Sorting
    // again here would be a second opinion about who is winning.
    server.use(
      http.get(apiUrl('/penkas/:penkaId/board'), () =>
        HttpResponse.json({
          board: fixtures.board({
            island: [
              fixtures.boardPlayer({ displayName: 'Bruno Ferreira', points: 5 }),
              fixtures.boardPlayer({ displayName: 'Ana Suárez', points: 2 }),
            ],
          }),
        }),
      ),
    );
    const board = useBoardStore();

    await board.open(PENKA_ID);

    expect(board.board?.island.map((player) => player.displayName)).toEqual([
      'Bruno Ferreira',
      'Ana Suárez',
    ]);
  });

  describe('isLockedAt', () => {
    it('follows the server while the deadline is still ahead', async () => {
      const board = useBoardStore();
      await board.open(PENKA_ID);

      expect(board.isLockedAt(new Date('2026-08-21T20:59:59.000Z'))).toBe(false);
    });

    it('flips at the deadline without waiting for the next poll', async () => {
      // The countdown hits zero between polls. Asking the engine — the same
      // function the API uses — is how the UI closes at the same instant the
      // server does, instead of taking picks it is about to reject.
      const board = useBoardStore();
      await board.open(PENKA_ID);

      expect(board.isLockedAt(new Date(LOCK_AT))).toBe(true);
    });

    it('stays locked when an operator closed the matchday ahead of its deadline', async () => {
      server.use(
        http.get(apiUrl('/penkas/:penkaId/matchday/current'), () =>
          HttpResponse.json(
            fixtures.currentMatchday({ matchday: fixtures.matchday({ status: 'locked' }) }),
          ),
        ),
      );
      const board = useBoardStore();
      await board.open(PENKA_ID);

      expect(board.isLockedAt(new Date('2026-08-21T19:00:00.000Z'))).toBe(true);
    });

    it('trusts the server over the clock when the matchday has not loaded', async () => {
      server.use(
        http.get(apiUrl('/penkas/:penkaId/board'), () =>
          HttpResponse.json({ board: fixtures.board({ isLocked: true }) }),
        ),
        http.get(apiUrl('/penkas/:penkaId/matchday/current'), () =>
          apiError(503, 'internal', 'El servicio no está disponible'),
        ),
      );
      const board = useBoardStore();
      await board.open(PENKA_ID);

      expect(board.isLockedAt(new Date('2026-08-21T19:00:00.000Z'))).toBe(true);
    });
  });
});
