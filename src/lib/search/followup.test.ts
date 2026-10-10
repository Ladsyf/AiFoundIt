import { describe, expect, it } from 'vitest';

import { withFollowUp } from '@/lib/search/followup';
import { heuristicPlan } from '@/lib/search/plan';

const today = new Date('2026-10-10T12:00:00');
const plan = (query: string) => heuristicPlan(query, today);
const jollibee = plan('Nasaan yung resibo ko sa Jollibee?');

describe('withFollowUp', () => {
  it('keeps the topic when the next message only adds a date', () => {
    const next = withFollowUp(plan('this week?'), jollibee, 'this week?');
    expect(next.terms).toEqual(['jollibee']);
    expect(next.category).toBe('receipt');
    expect(next.dateFrom).toBeTypeOf('number');
  });

  it('keeps the topic when the next message narrows by kind with a cue word', () => {
    const next = withFollowUp(plan('only the PDF'), jollibee, 'only the PDF');
    expect(next.terms).toEqual(['jollibee']);
    expect(next.kinds).toEqual(['pdf']);
  });

  it('does not carry a topic into a message that has its own', () => {
    const next = withFollowUp(plan('beach photo'), jollibee, 'beach photo');
    expect(next.terms).toEqual(['beach']);
  });

  it('treats a bare kind word as a new search, not a follow-up', () => {
    const next = withFollowUp(plan('screenshots'), jollibee, 'screenshots');
    expect(next.terms).toEqual([]);
    expect(next.category).toBeUndefined();
  });

  it('treats a dated browse of one kind as a new search', () => {
    const next = withFollowUp(plan('photos from last week'), jollibee, 'photos from last week');
    expect(next.terms).toEqual([]);
  });

  it('does nothing without an earlier search or after a non-search turn', () => {
    const asked = plan('this week?');
    expect(withFollowUp(asked, undefined, 'this week?')).toBe(asked);
    expect(withFollowUp(asked, plan('Hi'), 'this week?')).toBe(asked);
  });
});
