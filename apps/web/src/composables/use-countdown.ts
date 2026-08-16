import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import { tryIsoToEpochMs } from '@penka/game-engine';

/**
 * `HH:MM:SS`, hours unbounded. Matchday 3 locks fifty hours out, so wrapping at
 * a day would show a player "02:00:00" for something two days away.
 *
 * Pure and exported on its own because the shape of the string is part of the
 * visual contract (see `docs/visual-parity-checklist.md`), and a format is much
 * cheaper to hold with a test than with a screenshot.
 */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '00:00:00';
  }
  return [
    Math.floor(totalSeconds / 3600),
    Math.floor(totalSeconds / 60) % 60,
    totalSeconds % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export interface Countdown {
  /** The ticking clock, so a caller can ask the engine whether the matchday locked. */
  now: Ref<Date>;
  secondsLeft: ComputedRef<number>;
  formatted: ComputedRef<string>;
  /** The clock passed `lockAt`. Says nothing about what the server thinks yet. */
  hasReachedLock: ComputedRef<boolean>;
}

/**
 * A one-second clock plus the arithmetic around a lock instant.
 *
 * The clock is exposed rather than kept private because the lock decision is
 * NOT this app's to make: callers hand `now` to `isMatchdayLocked` in
 * `@penka/game-engine`, which is where "is this matchday closed" is defined for
 * every process in the repo. All this composable contributes is a `now` that
 * changes, so the view re-renders the moment the deadline passes instead of
 * waiting for the next poll.
 */
export function useCountdown(lockAt: () => string | null): Countdown {
  const now = ref(new Date());
  const timer = setInterval(() => {
    now.value = new Date();
  }, 1000);

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      clearInterval(timer);
    });
  }

  const lockAtMs = computed(() => {
    const iso = lockAt();
    return iso === null ? null : tryIsoToEpochMs(iso);
  });

  const secondsLeft = computed(() => {
    const target = lockAtMs.value;
    if (target === null) {
      return 0;
    }
    return Math.max(0, Math.round((target - now.value.getTime()) / 1000));
  });

  const hasReachedLock = computed(() => {
    const target = lockAtMs.value;
    return target !== null && now.value.getTime() >= target;
  });

  return { now, secondsLeft, formatted: computed(() => formatCountdown(secondsLeft.value)), hasReachedLock };
}
