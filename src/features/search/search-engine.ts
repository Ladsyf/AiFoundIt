import type { FileItem, FileKind, MoveProposal, SearchResult } from '@/features/search/types';

const STOPWORDS = new Set(
  'a an the with my of from for that this in on to i me find show where is was it and some any all file files please can you get me have had one'.split(
    ' ',
  ),
);

const KIND_WORDS: Record<string, FileKind> = {
  screenshot: 'screenshot',
  screenshots: 'screenshot',
  receipt: 'receipt',
  receipts: 'receipt',
  photo: 'photo',
  photos: 'photo',
  picture: 'photo',
  pictures: 'photo',
  pdf: 'document',
  document: 'document',
  documents: 'document',
  scan: 'document',
};

const TIDY_WORDS = new Set(['tidy', 'organize', 'organise', 'clean', 'sort', 'declutter']);

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const KIND_LABEL: Record<FileKind, [string, string]> = {
  screenshot: ['screenshot', 'screenshots'],
  receipt: ['receipt', 'receipts'],
  document: ['document', 'documents'],
  photo: ['photo', 'photos'],
};

export const RECEIPTS_FOLDER = 'Documents/Receipts';

export type SearchOutcome = {
  text: string;
  results: SearchResult[];
  proposal?: MoveProposal;
};

export function formatDate(iso: string, withYear = false) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .replace(/wi-?fi/g, 'wifi')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function monthFilter(tokens: string[], today: Date) {
  const joined = tokens.join(' ');
  if (joined.includes('last month')) {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  if (joined.includes('this month')) return { year: today.getFullYear(), month: today.getMonth() };
  const named = MONTHS.findIndex((m) => tokens.includes(m));
  return named >= 0 ? { year: today.getFullYear(), month: named } : null;
}

function previewText(file: FileItem): string[] {
  const p = file.preview;
  switch (p.kind) {
    case 'screenshot':
      return [p.title, ...p.rows.map(([k, v]) => `${k}: ${v}`)];
    case 'receipt':
      return [p.merchant, ...p.items.map(([k, v]) => `${k} ${v}`), `Total ${p.total}`];
    case 'document':
      return [p.title, ...p.lines];
    case 'photo':
      return [p.subject];
  }
}

function scoreFile(file: FileItem, terms: string[]) {
  const lines = previewText(file).map((text) => ({
    text,
    normalized: text.toLowerCase().replace(/wi-?fi/g, 'wifi'),
  }));
  let score = 0;
  let fallback: string | null = null;

  for (const term of terms) {
    if (lines.some((l) => l.normalized.includes(term))) {
      score += 3;
    } else if (file.tags.includes(term)) {
      score += 2;
      fallback ??= `Tagged on this phone as “${term}”`;
    } else if (file.name.toLowerCase().includes(term) || file.folder.toLowerCase().includes(term)) {
      score += 1;
      fallback ??= `Name or folder contains “${term}”`;
    }
  }

  const bestLine = lines
    .map((l) => ({ ...l, hits: terms.filter((t) => l.normalized.includes(t)).length }))
    .filter((l) => l.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.text.length - a.text.length)[0];

  const reason = bestLine
    ? file.kind === 'photo'
      ? `Recognized in the photo: ${bestLine.text}`
      : `Text in the ${KIND_LABEL[file.kind][0]}: “${bestLine.text}”`
    : fallback;

  return { score, reason };
}

function describe(results: FileItem[]) {
  const kinds = new Set(results.map((f) => f.kind));
  const [one, many] = kinds.size === 1 ? KIND_LABEL[results[0].kind] : ['file', 'files'];
  if (results.length === 1) return `Found 1 ${one}. It’s in ${results[0].folder}.`;
  return `Found ${results.length} ${many}. The best match is from ${formatDate(results[0].savedAt)}.`;
}

export function search(query: string, files: FileItem[], today = new Date()): SearchOutcome {
  const tokens = tokenize(query);

  if (tokens.some((t) => TIDY_WORDS.has(t))) {
    const loose = files.filter((f) => f.kind === 'receipt' && f.folder === 'Download');
    if (loose.length === 0) {
      return { text: 'Your Download folder has no loose receipts left to tidy.', results: [] };
    }
    return {
      text: `${loose.length} receipts are sitting in Download. I can move them into ${RECEIPTS_FOLDER} so they’re easier to find.`,
      results: [],
      proposal: { fileIds: loose.map((f) => f.id), from: 'Download', to: RECEIPTS_FOLDER, state: 'pending' },
    };
  }

  const kind = tokens.map((t) => KIND_WORDS[t]).find(Boolean);
  const month = monthFilter(tokens, today);
  const terms = tokens.filter(
    (t) => !STOPWORDS.has(t) && !KIND_WORDS[t] && !MONTHS.includes(t) && t !== 'last' && t !== 'month',
  );

  const matches = files
    .filter((f) => !kind || f.kind === kind)
    .filter((f) => {
      if (!month) return true;
      const d = new Date(`${f.savedAt}T12:00:00`);
      return d.getFullYear() === month.year && d.getMonth() === month.month;
    })
    .map((file) => ({ file, ...scoreFile(file, terms) }))
    .filter(({ score }) => (terms.length === 0 ? Boolean(kind || month) : score > 0))
    .sort((a, b) => b.score - a.score || b.file.savedAt.localeCompare(a.file.savedAt));

  if (matches.length === 0) {
    return {
      text: 'I couldn’t find a file that matches. Try a word you remember from it, or roughly when you saved it.',
      results: [],
    };
  }

  return {
    text: describe(matches.map((m) => m.file)),
    results: matches.map(({ file, reason }) => ({
      fileId: file.id,
      reason: reason ?? `Saved on ${formatDate(file.savedAt, true)}`,
    })),
  };
}
