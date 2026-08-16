import { describe, expect, it } from 'vitest';
import { formatKickoff, outcomeLabel } from './match';

const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

describe('formatKickoff', () => {
  it('reads as a day and a time, in the viewer own timezone', () => {
    // 21:00 UTC is 18:00 in Buenos Aires. A player planning around a deadline
    // needs their clock, not the server's.
    expect(formatKickoff('2026-08-21T21:00:00.000Z', BUENOS_AIRES)).toBe('Vie 18:00');
  });

  it('rolls the day over when the timezone pushes it', () => {
    expect(formatKickoff('2026-08-21T02:00:00.000Z', 'Asia/Tokyo')).toBe('Vie 11:00');
  });

  it('falls back to an em dash rather than "Invalid Date"', () => {
    expect(formatKickoff('mañana', BUENOS_AIRES)).toBe('—');
  });
});

describe('outcomeLabel', () => {
  it('names who won without inventing a score', () => {
    // The API carries an outcome, never a scoreline. The prototype's mock
    // printed "2–0" for every home win; repeating that here would put a number
    // on screen that no match ever produced.
    expect(outcomeLabel('home')).toBe('Ganó local');
    expect(outcomeLabel('away')).toBe('Ganó visitante');
    expect(outcomeLabel('draw')).toBe('Empate');
  });
});
