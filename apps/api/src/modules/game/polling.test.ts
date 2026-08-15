import { describe, expect, it } from 'vitest';
import type { PollingProfile } from '@penka/contracts';
import { NEAR_LOCK_MS, nextPollInSec, toPollingProfile } from './polling';

const LOCK_AT = new Date('2026-08-21T18:45:00.000Z');

/** Negative minutes mean the matchday already locked. */
function clockBeforeLock(minutes: number): Date {
  return new Date(LOCK_AT.getTime() - minutes * 60_000);
}

describe('toPollingProfile', () => {
  it('reads back every profile the contract allows', () => {
    expect(toPollingProfile('live')).toBe('live');
    expect(toPollingProfile('normal')).toBe('normal');
    expect(toPollingProfile('slow')).toBe('slow');
  });

  it('falls back to normal when no operator has set a cadence', () => {
    expect(toPollingProfile(null)).toBe('normal');
  });

  it('falls back to normal for a value outside the contract', () => {
    // 'degraded' is a plausible name that PollingProfileSchema does not carry:
    // a stale back office writing it must not brick the board.
    expect(toPollingProfile('degraded')).toBe('normal');
    expect(toPollingProfile('')).toBe('normal');
    expect(toPollingProfile('LIVE')).toBe('normal');
  });
});

describe('nextPollInSec', () => {
  const cases: { profile: PollingProfile; minutesToLock: number; expected: number; why: string }[] =
    [
      { profile: 'live', minutesToLock: 600, expected: 2, why: 'live ignores the clock' },
      { profile: 'live', minutesToLock: 5, expected: 2, why: 'live is already the fast cadence' },
      { profile: 'live', minutesToLock: -30, expected: 2, why: 'live stays fast after lock' },
      { profile: 'slow', minutesToLock: 600, expected: 30, why: 'slow ignores the clock' },
      { profile: 'slow', minutesToLock: 5, expected: 30, why: 'slow outranks the lock window' },
      { profile: 'slow', minutesToLock: -30, expected: 30, why: 'slow stays slow after lock' },
      { profile: 'normal', minutesToLock: 600, expected: 10, why: 'nothing happens for hours' },
      { profile: 'normal', minutesToLock: 11, expected: 10, why: 'still outside the window' },
      { profile: 'normal', minutesToLock: 10, expected: 10, why: 'the window is strictly inside' },
      { profile: 'normal', minutesToLock: 9, expected: 2, why: 'picks land in the last minutes' },
      { profile: 'normal', minutesToLock: 0, expected: 2, why: 'lock is happening right now' },
      { profile: 'normal', minutesToLock: -30, expected: 2, why: 'results land right after lock' },
    ];

  for (const { profile, minutesToLock, expected, why } of cases) {
    it(`polls every ${expected}s on ${profile} at ${minutesToLock}min to lock — ${why}`, () => {
      expect(
        nextPollInSec({ profile, now: clockBeforeLock(minutesToLock), lockAt: LOCK_AT }),
      ).toBe(expected);
    });
  }

  it('speeds up exactly one millisecond inside the window, not before', () => {
    const atTheEdge = new Date(LOCK_AT.getTime() - NEAR_LOCK_MS);
    const oneMsInside = new Date(atTheEdge.getTime() + 1);

    expect(nextPollInSec({ profile: 'normal', now: atTheEdge, lockAt: LOCK_AT })).toBe(10);
    expect(nextPollInSec({ profile: 'normal', now: oneMsInside, lockAt: LOCK_AT })).toBe(2);
  });
});
