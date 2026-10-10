import { describe, expect, it } from 'vitest';

import { AUTO_SCAN_MIN_GAP_MS, shouldAutoScan } from '@/lib/auto-index';

const base = { generation: 10, lastGeneration: 10, comingBack: false, now: 1_000_000, lastScanAt: 0 };

describe('shouldAutoScan', () => {
  it('scans when the phone’s media changed since the last scan', () => {
    expect(shouldAutoScan({ ...base, generation: 11 })).toBe(true);
  });

  it('leaves an unchanged phone alone, even when the app comes back to the screen', () => {
    expect(shouldAutoScan(base)).toBe(false);
    expect(shouldAutoScan({ ...base, comingBack: true })).toBe(false);
  });

  it('scans at the first look, before any scan has been seen', () => {
    expect(shouldAutoScan({ ...base, lastGeneration: -1 })).toBe(true);
  });

  it('never scans more than once a minute', () => {
    const now = 500_000;
    expect(shouldAutoScan({ ...base, generation: 11, now, lastScanAt: now - AUTO_SCAN_MIN_GAP_MS + 1 })).toBe(false);
    expect(shouldAutoScan({ ...base, generation: 11, now, lastScanAt: now - AUTO_SCAN_MIN_GAP_MS })).toBe(true);
  });

  it('without a change counter it only scans when the app comes back to the screen', () => {
    expect(shouldAutoScan({ ...base, generation: -1, lastGeneration: -1 })).toBe(false);
    expect(shouldAutoScan({ ...base, generation: -1, lastGeneration: -1, comingBack: true })).toBe(true);
  });
});
