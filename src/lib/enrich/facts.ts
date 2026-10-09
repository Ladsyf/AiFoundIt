import { MERCHANTS } from '@/lib/search/vocab';

export type Fact =
  | { kind: 'total'; valueNum: number; valueText: string }
  | { kind: 'amount'; valueNum: number; valueText: string }
  | { kind: 'merchant'; valueText: string }
  | { kind: 'date'; valueDate: number; valueText: string };

const AMOUNT_RE = /(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})/gi;
const TOTAL_LINE_RE = /(total|amount due|amount paid|grand total|amount sent|total amount|fare|net pay)\b/i;

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const DATE_RES = [
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
];

function parseAmounts(text: string): { num: number; raw: string; onTotalLine: boolean }[] {
  const out: { num: number; raw: string; onTotalLine: boolean }[] = [];
  for (const line of text.split('\n')) {
    const onTotalLine = TOTAL_LINE_RE.test(line);
    AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AMOUNT_RE.exec(line))) {
      const num = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(num) && num > 0) out.push({ num, raw: m[0].trim(), onTotalLine });
    }
  }
  return out;
}

function parseDates(text: string): { epoch: number; raw: string }[] {
  const out: { epoch: number; raw: string }[] = [];
  for (const re of DATE_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      let date: Date | null = null;
      if (re === DATE_RES[0]) date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      else if (re === DATE_RES[1]) date = new Date(Number(m[3]), MONTH_LOOKUP[m[1].toLowerCase()] ?? 0, Number(m[2]));
      else date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
      if (date && !Number.isNaN(date.getTime())) out.push({ epoch: date.getTime(), raw: m[0] });
    }
  }
  return out;
}

export function extractFacts(text: string, fileName = ''): Fact[] {
  const facts: Fact[] = [];
  const haystack = `${text}\n${fileName}`.toLowerCase();

  const merchant = MERCHANTS.find((m) => haystack.includes(m));
  if (merchant) facts.push({ kind: 'merchant', valueText: merchant });

  const amounts = parseAmounts(text);
  const total = amounts.find((a) => a.onTotalLine) ?? amounts.reduce<{ num: number; raw: string } | null>(
    (best, a) => (best === null || a.num > best.num ? a : best),
    null,
  );
  if (total) facts.push({ kind: 'total', valueNum: total.num, valueText: total.raw });
  for (const a of amounts.filter((a) => a !== total)) {
    facts.push({ kind: 'amount', valueNum: a.num, valueText: a.raw });
  }

  for (const d of parseDates(text).slice(0, 4)) {
    facts.push({ kind: 'date', valueDate: d.epoch, valueText: d.raw });
  }
  return facts;
}
