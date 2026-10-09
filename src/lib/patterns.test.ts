import { describe, expect, it } from 'vitest';

import { normalizeExcludePattern, normalizeScanRoot, validateExcludePattern } from '@/lib/patterns';

describe('validateExcludePattern', () => {
  it('accepts plain folder names', () => {
    expect(validateExcludePattern('private')).toBeNull();
    expect(validateExcludePattern('WhatsApp/Media')).toBeNull();
  });

  it('accepts real regex patterns', () => {
    expect(validateExcludePattern('private|bank')).toBeNull();
    expect(validateExcludePattern('^whatsapp/')).toBeNull();
    expect(validateExcludePattern('\\.statuses')).toBeNull();
    expect(validateExcludePattern('(screenshots|captures)/.*')).toBeNull();
  });

  it('rejects invalid patterns with a readable error', () => {
    expect(validateExcludePattern('[unclosed')).toMatch(/not a valid pattern/i);
    expect(validateExcludePattern('(unclosed')).toMatch(/not a valid pattern/i);
    expect(validateExcludePattern('a\\')).toMatch(/not a valid pattern/i);
  });

  it('rejects empty and oversized input', () => {
    expect(validateExcludePattern('   ')).toBeTruthy();
    expect(validateExcludePattern('a'.repeat(201))).toBeTruthy();
  });
});

describe('normalizers', () => {
  it('strips slashes and whitespace from exclude patterns', () => {
    expect(normalizeExcludePattern('  /private/ ')).toBe('private');
    expect(normalizeExcludePattern('/Android/data/')).toBe('Android/data');
  });

  it('normalizes scan roots to forward-slash relative paths', () => {
    expect(normalizeScanRoot('\\WhatsApp\\Media\\')).toBe('WhatsApp/Media');
    expect(normalizeScanRoot('  /DCIM/Camera ')).toBe('DCIM/Camera');
  });
});
