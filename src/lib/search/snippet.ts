export type Snippet = { text: string; ranges: [number, number][] };

const RADIUS = 110;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cuts a window of text around the densest cluster of term hits and returns
// highlight ranges relative to the clipped snippet. Pure — unit tested.
export function makeSnippet(text: string, terms: string[], radius = RADIUS): Snippet {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { text: '', ranges: [] };
  const usable = terms.filter((t) => t.length >= 2).map(escapeRe);
  if (usable.length === 0) {
    return { text: clean.length > radius * 2 ? `${clean.slice(0, radius * 2)}…` : clean, ranges: [] };
  }

  const re = new RegExp(usable.join('|'), 'gi');
  const hits: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) && hits.length < 60) hits.push([m.index, m.index + m[0].length]);
  if (hits.length === 0) {
    return { text: clean.length > radius * 2 ? `${clean.slice(0, radius * 2)}…` : clean, ranges: [] };
  }

  // Pick the window start that covers the most hits.
  let bestStart = 0;
  let bestCount = -1;
  for (const [s] of hits) {
    const start = Math.max(0, s - radius);
    const end = Math.min(clean.length, start + radius * 2);
    const count = hits.filter(([a, b]) => a < end && b > start).length;
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  const start = bestStart;
  const end = Math.min(clean.length, start + radius * 2);

  const clipped = clean.slice(start, end);
  const ranges = hits
    .filter(([a, b]) => a < end && b > start)
    .map(([a, b]): [number, number] => [Math.max(0, a - start), Math.min(clipped.length, b - start)]);

  return {
    text: `${start > 0 ? '…' : ''}${clipped}${end < clean.length ? '…' : ''}`,
    ranges: ranges.map(([a, b]): [number, number] => [a + (start > 0 ? 1 : 0), b + (start > 0 ? 1 : 0)]),
  };
}
