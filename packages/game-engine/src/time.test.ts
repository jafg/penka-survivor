import { describe, expect, it } from 'vitest';
import { isoToEpochMs, tryIsoToEpochMs } from './time';

describe('isoToEpochMs', () => {
  it('parses a UTC timestamp', () => {
    expect(isoToEpochMs('2026-08-21T18:45:00.000Z')).toBe(Date.UTC(2026, 7, 21, 18, 45, 0));
  });

  it('parses an offset timestamp to the same instant', () => {
    expect(isoToEpochMs('2026-08-21T21:45:00+03:00')).toBe(Date.UTC(2026, 7, 21, 18, 45, 0));
  });

  it('throws on a non-timestamp string', () => {
    expect(() => isoToEpochMs('tomorrow')).toThrow(/tomorrow/);
  });
});

describe('tryIsoToEpochMs', () => {
  it('parses a valid timestamp', () => {
    expect(tryIsoToEpochMs('2026-08-21T18:45:00.000Z')).toBe(Date.UTC(2026, 7, 21, 18, 45, 0));
  });

  it('returns null instead of throwing on a non-timestamp string', () => {
    expect(tryIsoToEpochMs('tomorrow')).toBeNull();
    expect(tryIsoToEpochMs('')).toBeNull();
  });
});
