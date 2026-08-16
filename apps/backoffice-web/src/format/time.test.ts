import { describe, expect, it } from 'vitest';
import { formatTime } from './time';

const MONTEVIDEO = 'America/Montevideo';

describe('formatTime', () => {
  it('reads as a wall clock in the operator’s own timezone', () => {
    // 21:30 UTC is 18:30 in Montevideo. An operator closing a matchday works
    // against the clock on their wall, not the server's.
    expect(formatTime('2026-08-16T21:30:00.000Z', MONTEVIDEO)).toBe('18:30');
  });

  it('keeps the 24-hour clock the prototype used, with no AM/PM', () => {
    expect(formatTime('2026-08-17T00:15:00.000Z', MONTEVIDEO)).toBe('21:15');
  });

  it('falls back to an em dash rather than "Invalid Date"', () => {
    expect(formatTime('a las nueve', MONTEVIDEO)).toBe('—');
  });
});
