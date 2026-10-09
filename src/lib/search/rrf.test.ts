import { describe, expect, it } from 'vitest';

import { rrfByFile } from '@/lib/search/rrf';

describe('rrfByFile', () => {
  it('counts only the best chunk of a file within one list', () => {
    // File 1 has three chunks near the top of the list; file 2 has a single chunk right behind them.
    const keyword = [
      { chunkId: 11, fileId: 1, rank: 1 },
      { chunkId: 12, fileId: 1, rank: 2 },
      { chunkId: 13, fileId: 1, rank: 3 },
      { chunkId: 21, fileId: 2, rank: 4 },
    ];
    const scores = rrfByFile([keyword]);
    expect(scores.get(1)?.score).toBeCloseTo(1 / 61);
    expect(scores.get(2)?.score).toBeCloseTo(1 / 64);
    expect(scores.get(1)?.bestChunkId).toBe(11);
  });

  it('adds up what a file earns in each list', () => {
    const keyword = [{ chunkId: 5, fileId: 7, rank: 1 }];
    const vector = [{ chunkId: 6, fileId: 7, rank: 2, distance: 0.2 }];
    const score = rrfByFile([keyword, vector]).get(7);
    expect(score?.score).toBeCloseTo(1 / 61 + 1 / 62);
    expect(score?.bestChunkId).toBe(5);
  });

  it('is empty for no results', () => {
    expect(rrfByFile([[], []]).size).toBe(0);
  });
});
