import { describe, expect, it } from 'vitest';
import { JOIN_CODE_SPACE, MAX_JOIN_CODE_ATTEMPTS, generateJoinCode } from './join-code';

const SAMPLES = 20_000;

function draw(count: number): string[] {
  return Array.from({ length: count }, () => generateJoinCode());
}

describe('generateJoinCode', () => {
  it('always produces a zero-padded 4-digit string', () => {
    for (const code of draw(2_000)) {
      expect(code).toMatch(/^\d{4}$/);
      expect(code).toHaveLength(4);
    }
  });

  it('stays inside the 0000–9999 space', () => {
    for (const code of draw(2_000)) {
      const value = Number(code);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(JOIN_CODE_SPACE);
    }
  });

  it('spreads over the whole space', () => {
    // 20k draws over 10k codes: ~8.6k distinct if uniform. A generator stuck in
    // a corner of the space (a biased modulo, a short cycle) falls far short.
    const distinct = new Set(draw(SAMPLES));
    expect(distinct.size).toBeGreaterThan(8_000);
  });

  it('is uniform across leading digits', () => {
    const counts = new Map<string, number>();
    for (const code of draw(SAMPLES)) {
      const digit = code.slice(0, 1);
      counts.set(digit, (counts.get(digit) ?? 0) + 1);
    }

    expect(counts.size).toBe(10);
    // Expected 10% each; ±2 points is ~9 standard deviations at this sample
    // size, so this is a bias detector, not a flake.
    for (const [digit, count] of counts) {
      const share = count / SAMPLES;
      expect(share, `leading digit ${digit} share`).toBeGreaterThan(0.08);
      expect(share, `leading digit ${digit} share`).toBeLessThan(0.12);
    }
  });

  it('never repeats itself back to back over a long run', () => {
    const codes = draw(1_000);
    const repeats = codes.filter((code, index) => index > 0 && code === codes[index - 1]);
    expect(repeats).toHaveLength(0);
  });
});

describe('join code policy', () => {
  it('keeps the MVP ceiling and retry budget explicit', () => {
    expect(JOIN_CODE_SPACE).toBe(10_000);
    expect(MAX_JOIN_CODE_ATTEMPTS).toBe(5);
  });
});
