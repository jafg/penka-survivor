import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';

/**
 * How far a wake-up is scattered around its nominal delay. Every client that
 * loads a board at the same moment would otherwise come back at the same
 * moment for as long as the penka lasts, and the cadence tightens to 2s right
 * when the whole penka is watching.
 */
const JITTER_FLOOR = 0.85;
const JITTER_SPREAD = 0.3;

/** What the fetcher answers: the server's next cadence, or null to keep the current one. */
export type PollFetcher = () => Promise<number | null>;

export interface PollController {
  /** True while a fetch is in flight — the header's pip reads this. */
  isFetching: Ref<boolean>;
  /** The cadence the last response asked for, or null before the first one. */
  intervalSec: Ref<number | null>;
  start: () => void;
  stop: () => void;
  /** Fetch now and re-arm from the answer; used when the tab comes back. */
  refreshNow: () => Promise<void>;
}

/**
 * Server-driven polling.
 *
 * The client never decides how often to come back: every response carries
 * `nextPollInSec`, and the NEXT delay is read from the LATEST one. That is the
 * whole point of the field — the server tightens to 2s near a lock and drops to
 * 30s under strain, and a client that cached the first interval it saw would
 * ignore both.
 *
 * It is a chain of `setTimeout`s rather than a `setInterval` for the same
 * reason: the delay is not constant, and an interval that has to be torn down
 * and rebuilt on every change is just a slower timeout chain with a race in it.
 * The next one is armed only after the fetch settles, so a slow answer can
 * never stack requests on a struggling server.
 */
export function usePoll(fetcher: PollFetcher): PollController {
  const isFetching = ref(false);
  const intervalSec = ref<number | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    clearTimer();
    const seconds = intervalSec.value;
    if (!running || seconds === null || seconds <= 0 || document.hidden) {
      return;
    }
    const jitter = JITTER_FLOOR + Math.random() * JITTER_SPREAD;
    timer = setTimeout(() => {
      void refreshNow();
    }, seconds * 1000 * jitter);
  }

  async function refreshNow(): Promise<void> {
    clearTimer();
    isFetching.value = true;
    try {
      const seconds = await fetcher();
      if (seconds !== null) {
        intervalSec.value = seconds;
      }
    } catch {
      // Swallowed on purpose: whoever owns the fetcher reports the failure to
      // the player. Stopping here would leave a stale board with no way back
      // short of a reload, so the loop keeps the last known cadence and retries.
    } finally {
      isFetching.value = false;
      schedule();
    }
  }

  function onVisibilityChange(): void {
    if (!running) {
      return;
    }
    if (document.hidden) {
      // A backgrounded tab is nobody watching: polling it spends the server's
      // budget on a board no one can see.
      clearTimer();
      return;
    }
    // Coming back is exactly when the board is most out of date, so the resume
    // is a fetch, not a wait.
    void refreshNow();
  }

  function start(): void {
    if (running) {
      return;
    }
    running = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    void refreshNow();
  }

  function stop(): void {
    running = false;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(stop);
  }

  return { isFetching, intervalSec, start, stop, refreshNow };
}
