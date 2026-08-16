import { describe, expect, it } from 'vitest';
import type { PollingProfile } from './api/admin';
import {
  BOARD_CACHE_TTL_SECONDS,
  NEAR_LOCK_MS,
  POLLING_PROFILE_KEY,
  boardCacheKey,
  nextPollInSec,
  toPollingProfile,
} from './ops';

describe('POLLING_PROFILE_KEY', () => {
  it('names one key for the whole deployment', () => {
    expect(POLLING_PROFILE_KEY).toBe('ops:pollingProfile');
  });

  it('carries no penka in it, so it cannot be built per penka by accident', () => {
    // The profile is a load valve for the deployment, not an editorial setting
    // on one competition — a key with a penka in it would mean the opposite.
    expect(POLLING_PROFILE_KEY).not.toContain('penka');
    expect(POLLING_PROFILE_KEY).not.toContain('{');
  });
});

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

describe('boardCacheKey', () => {
  it('names one cache entry per penka', () => {
    expect(boardCacheKey('66b0f0a1c9e77b0012345678')).toBe('penka:66b0f0a1c9e77b0012345678:board');
  });

  it('keeps two penkas apart', () => {
    // The board is public and shared by every viewer of ONE penka; a key that
    // collided would show a penka the standings of another.
    expect(boardCacheKey('a')).not.toBe(boardCacheKey('b'));
  });

  it('expires, so a board nobody rebuilds cannot outlive its matchday', () => {
    expect(BOARD_CACHE_TTL_SECONDS).toBeGreaterThan(0);
  });
});

describe('nextPollInSec', () => {
  const LOCK_AT = new Date('2026-08-21T18:45:00.000Z');

  /** Negative minutes mean the matchday already locked. */
  function clockBeforeLock(minutes: number): Date {
    return new Date(LOCK_AT.getTime() - minutes * 60_000);
  }

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
      expect(nextPollInSec({ profile, now: clockBeforeLock(minutesToLock), lockAt: LOCK_AT })).toBe(
        expected,
      );
    });
  }

  it('speeds up exactly one millisecond inside the window, not before', () => {
    const atTheEdge = new Date(LOCK_AT.getTime() - NEAR_LOCK_MS);
    const oneMsInside = new Date(atTheEdge.getTime() + 1);

    expect(nextPollInSec({ profile: 'normal', now: atTheEdge, lockAt: LOCK_AT })).toBe(10);
    expect(nextPollInSec({ profile: 'normal', now: oneMsInside, lockAt: LOCK_AT })).toBe(2);
  });
});
