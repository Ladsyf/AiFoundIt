export type Ranked = { chunkId: number; fileId: number; rank: number; distance?: number };

export type FileScore = { score: number; bestChunkId: number; bestScore: number; distance?: number };

// Reciprocal Rank Fusion: score(f) = Σ 1/(k + rank_i(f)) over each ranked list, using only the file's
// best chunk in each list. A long document with many matching chunks therefore does not beat a
// one-chunk receipt just by having more of them.
export function rrfByFile(lists: Ranked[][], k = 60): Map<number, FileScore> {
  const files = new Map<number, FileScore>();
  for (const list of lists) {
    const bestPerFile = new Map<number, Ranked>();
    for (const hit of list) {
      const current = bestPerFile.get(hit.fileId);
      if (!current || hit.rank < current.rank) bestPerFile.set(hit.fileId, hit);
    }
    for (const hit of bestPerFile.values()) {
      const rrf = 1 / (k + hit.rank);
      const entry = files.get(hit.fileId) ?? { score: 0, bestChunkId: hit.chunkId, bestScore: 0 };
      entry.score += rrf;
      if (rrf > entry.bestScore) {
        entry.bestChunkId = hit.chunkId;
        entry.bestScore = rrf;
        entry.distance = hit.distance;
      }
      files.set(hit.fileId, entry);
    }
  }
  return files;
}
