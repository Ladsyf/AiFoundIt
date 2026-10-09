import { describe, expect, it } from 'vitest';

import { categorize } from '@/lib/enrich/categorize';

const seed = (over: Partial<Parameters<typeof categorize>[0]>) => ({
  name: 'file',
  folder: 'Download',
  kind: 'pdf',
  isScreenshot: false,
  ocrText: '',
  labels: [],
  ...over,
});

describe('categorize word matching', () => {
  it('does not find the ID word "tin" inside "meeting"', () => {
    expect(categorize(seed({ name: 'meeting_notes.pdf', ocrText: 'Team meeting agenda and project deadline' }))).toBe('work');
  });

  it('does not find "sss" or "prc" inside longer words', () => {
    expect(categorize(seed({ ocrText: 'process the assessment' }))).toBe('document');
  });

  it('still finds a real ID word on its own', () => {
    expect(categorize(seed({ kind: 'image', ocrText: 'Republic of the Philippines TIN 123-456-789' }))).toBe('id');
  });
});
