import { MERCHANTS } from '@/lib/search/vocab';
import { indexOfWord } from '@/lib/text';

export type Fact =
  | { kind: 'total'; valueNum: number; valueText: string }
  | { kind: 'amount'; valueNum: number; valueText: string }
  | { kind: 'merchant'; valueText: string }
  | { kind: 'date'; valueDate: number; valueText: string };

// An amount after a peso sign, "PHP", or a standalone "P". "Step 3" or "tip 100" are not amounts.
// Digits are matched greedily, so "PHP 1250.00" is 1250 and not 125.
const AMOUNT_RE = /(?:₱|\bphp|\bp)\s?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/gi;
// Receipts often print "TOTAL 495.00" with no currency sign, so a total line also accepts a bare two-decimal number.
const BARE_AMOUNT_RE = /\b\d+(?:,\d{3})*\.\d{2}\b/g;

const TOTAL_LABEL =
  /\b(grand\s+total|total\s+amount|total\s+sent|amount\s+(?:due|paid|sent)|net\s+pay|total\s+fare|fare|total)\b/i;
const SUBTOTAL_LABEL = /\bsub[\s-]?total\b/i;
const DEDUCTION_LABEL = /\b(change|cash|tendered|tax|vat|discount|service\s+charge|fee|points?)\b/i;

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

export type Amount = {
  num: number;
  raw: string;
  isTotal: boolean;
  isSubtotal: boolean;
  isDeduction: boolean;
};

function classify(num: number, raw: string, label: string): Amount {
  const isSubtotal = SUBTOTAL_LABEL.test(label);
  return {
    num,
    raw,
    isTotal: TOTAL_LABEL.test(label) && !isSubtotal,
    isSubtotal,
    isDeduction: DEDUCTION_LABEL.test(label),
  };
}

/** Every amount in the text, tagged by the words in front of it ("Total", "Subtotal", "Cash", "Change"). */
export function parseAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  let previousLine = '';
  for (const line of text.split('\n')) {
    let found = false;
    let prevEnd = 0;
    AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AMOUNT_RE.exec(line))) {
      found = true;
      const num = Number(m[1].replace(/,/g, ''));
      // The label is what precedes the amount on its line; for "Total" on one line and "P495.00" on the next, the line above.
      const before = line.slice(prevEnd, m.index).trim();
      const label = before || previousLine;
      prevEnd = m.index + m[0].length;
      if (Number.isFinite(num) && num > 0) out.push(classify(num, m[0].trim(), label));
    }
    if (!found && TOTAL_LABEL.test(line)) {
      BARE_AMOUNT_RE.lastIndex = 0;
      while ((m = BARE_AMOUNT_RE.exec(line))) {
        const num = Number(m[0].replace(/,/g, ''));
        if (Number.isFinite(num) && num > 0) out.push(classify(num, m[0], line.slice(0, m.index)));
      }
    }
    previousLine = found ? '' : line.trim();
  }
  return out;
}

/**
 * The receipt total: the last "Total" line (never "Subtotal"). With no such line, the largest amount that
 * is not cash, change, tax or a discount.
 */
export function pickTotal(amounts: Amount[]): Amount | null {
  const totals = amounts.filter((a) => a.isTotal);
  if (totals.length > 0) return totals[totals.length - 1];
  const usable = amounts.filter((a) => !a.isDeduction);
  const pool = usable.length > 0 ? usable : amounts;
  return pool.reduce<Amount | null>((best, a) => (best === null || a.num > best.num ? a : best), null);
}

/** The first known merchant to appear in the text, matched as a whole word ("sm" is not in "items"). */
export function findMerchant(text: string): string | undefined {
  const hay = text.toLowerCase();
  let best: { merchant: string; at: number } | undefined;
  for (const merchant of MERCHANTS) {
    const at = indexOfWord(hay, merchant);
    if (at >= 0 && (!best || at < best.at)) best = { merchant, at };
  }
  return best?.merchant;
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

  const merchant = findMerchant(`${text}\n${fileName}`);
  if (merchant) facts.push({ kind: 'merchant', valueText: merchant });

  const amounts = parseAmounts(text);
  const total = pickTotal(amounts);
  if (total) facts.push({ kind: 'total', valueNum: total.num, valueText: total.raw });
  for (const a of amounts.filter((a) => a !== total)) {
    facts.push({ kind: 'amount', valueNum: a.num, valueText: a.raw });
  }

  for (const d of parseDates(text).slice(0, 4)) {
    facts.push({ kind: 'date', valueDate: d.epoch, valueText: d.raw });
  }
  return facts;
}
