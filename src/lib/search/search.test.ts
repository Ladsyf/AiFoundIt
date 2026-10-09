import { describe, expect, it } from 'vitest';

import { heuristicPlan, parsePlanJson } from '@/lib/search/plan';
import { rrfByFile } from '@/lib/search/rrf';
import { makeSnippet } from '@/lib/search/snippet';
import { cosineSimilarity, hashEmbed } from '@/lib/vector';

describe('heuristicPlan', () => {
  it('Taglish find query keeps the merchant as the content term', () => {
    const plan = heuristicPlan('Nasaan yung resibo ko sa Jollibee?');
    expect(plan.intent).toBe('find');
    expect(plan.terms).toEqual(['jollibee']);
    expect(plan.merchant).toBe('jollibee');
  });

  it('compute intent with merchant and week range', () => {
    const plan = heuristicPlan('Magkano nagastos ko sa GCash this week?');
    expect(plan.intent).toBe('compute');
    expect(plan.merchant).toBe('gcash');
    expect(plan.dateFrom).toBeTypeOf('number');
  });

  it('organize Taglish → move to Receipts', () => {
    const plan = heuristicPlan('Ilagay mo lahat ng resibo sa isang folder');
    expect(plan.intent).toBe('organize');
    expect(plan.destination).toBe('Documents/Receipts');
    expect(plan.operation).toBe('move');
  });

  it('screenshot queries filter images + screenshot flag', () => {
    const plan = heuristicPlan('wifi password screenshot');
    expect(plan.kinds).toContain('image');
    expect(plan.screenshot).toBe(true);
    expect(plan.terms).toEqual(['wifi', 'password']);
  });

  it('ID questions include sensitive files', () => {
    const plan = heuristicPlan('my PhilHealth ID photo');
    expect(plan.includeSensitive).toBe(true);
  });

  it('existence question about IDs is the privacy intent', () => {
    const plan = heuristicPlan('May picture ba ako ng ID ko?');
    expect(plan.intent).toBe('privacy');
    expect(plan.includeSensitive).toBe(true);
  });
});

describe('parsePlanJson', () => {
  const fallback = heuristicPlan('find my passport');

  it('parses clean JSON', () => {
    const plan = parsePlanJson(
      '{"intent":"find","queryEn":"passport scan","keywords":["passport"],"kinds":["pdf"],"dateFrom":null,"dateTo":null,"category":"id","operation":null,"destination":null}',
      fallback,
    );
    expect(plan.terms).toEqual(['passport']);
    expect(plan.kinds).toEqual(['pdf']);
  });

  it('tolerates fences and prose around the JSON', () => {
    const plan = parsePlanJson('Sure! ```json\n{"intent":"count","keywords":[]}\n```', fallback);
    expect(plan.intent).toBe('count');
  });

  it('falls back on garbage', () => {
    expect(parsePlanJson('not json at all', fallback).intent).toBe(fallback.intent);
    expect(parsePlanJson('{broken', fallback).intent).toBe(fallback.intent);
  });
});

describe('rrfByFile', () => {
  it('sums reciprocal ranks across lists', () => {
    const fused = rrfByFile(
      [
        [{ chunkId: 1, fileId: 10, rank: 1 }],
        [{ chunkId: 2, fileId: 10, rank: 3 }],
      ],
      60,
    );
    expect(fused.get(10)!.score).toBeCloseTo(1 / 61 + 1 / 63);
    expect(fused.get(10)!.bestChunkId).toBe(1);
  });

  it('files in both lists beat files in one', () => {
    const fused = rrfByFile([
      [
        { chunkId: 1, fileId: 10, rank: 1 },
        { chunkId: 2, fileId: 11, rank: 2 },
      ],
      [{ chunkId: 3, fileId: 10, rank: 5 }],
    ]);
    expect(fused.get(10)!.score).toBeGreaterThan(fused.get(11)!.score);
  });
});

describe('makeSnippet', () => {
  it('windows around the match and reports highlight ranges', () => {
    const text = 'x'.repeat(300) + ' the wifi password is here ' + 'y'.repeat(300);
    const s = makeSnippet(text, ['wifi', 'password']);
    expect(s.text).toContain('wifi');
    expect(s.ranges.length).toBeGreaterThan(0);
    for (const [a, b] of s.ranges) {
      expect(s.text.slice(a, b).toLowerCase()).toMatch(/wifi|password/);
    }
  });

  it('no terms → plain truncation, no ranges', () => {
    const s = makeSnippet('hello world '.repeat(50), []);
    expect(s.ranges).toHaveLength(0);
    expect(s.text.length).toBeLessThanOrEqual(300);
  });
});

describe('hashEmbed', () => {
  it('is deterministic and normalized', () => {
    const a = hashEmbed('jollibee receipt total');
    const b = hashEmbed('jollibee receipt total');
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 4);
  });

  it('related texts score above unrelated ones', () => {
    const q = hashEmbed('beach photo');
    const beach = hashEmbed('IMG_20260920_beach.jpg beach ocean sky sand');
    const receipt = hashEmbed('GCash Paid to JOLLIBEE Amount Ref No');
    expect(cosineSimilarity(q, beach)).toBeGreaterThan(cosineSimilarity(q, receipt));
  });
});
