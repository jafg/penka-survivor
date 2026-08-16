import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Board, Match, Matchday } from '@penka/contracts';
import { isMatchdayLocked } from '@penka/game-engine';
import { ApiError } from '../api/client';
import { getBoard, getCurrentMatchday } from '../api/endpoints';

/**
 * PUBLIC penka data: the board and the current matchday's fixtures.
 *
 * Everything here is the same for every viewer, which is why neither call
 * carries a token. Personal data — the player's own pick, lives and used teams —
 * lives in `myEntryStore` and never leaks into this one. Keeping the split at
 * the store boundary is what stops a component from quietly rendering one
 * player's secret pick onto a board everyone can see.
 */
export const useBoardStore = defineStore('board', () => {
  const penkaId = ref<string | null>(null);
  const board = ref<Board | null>(null);
  const matchday = ref<Matchday | null>(null);
  const matches = ref<Match[]>([]);
  const isLoading = ref(false);
  const error = ref<ApiError | null>(null);

  /**
   * Point the store at a penka WITHOUT fetching. Anything from the previous one
   * goes immediately, so no frame ever shows another penka's standings under
   * this one's name.
   *
   * Separate from `open` because the app's poll loop does the fetching: it
   * selects, then starts, and one request goes out instead of two.
   */
  function select(nextPenkaId: string | null): void {
    penkaId.value = nextPenkaId;
    board.value = null;
    matchday.value = null;
    matches.value = [];
    error.value = null;
  }

  /** Select and load in one step. */
  async function open(nextPenkaId: string): Promise<void> {
    select(nextPenkaId);
    await refresh();
  }

  /**
   * One poll. Answers `nextPollInSec` so `usePoll` can arm the next wake-up from
   * the server's own cadence, or null when there was nothing to fetch.
   *
   * The two calls are settled independently: a board that arrives while the
   * fixtures fail is still worth showing, and vice versa. A failure keeps the
   * last good copy on screen — blanking the standings mid-match over one blip
   * is worse than showing them a few seconds stale.
   */
  async function refresh(): Promise<number | null> {
    const id = penkaId.value;
    if (id === null) {
      return null;
    }
    isLoading.value = true;
    try {
      const [boardResult, matchdayResult] = await Promise.allSettled([
        getBoard(id),
        getCurrentMatchday(id),
      ]);
      // A penka switched mid-flight: this answer is about the previous one.
      if (penkaId.value !== id) {
        return null;
      }
      if (boardResult.status === 'fulfilled') {
        board.value = boardResult.value.board;
      }
      if (matchdayResult.status === 'fulfilled') {
        matchday.value = matchdayResult.value.matchday;
        matches.value = matchdayResult.value.matches;
      }
      error.value = firstFailure([boardResult, matchdayResult]);
      return board.value?.nextPollInSec ?? null;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Are picks in? The rule is `isMatchdayLocked` in `@penka/game-engine` — the
   * same function the API calls — so the UI closes at the instant the server
   * does instead of accepting a pick it is about to reject. The server's own
   * `isLocked` is the fallback for the moment before the fixtures land.
   *
   * `now` is passed in rather than read here so the caller's ticking clock
   * drives it, and the screen flips the second the countdown reaches zero
   * without waiting for the next poll.
   */
  function isLockedAt(now: Date): boolean {
    if (matchday.value !== null) {
      return isMatchdayLocked(matchday.value, now);
    }
    return board.value?.isLocked ?? false;
  }

  return {
    penkaId,
    board,
    matchday,
    matches,
    isLoading,
    error,
    select,
    open,
    refresh,
    isLockedAt,
  };
});

function firstFailure(results: PromiseSettledResult<unknown>[]): ApiError | null {
  for (const result of results) {
    if (result.status === 'rejected') {
      return result.reason instanceof ApiError
        ? result.reason
        : new ApiError(0, 'internal', 'Algo salió mal. Probá de nuevo.');
    }
  }
  return null;
}
