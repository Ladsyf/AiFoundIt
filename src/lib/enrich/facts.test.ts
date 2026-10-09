import { describe, expect, it } from 'vitest';

import { extractFacts, findMerchant, parseAmounts, pickTotal } from '@/lib/enrich/facts';

const totalOf = (text: string) => {
  const fact = extractFacts(text).find((f) => f.kind === 'total');
  return fact && 'valueNum' in fact ? fact.valueNum : undefined;
};

describe('amounts', () => {
  it('reads a whole amount without cutting it short', () => {
    expect(totalOf('Total PHP 1250.00')).toBe(1250);
    expect(totalOf('Total ₱1,250.00')).toBe(1250);
    expect(totalOf('TOTAL P1250')).toBe(1250);
  });

  it('reads a total printed without a currency sign', () => {
    expect(totalOf('Jollibee\nChickenjoy 99.00\nTOTAL 495.00')).toBe(495);
  });

  it('does not treat a step number or a word as money', () => {
    expect(parseAmounts('Step 3 of 5\nTip 100 for the rider')).toEqual([]);
  });

  it('keeps the thousands separator out of the number', () => {
    expect(parseAmounts('Amount due ₱12,345.67')[0].num).toBe(12345.67);
  });
});

describe('receipt total', () => {
  it('never mistakes the subtotal for the total', () => {
    expect(totalOf('Subtotal ₱300.00\nService charge ₱30.00\nTOTAL ₱330.00')).toBe(330);
    expect(totalOf('Sub-total ₱300.00\nGrand total ₱330.00')).toBe(330);
  });

  it('takes the last total line when a receipt prints two', () => {
    expect(totalOf('Total ₱100.00\nTotal ₱120.00')).toBe(120);
  });

  it('reads a total that sits on the line under its label', () => {
    expect(totalOf('Total\n₱495.00')).toBe(495);
  });

  it('skips cash and change when there is no total line', () => {
    const amounts = parseAmounts('Item ₱180.00\nCash ₱500.00\nChange ₱320.00');
    expect(pickTotal(amounts)?.num).toBe(180);
  });

  it('returns nothing for text without money', () => {
    expect(pickTotal(parseAmounts('see you at the meeting'))).toBeNull();
  });
});

describe('merchant', () => {
  it('finds a known merchant', () => {
    expect(findMerchant('JOLLIBEE Katipunan\nTOTAL 202.00')).toBe('jollibee');
  });

  it('matches whole words only', () => {
    expect(findMerchant('3 items purchased, no smoking')).toBeUndefined();
    expect(findMerchant('Paid at SM Megamall')).toBe('sm');
  });

  it('uses the one that appears first', () => {
    expect(findMerchant('Sent via GCash to Jollibee')).toBe('gcash');
  });
});
