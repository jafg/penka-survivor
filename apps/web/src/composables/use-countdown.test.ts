import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { formatCountdown, useCountdown } from './use-countdown';

describe('formatCountdown', () => {
  it('pads every field to two digits', () => {
    expect(formatCountdown(3661)).toBe('01:01:01');
  });

  it('lets the hours run past a day rather than wrapping', () => {
    // Matchday 3 locks 50 hours after materialization, so "02:00:00" would be
    // a lie a player could plan around.
    expect(formatCountdown(26 * 3600)).toBe('26:00:00');
  });

  it('bottoms out at zero instead of counting backwards', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-90)).toBe('00:00:00');
  });
});

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T20:59:57.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function run(lockAt: string | null) {
    const source = ref(lockAt);
    const scope = effectScope();
    const countdown = scope.run(() => useCountdown(() => source.value));
    if (countdown === undefined) {
      throw new Error('the scope did not run');
    }
    return { countdown, source, dispose: () => scope.stop() };
  }

  it('counts down once a second', async () => {
    const { countdown, dispose } = run('2026-08-21T21:00:00.000Z');

    expect(countdown.formatted.value).toBe('00:00:03');
    await vi.advanceTimersByTimeAsync(2000);
    expect(countdown.formatted.value).toBe('00:00:01');
    dispose();
  });

  it('reaches the lock and stays there, so the view can flip without a reload', async () => {
    const { countdown, dispose } = run('2026-08-21T21:00:00.000Z');

    expect(countdown.hasReachedLock.value).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);

    expect(countdown.hasReachedLock.value).toBe(true);
    expect(countdown.formatted.value).toBe('00:00:00');
    dispose();
  });

  it('reports no lock at all while the matchday has not loaded', () => {
    const { countdown, dispose } = run(null);

    expect(countdown.hasReachedLock.value).toBe(false);
    expect(countdown.formatted.value).toBe('00:00:00');
    dispose();
  });

  it('stops ticking when its scope is torn down', async () => {
    const { countdown, dispose } = run('2026-08-21T23:00:00.000Z');
    const before = countdown.now.value.getTime();

    dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(countdown.now.value.getTime()).toBe(before);
  });
});
