import { describe, expect, it } from 'vitest';
import { POLLING_PROFILE_KEY, toPollingProfile } from './ops';

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
