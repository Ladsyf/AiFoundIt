import { DATE_WORDS, KIND_WORDS, MONTHS, STOPWORDS } from '@/lib/search/vocab';

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/wi-?fi/g, 'wifi')
    .replace(/₱\s?/g, ' php ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function contentTerms(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t) && !KIND_WORDS[t] && !MONTHS.includes(t) && !DATE_WORDS.has(t));
}

export type DateRange = { from: number; to: number };

const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dateRangeFor(tokens: string[], today = new Date()): DateRange | null {
  const joined = tokens.join(' ');
  const day0 = startOfDay(today);

  if (joined.includes('last week')) {
    const dow = (today.getDay() + 6) % 7;
    const thisMonday = day0 - dow * DAY_MS;
    return { from: thisMonday - 7 * DAY_MS, to: thisMonday };
  }
  if (joined.includes('this week')) {
    const dow = (today.getDay() + 6) % 7;
    return { from: day0 - dow * DAY_MS, to: day0 + DAY_MS };
  }
  if (tokens.includes('kahapon') || joined.includes('yesterday')) {
    return { from: day0 - DAY_MS, to: day0 };
  }
  if (tokens.includes('ngayon') || joined.includes('today')) {
    return { from: day0, to: day0 + DAY_MS };
  }
  if (joined.includes('last month')) {
    return {
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime(),
      to: new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
    };
  }
  if (joined.includes('this month')) {
    return {
      from: new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
      to: new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime(),
    };
  }
  const named = MONTHS.findIndex((m) => tokens.includes(m));
  if (named >= 0) {
    const year = named > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear();
    return {
      from: new Date(year, named, 1).getTime(),
      to: new Date(year, named + 1, 1).getTime(),
    };
  }
  return null;
}

export function escapeFtsTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export function buildFtsQuery(terms: string[]): string {
  return terms
    .map(escapeFtsTerm)
    .filter(Boolean)
    .map((t) => (t.length >= 3 ? `${t}*` : t))
    .join(' OR ');
}
