import type { QueryPlan } from '@/lib/search/plan';
import { tokenize } from '@/lib/search/tokenize';
import { FOLLOW_UP_WORDS } from '@/lib/search/vocab';

export function withFollowUp(plan: QueryPlan, previous: QueryPlan | undefined, query: string): QueryPlan {
  if (!previous || plan.intent !== 'find' || previous.intent !== 'find') return plan;
  if (plan.terms.length > 0) return plan;
  const dateOnly = plan.dateFrom !== undefined && !plan.kinds && !plan.category && !plan.screenshot;
  const refines = dateOnly || tokenize(query).some((t) => FOLLOW_UP_WORDS.has(t));
  if (!refines) return plan;
  return {
    ...plan,
    queryEn: previous.queryEn,
    terms: previous.terms,
    kinds: plan.kinds ?? previous.kinds,
    screenshot: plan.screenshot || previous.screenshot,
    category: plan.category ?? previous.category,
    merchant: plan.merchant ?? previous.merchant,
    dateFrom: plan.dateFrom ?? previous.dateFrom,
    dateTo: plan.dateTo ?? previous.dateTo,
    includeSensitive: plan.includeSensitive || previous.includeSensitive,
  };
}
