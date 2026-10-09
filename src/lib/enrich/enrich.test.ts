import { describe, expect, it } from 'vitest';

import { categorize } from '@/lib/enrich/categorize';
import { extractFacts } from '@/lib/enrich/facts';
import { detectSensitive } from '@/lib/enrich/sensitive';

describe('categorize', () => {
  it('receipt from merchant + total words', () => {
    expect(
      categorize({
        name: 'Screenshot_1.png',
        folder: 'Pictures/Screenshots',
        kind: 'image',
        isScreenshot: true,
        ocrText: 'GCash\nPaid to JOLLIBEE\nAmount ₱345.00\nRef. No. 123',
        labels: ['receipt'],
      }),
    ).toBe('receipt');
  });

  it('id from ID document words', () => {
    expect(
      categorize({
        name: 'UMID_photo.jpg',
        folder: 'Documents/ID',
        kind: 'image',
        isScreenshot: false,
        ocrText: 'UMID Unified Multi-Purpose ID CRN 0112-3456789-0',
        labels: ['id card'],
      }),
    ).toBe('id');
  });

  it('school from thesis text', () => {
    expect(
      categorize({
        name: 'Thesis_Defense_Schedule.pdf',
        folder: 'Documents/School',
        kind: 'pdf',
        isScreenshot: false,
        ocrText: 'Thesis Defense Schedule — 1st Semester',
        labels: [],
      }),
    ).toBe('school');
  });

  it('screenshot only when nothing else matches', () => {
    expect(
      categorize({
        name: 'Screenshot_20261012.jpg',
        folder: 'Download',
        kind: 'image',
        isScreenshot: true,
        ocrText: '',
        labels: ['sky'],
      }),
    ).toBe('screenshot');
  });

  it('plain document fallback for pdf with text', () => {
    expect(
      categorize({
        name: 'notes.pdf',
        folder: 'Download',
        kind: 'pdf',
        isScreenshot: false,
        ocrText: 'lorem ipsum',
        labels: [],
      }),
    ).toBe('document');
  });
});

describe('extractFacts', () => {
  it('prefers the total line for the receipt total', () => {
    const facts = extractFacts('Jollibee\n1-pc Chickenjoy ₱99.00\nPie ₱48.00\nTOTAL ₱202.00');
    const total = facts.find((f) => f.kind === 'total');
    expect(total && 'valueNum' in total && total.valueNum).toBe(202);
  });

  it('uses the largest amount when no total line exists', () => {
    const facts = extractFacts('You sent ₱500.00 earlier and ₱1,250.00 now');
    const total = facts.find((f) => f.kind === 'total');
    expect(total && 'valueNum' in total && total.valueNum).toBe(1250);
  });

  it('finds the merchant', () => {
    const facts = extractFacts('Paid to JOLLIBEE - SM MAKATI\nAmount ₱345.00');
    expect(facts.find((f) => f.kind === 'merchant')).toEqual({ kind: 'merchant', valueText: 'jollibee' });
  });

  it('parses "Oct 9, 2026" dates', () => {
    const facts = extractFacts('GCash\nRef 123\nOct 9, 2026 6:45 PM');
    const date = facts.find((f) => f.kind === 'date');
    expect(date && 'valueDate' in date && new Date(date.valueDate).getMonth()).toBe(9);
  });

  it('returns nothing useful for plain prose', () => {
    expect(extractFacts('the quick brown fox').filter((f) => f.kind === 'total')).toHaveLength(0);
  });
});

describe('detectSensitive', () => {
  it('flags IDs', () => {
    expect(detectSensitive('PhilHealth Member Data Record PIN 12-345678901-2').sensitive).toBe(true);
    expect(detectSensitive('PASSPORT Republic of the Philippines').sensitive).toBe(true);
  });

  it('flags OTP and passwords', () => {
    expect(detectSensitive('Your one-time pin is 443221').sensitive).toBe(true);
    expect(detectSensitive('WPA2 key tr0pic-mango-71 password').sensitive).toBe(true);
  });

  it('does not flag receipts', () => {
    expect(detectSensitive('Jollibee TOTAL ₱202.00').sensitive).toBe(false);
  });
});
