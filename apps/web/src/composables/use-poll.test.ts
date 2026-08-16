import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { usePoll } from './use-poll';

/**
 * `document.hidden` is a getter on the prototype in jsdom, so a test that wants
 * to hide the tab has to replace it and then tell the page it changed — exactly
 * what a browser does.
 */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // No jitter unless a test asks for it, so intervals are exact arithmetic.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function run(fetcher: () => Promise<number | null>) {
    const scope = effectScope();
    const poll = scope.run(() => usePoll(fetcher));
    if (poll === undefined) {
      throw new Error('the scope did not run');
    }
    return { poll, dispose: () => scope.stop() };
  }

  it('fetches immediately on start and reports the cadence the server asked for', async () => {
    const fetcher = vi.fn(async () => 10);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(poll.intervalSec.value).toBe(10);
    dispose();
  });

  it('takes the next delay from the LAST response, not from the first', async () => {
    // The board tightens to 2s inside the last ten minutes before lock; a client
    // that cached the first interval would keep polling at 10s through it.
    const seconds = [10, 2, 2];
    let call = 0;
    const fetcher = vi.fn(async () => seconds[call++] ?? 2);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Now on the 2s cadence: 10s of the old one would be four more fetches.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispose();
  });

  it('scatters the wake-ups by ±15% so clients do not arrive together', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetcher = vi.fn(async () => 10);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);

    // The floor of the window is 0.85 × 10s.
    await vi.advanceTimersByTimeAsync(8_499);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('never wakes later than the ceiling of that window', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const fetcher = vi.fn(async () => 10);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(11_500);

    expect(fetcher).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('stops polling a hidden tab', async () => {
    const fetcher = vi.fn(async () => 2);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetcher).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('fetches immediately when the tab comes back, without waiting out the interval', async () => {
    const fetcher = vi.fn(async () => 30);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);

    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetcher).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('keeps polling after a failed fetch', async () => {
    // A poll that gives up on the first network blip leaves a stale board on
    // screen with no way back short of a reload.
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      if (call === 2) {
        throw new Error('offline');
      }
      return 5;
    });
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispose();
  });

  it('flags the in-flight fetch so the header can show it', async () => {
    let release = (): void => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(10);
        }),
    );
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.isFetching.value).toBe(true);

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.isFetching.value).toBe(false);
    dispose();
  });

  it('stops when its scope is torn down', async () => {
    const fetcher = vi.fn(async () => 2);
    const { poll, dispose } = run(fetcher);

    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
