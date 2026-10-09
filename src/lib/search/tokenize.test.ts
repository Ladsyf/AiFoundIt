import { describe, expect, it } from 'vitest';

import { buildFtsQuery, contentTerms, dateRangeFor, tokenize } from '@/lib/search/tokenize';

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Where is my Jollibee receipt?')).toEqual(['where', 'is', 'my', 'jollibee', 'receipt']);
  });

  it('normalizes wi-fi variants to wifi', () => {
    expect(tokenize('the Wi-Fi password')).toContain('wifi');
    expect(tokenize('wifi password')).toContain('wifi');
  });

  it('keeps Tagalog words', () => {
    expect(tokenize('Nasaan yung resibo ko?')).toEqual(['nasaan', 'yung', 'resibo', 'ko']);
  });
});

describe('contentTerms', () => {
  it('drops English and Tagalog stopwords, kind words and months', () => {
    expect(contentTerms(tokenize('Nasaan yung resibo ko sa Jollibee?'))).toEqual(['jollibee']);
    expect(contentTerms(tokenize('the screenshot from september'))).toEqual([]);
    expect(contentTerms(tokenize('PDF about thesis defense schedule'))).toEqual([
      'thesis',
      'defense',
      'schedule',
    ]);
  });
});

describe('buildFtsQuery', () => {
  it('adds prefix wildcard to terms of 3+ chars', () => {
    expect(buildFtsQuery(['jollibee', 'id'])).toBe('jollibee* OR id');
  });

  it('strips non-alphanumerics for FTS safety', () => {
    expect(buildFtsQuery(['a";DROP'])).toBe('adrop*');
  });

  it('returns empty string for no terms', () => {
    expect(buildFtsQuery([])).toBe('');
  });
});

describe('dateRangeFor', () => {
  const today = new Date('2026-10-10T15:00:00'); // Saturday

  it('this week starts Monday', () => {
    const r = dateRangeFor(tokenize('receipts this week'), today)!;
    expect(new Date(r.from).getDay()).toBe(1);
    expect(r.to - r.from).toBeGreaterThan(5 * 86_400_000);
  });

  it('last week is the previous Monday-to-Monday', () => {
    const r = dateRangeFor(tokenize('last week'), today)!;
    expect(new Date(r.from).getDay()).toBe(1);
    expect(new Date(r.to).getDay()).toBe(1);
    expect(r.to - r.from).toBe(7 * 86_400_000);
  });

  it('kahapon is yesterday', () => {
    const r = dateRangeFor(tokenize('kahapon'), today)!;
    expect(new Date(r.from).getDate()).toBe(9);
    expect(r.to - r.from).toBe(86_400_000);
  });

  it('named month resolves to this year', () => {
    const r = dateRangeFor(tokenize('receipts from september'), today)!;
    const d = new Date(r.from);
    expect(d.getMonth()).toBe(8);
    expect(d.getFullYear()).toBe(2026);
  });

  it('returns null without a date phrase', () => {
    expect(dateRangeFor(tokenize('jollibee receipt'), today)).toBeNull();
  });
});
