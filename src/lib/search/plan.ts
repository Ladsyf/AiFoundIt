import { findMerchant } from '@/lib/enrich/facts';
import { sanitizeDestination } from '@/lib/intents/destination';
import type { generateText } from '@/lib/llm';
import type { FileKind } from '@/lib/native/contract';
import { contentTerms, dateRangeFor, tokenize } from '@/lib/search/tokenize';
import {
    CHITCHAT_WORDS,
    COMPUTE_WORDS,
    COUNT_WORDS,
    DESCRIBE_WORDS,
    KIND_WORDS,
    PRIVACY_WORDS,
    PRIVATE_FOLDER,
    RECEIPTS_FOLDER,
    STOPWORDS,
    TIDY_WORDS,
} from '@/lib/search/vocab';

export type Intent = 'find' | 'compute' | 'count' | 'describe' | 'organize' | 'privacy' | 'chat';

export type QueryPlan = {
  intent: Intent;
  chat?: 'greeting' | 'talk';
  queryEn: string;
  terms: string[];
  kinds?: FileKind[];
  screenshot?: boolean;
  category?: string;
  merchant?: string;
  dateFrom?: number;
  dateTo?: number;
  operation?: 'move' | 'copy';
  destination?: string;
  includeSensitive: boolean;
};

const NAME_STATEMENT =
  /^\s*(?:(?:hi|hello|hey|kumusta)[,!.\s]+)?(?:my name is|call me|i am|i'm|i’m|im|ako si|ako po si|ang pangalan ko(?: ay)?)\s+[A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,2}\s*[.!]*\s*$/i;
const ABOUT_CHAT =
  /\b(?:what(?:'s|s| is) my name|who am i|do you remember|what did i (?:say|ask|tell)|ano (?:ang )?pangalan ko|sino ako|naaalala mo)\b/i;

const ID_TERMS = new Set(['id', 'ids', 'philhealth', 'passport', 'umid', 'sss', 'tin', 'philsys', 'license']);
const QUESTION_MARKERS = new Set(['ba', 'do', 'does', 'any', 'meron', 'mayroon', 'may', 'is', 'there']);

export function heuristicPlan(query: string, today = new Date()): QueryPlan {
  const tokens = tokenize(query);
  const lower = query.toLowerCase();
  const terms = contentTerms(tokens);

  let kinds: FileKind[] | undefined;
  let screenshot = false;
  let category: string | undefined;
  for (const t of tokens) {
    const kw = KIND_WORDS[t];
    if (!kw) continue;
    if (kw.kinds) kinds = [...new Set([...(kinds ?? []), ...kw.kinds])];
    if (kw.screenshot) screenshot = true;
    if (kw.category) category = kw.category;
  }

  const range = dateRangeFor(tokens, today);
  const merchant = findMerchant(lower);
  const asksSensitive =
    [...PRIVACY_WORDS].some((w) => tokens.includes(w)) || tokens.some((t) => ID_TERMS.has(t));
  const asksExistence = tokens.some((t) => QUESTION_MARKERS.has(t));

  const spoken = tokens.filter((t) => !STOPWORDS.has(t));
  const greeting = spoken.length > 0 && spoken.every((t) => CHITCHAT_WORDS.has(t));
  const talk = !greeting && (NAME_STATEMENT.test(query) || ABOUT_CHAT.test(query));
  const chat: QueryPlan['chat'] = greeting ? 'greeting' : talk ? 'talk' : undefined;

  let intent: Intent = 'find';
  if (chat) intent = 'chat';
  else if (tokens.some((t) => COMPUTE_WORDS.has(t))) intent = 'compute';
  else if (tokens.some((t) => COUNT_WORDS.has(t))) intent = 'count';
  else if (tokens.some((t) => TIDY_WORDS.has(t))) intent = 'organize';
  else if (tokens.some((t) => DESCRIBE_WORDS.has(t))) intent = 'describe';
  else if (asksSensitive && asksExistence) intent = 'privacy';

  let destination: string | undefined;
  if (intent === 'organize') {
    if (category === 'receipt' || lower.includes('resibo')) destination = RECEIPTS_FOLDER;
    else if (asksSensitive || lower.includes('private')) destination = PRIVATE_FOLDER;
    else destination = 'Documents/Organized';
  }

  return {
    intent,
    chat,
    queryEn: query,
    terms,
    kinds,
    screenshot,
    category,
    merchant,
    dateFrom: range?.from,
    dateTo: range?.to,
    operation: intent === 'organize' ? 'move' : undefined,
    destination,
    includeSensitive: intent === 'privacy' || category === 'id' || asksSensitive,
  };
}

const PLAN_SCHEMA = `{"intent":"find|compute|count|describe|organize|privacy","queryEn":"english keywords","keywords":["..."],"kinds":["image|pdf|doc|text|audio|video"],"dateFrom":"YYYY-MM-DD|null","dateTo":"YYYY-MM-DD|null","category":"receipt|id|school|work|screenshot|meme|document|null","operation":"move|copy|null","destination":"folder path|null"}`;

const INTENTS: Intent[] = ['find', 'compute', 'count', 'describe', 'organize', 'privacy'];
const KINDS: FileKind[] = ['image', 'pdf', 'doc', 'text', 'audio', 'video'];

export function parsePlanJson(raw: string, fallback: QueryPlan): QueryPlan {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const p = JSON.parse(match[0]) as Record<string, unknown>;
    const intent = INTENTS.includes(p.intent as Intent) ? (p.intent as Intent) : fallback.intent;
    const keywords = Array.isArray(p.keywords) ? p.keywords.filter((k): k is string => typeof k === 'string') : [];
    const kinds = Array.isArray(p.kinds)
      ? p.kinds.filter((k): k is FileKind => KINDS.includes(k as FileKind))
      : fallback.kinds;
    const parseDate = (v: unknown) => {
      if (typeof v !== 'string') return undefined;
      const t = Date.parse(`${v}T00:00:00`);
      return Number.isNaN(t) ? undefined : t;
    };
    return {
      ...fallback,
      intent,
      queryEn: typeof p.queryEn === 'string' && p.queryEn.trim() ? p.queryEn : fallback.queryEn,
      terms: keywords.length > 0 ? keywords.map((k) => k.toLowerCase()) : fallback.terms,
      kinds: kinds && kinds.length > 0 ? kinds : fallback.kinds,
      category: typeof p.category === 'string' ? p.category : fallback.category,
      dateFrom: parseDate(p.dateFrom) ?? fallback.dateFrom,
      dateTo: parseDate(p.dateTo) ?? fallback.dateTo,
      operation: p.operation === 'move' || p.operation === 'copy' ? p.operation : fallback.operation,
      // The folder comes from the model, so it is cleaned up and kept inside the phone's storage.
      destination:
        typeof p.destination === 'string' ? sanitizeDestination(p.destination, fallback.destination) : fallback.destination,
      includeSensitive: fallback.includeSensitive || intent === 'privacy',
    };
  } catch {
    return fallback;
  }
}

const PLAN_PROMPT = (query: string, today: string, previous?: string) =>
  `You plan file searches on a phone. Today is ${today}. ` +
  `Read the question (English or Taglish) and reply with JSON only, matching this shape: ${PLAN_SCHEMA}\n\n` +
  `Q: Nasaan yung resibo ko sa Jollibee?\n` +
  `{"intent":"find","queryEn":"Jollibee receipt","keywords":["jollibee","receipt"],"kinds":[],"dateFrom":null,"dateTo":null,"category":"receipt","operation":null,"destination":null}\n` +
  `Q: Magkano nagastos ko sa GCash this week?\n` +
  `{"intent":"compute","queryEn":"GCash receipts","keywords":["gcash"],"kinds":[],"dateFrom":null,"dateTo":null,"category":"receipt","operation":null,"destination":null}\n` +
  `Q: Ilagay mo lahat ng resibo sa isang folder\n` +
  `{"intent":"organize","queryEn":"receipts","keywords":["receipt"],"kinds":[],"dateFrom":null,"dateTo":null,"category":"receipt","operation":"move","destination":"Documents/Receipts"}\n` +
  (previous ? `Earlier in this chat the person asked: ${previous}\n` : '') +
  `Q: ${query}\n`;

// LLM plan when a generator is given (a model is loaded) and the query is long enough to benefit;
// heuristic plan otherwise. Always resolves with a usable plan.
export async function planQuery(
  query: string,
  opts: { generate?: typeof generateText; today?: Date; previous?: string },
): Promise<QueryPlan> {
  const fallback = heuristicPlan(query, opts.today);
  if (!opts.generate || tokenize(query).length <= 3) return fallback;

  const today = (opts.today ?? new Date()).toISOString().slice(0, 10);
  const outcome = await opts.generate(
    { prompt: PLAN_PROMPT(query, today, opts.previous), maxTokens: 160, temperature: 0.1 },
    // The plan must not hold up the results: a first word within 4 s, and the whole plan within 6 s, or the
    // keyword planner is used instead.
    { timeoutMs: 4_000, totalMs: 6_000 },
  );
  if (!outcome.ok) return fallback;
  return parsePlanJson(outcome.text, fallback);
}
