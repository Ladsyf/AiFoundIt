import { describe, expect, it } from 'vitest';

import { backgroundOf, standsOut, zScore, Z_MIN } from '@/lib/search/relevance';

const spread = (center: number, half: number, n: number) =>
  Array.from({ length: n }, (_, i) => center - half + (2 * half * i) / (n - 1));

describe('backgroundOf', () => {
  it('has no opinion about a sample too small to trust', () => {
    expect(backgroundOf(spread(0.7, 0.05, 10))).toBeNull();
  });

  it('measures the mean and spread of a sample', () => {
    const bg = backgroundOf(spread(0.7, 0.05, 101))!;
    expect(bg.mean).toBeCloseTo(0.7, 3);
    expect(bg.std).toBeGreaterThan(0.025);
    expect(bg.std).toBeLessThan(0.035);
  });

  it('never lets a flat sample make everything look significant', () => {
    expect(backgroundOf(Array.from({ length: 50 }, () => 0.7))!.std).toBe(0.01);
  });
});

describe('standsOut', () => {
  const bg = backgroundOf(spread(0.72, 0.05, 101))!;

  it('rejects the best of an unrelated crowd, however high the raw similarity is', () => {
    expect(standsOut(zScore(0.77, bg), zScore(0.77, bg))).toBe(false);
  });

  it('accepts a hit far above the background', () => {
    expect(zScore(0.85, bg)).toBeGreaterThan(Z_MIN);
    expect(standsOut(zScore(0.85, bg), zScore(0.85, bg))).toBe(true);
  });

  it('trims weaker hits that trail far behind the best one', () => {
    const best = zScore(0.95, bg);
    expect(standsOut(zScore(0.85, bg), best)).toBe(false);
    expect(standsOut(zScore(0.93, bg), best)).toBe(true);
  });
});
