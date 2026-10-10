export const AUTO_CHECK_MS = 15_000;
export const AUTO_SCAN_MIN_GAP_MS = 60_000;

export type AutoScanCheck = {
  generation: number;
  lastGeneration: number;
  comingBack: boolean;
  now: number;
  lastScanAt: number;
};

export function shouldAutoScan({ generation, lastGeneration, comingBack, now, lastScanAt }: AutoScanCheck): boolean {
  if (now - lastScanAt < AUTO_SCAN_MIN_GAP_MS) return false;
  if (generation < 0) return comingBack;
  return generation !== lastGeneration;
}
