import { describe, expect, it } from 'vitest';

import { downloadErrorCopy, formatModelSize, progressFraction, progressLabel } from '@/lib/download-view';

describe('formatModelSize', () => {
  it('matches the sizes Hugging Face shows', () => {
    expect(formatModelSize(2_588_147_712)).toBe('2.59 GB');
    expect(formatModelSize(3_659_530_240)).toBe('3.66 GB');
    expect(formatModelSize(584_417_280)).toBe('584 MB');
    expect(formatModelSize(484_622_336)).toBe('485 MB');
  });

  it('handles tiny sizes', () => {
    expect(formatModelSize(0)).toBe('1 KB');
    expect(formatModelSize(1500)).toBe('2 KB');
  });
});

describe('progress', () => {
  it('is a fraction between 0 and 1', () => {
    expect(progressFraction(50, 200)).toBe(0.25);
    expect(progressFraction(500, 200)).toBe(1);
    expect(progressFraction(10, 0)).toBe(0);
    expect(progressFraction(-5, 100)).toBe(0);
  });

  it('reads naturally', () => {
    expect(progressLabel(1_294_073_856, 2_588_147_712)).toBe('1.29 GB of 2.59 GB · 50%');
    expect(progressLabel(5_000_000, 0)).toBe('5 MB downloaded');
  });
});

describe('downloadErrorCopy', () => {
  it('asks for a Hugging Face login on an auth error', () => {
    const copy = downloadErrorCopy('AUTH');
    expect(copy.needsLogin).toBe(true);
    expect(copy.text).toContain('Hugging Face');
  });

  it('explains the other causes in plain words', () => {
    expect(downloadErrorCopy('WIFI').text).toContain('Wi-Fi');
    expect(downloadErrorCopy('SPACE').text).toContain('storage');
    expect(downloadErrorCopy('OFFLINE').text).toContain('internet');
    expect(downloadErrorCopy('NETWORK').needsLogin).toBe(false);
  });

  it('falls back to the message the phone gave', () => {
    expect(downloadErrorCopy('HTTP', 'HTTP 500').text).toBe('HTTP 500');
    expect(downloadErrorCopy(undefined, null).text).toBe('The download failed.');
  });
});
