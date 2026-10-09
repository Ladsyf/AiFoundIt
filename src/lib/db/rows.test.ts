import { describe, expect, it } from 'vitest';

import { inboxToRows } from '@/lib/db/rows';
import { demoCorpus } from '@/lib/native/mock-corpus';

describe('inboxToRows', () => {
  const corpus = demoCorpus();
  const gcash = corpus.find((f) => f.name === 'Screenshot_20261009_184522.png')!;
  const beach = corpus.find((f) => f.name === 'IMG_20260920_beach.jpg')!;
  const philhealth = corpus.find((f) => f.name === 'Screenshot_20261002_090812.png')!;

  it('categorizes the GCash screenshot as a receipt with a total', () => {
    const rows = inboxToRows(gcash);
    expect(rows.file.category).toBe('receipt');
    const total = rows.facts.find((f) => f.kind === 'total');
    expect(total && 'valueNum' in total && total.valueNum).toBe(1250);
    expect(rows.facts.find((f) => f.kind === 'merchant')).toEqual({ kind: 'merchant', valueText: 'gcash' });
  });

  it('flags the PhilHealth screenshot sensitive and categorizes it as id', () => {
    const rows = inboxToRows(philhealth);
    expect(rows.file.isSensitive).toBe(true);
    expect(rows.file.category).toBe('id');
  });

  it('adds a labels text chunk for photos with no extracted text', () => {
    const rows = inboxToRows(beach);
    const labelChunk = rows.chunks.find((c) => c.text?.includes('beach'));
    expect(labelChunk).toBeDefined();
    expect(labelChunk!.kind).toBe('text');
  });

  it('demo corpus sanity: every item has path, kind and chunks', () => {
    for (const item of corpus) {
      expect(item.path).toMatch(/^\/storage\/emulated\/0\//);
      expect(item.chunks.length).toBeGreaterThan(0);
      expect(['image', 'pdf', 'doc', 'text', 'audio', 'video']).toContain(item.kind);
    }
    expect(corpus.length).toBeGreaterThanOrEqual(25);
  });
});
