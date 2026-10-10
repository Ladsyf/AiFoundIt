export type Background = { mean: number; std: number };

const MIN_SAMPLE = 12;
const MIN_STD = 0.01;

export const Z_MIN = 3.5;
const Z_KEEP_OF_BEST = 0.6;

export function backgroundOf(similarities: number[]): Background | null {
  if (similarities.length < MIN_SAMPLE) return null;
  const mean = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
  const variance = similarities.reduce((sum, s) => sum + (s - mean) ** 2, 0) / similarities.length;
  return { mean, std: Math.max(Math.sqrt(variance), MIN_STD) };
}

export function zScore(similarity: number, background: Background): number {
  return (similarity - background.mean) / background.std;
}

export function standsOut(z: number, bestZ: number): boolean {
  return z >= Z_MIN && z >= bestZ * Z_KEEP_OF_BEST;
}
