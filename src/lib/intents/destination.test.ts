import { describe, expect, it } from 'vitest';

import { DEFAULT_ORGANIZE_FOLDER, sanitizeDestination } from '@/lib/intents/destination';

describe('sanitizeDestination', () => {
  it('keeps a normal folder path', () => {
    expect(sanitizeDestination('Documents/Receipts')).toBe('Documents/Receipts');
  });

  it('turns a full storage path into a path from the storage root', () => {
    expect(sanitizeDestination('/storage/emulated/0/Documents/Receipts')).toBe('Documents/Receipts');
  });

  it('refuses to climb out of storage', () => {
    expect(sanitizeDestination('../../data/app')).toBe(DEFAULT_ORGANIZE_FOLDER);
    expect(sanitizeDestination('Documents/../../x')).toBe(DEFAULT_ORGANIZE_FOLDER);
  });

  it('refuses another app’s folder', () => {
    expect(sanitizeDestination('Android/data/com.other.app')).toBe(DEFAULT_ORGANIZE_FOLDER);
  });

  it('drops characters Android does not allow in a name', () => {
    expect(sanitizeDestination('Docs/What?/<Bills>')).toBe('Docs/What/Bills');
  });

  it('falls back when there is nothing usable', () => {
    expect(sanitizeDestination('')).toBe(DEFAULT_ORGANIZE_FOLDER);
    expect(sanitizeDestination(null)).toBe(DEFAULT_ORGANIZE_FOLDER);
    expect(sanitizeDestination('   //  ', 'Custom')).toBe('Custom');
  });

  it('limits how deep a folder can go', () => {
    expect(sanitizeDestination('a/b/c/d/e/f')).toBe('a/b/c/d');
  });
});
