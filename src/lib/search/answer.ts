import { formatDate } from '@/lib/format';
import { generateText } from '@/lib/llm';
import type { QueryPlan } from '@/lib/search/plan';
import type { RetrievedFile } from '@/lib/search/retrieve';

const KIND_LABEL: Record<string, [string, string]> = {
  image: ['photo', 'photos'],
  pdf: ['PDF', 'PDFs'],
  doc: ['document', 'documents'],
  text: ['text file', 'text files'],
  audio: ['recording', 'recordings'],
  video: ['video', 'videos'],
};

export function templatedAnswer(plan: QueryPlan, results: RetrievedFile[]): string {
  if (results.length === 0) {
    return 'I couldn’t find a file that matches. Try a word you remember from it, or roughly when you saved it.';
  }
  const items = results.map((r) => r.item);
  const kinds = new Set(items.map((f) => f.category ?? f.kind));
  const labelKey = [...kinds][0] as keyof typeof KIND_LABEL;
  const [one, many] =
    kinds.size === 1 ? (KIND_LABEL[labelKey] ?? [String(labelKey), `${String(labelKey)}s`]) : ['file', 'files'];
  if (items.length === 1) return `Found 1 ${plan.category ?? one}. It’s in ${items[0].folder}.`;
  return `Found ${items.length} ${plan.category && kinds.size === 1 ? `${plan.category}s` : many}. The best match is from ${formatDate(items[0].savedAt)}.`;
}

const SYSTEM =
  'You answer questions about files on the user’s phone, on-device. ' +
  'Use only the numbered results below — never invent a file or a fact. ' +
  'Answer in 1–3 short sentences, in the same language as the question (Taglish is fine). ' +
  'Point to results with [1], [2].';

export function answerPrompt(query: string, results: RetrievedFile[]): string {
  const numbered = results
    .slice(0, 5)
    .map((r, i) => {
      const f = r.item;
      const snippet = (f.snippet ?? f.tags.join(', ') ?? '').slice(0, 300);
      return `[${i + 1}] ${f.name} — ${f.folder}, ${formatDate(f.savedAt, true)}. ${snippet}`;
    })
    .join('\n');
  return `${SYSTEM}\n\nResults:\n${numbered}\n\nQuestion: ${query}\nAnswer:`;
}

// Streams the grounded answer sentence. Calls onToken with the accumulated
// text. Returns null when no LLM is available or generation fails — the caller
// then falls back to templatedAnswer.
export async function streamAnswer(
  query: string,
  results: RetrievedFile[],
  opts: { llmAvailable: boolean; onToken?: (text: string) => void } = { llmAvailable: false },
): Promise<string | null> {
  if (!opts.llmAvailable || results.length === 0) return null;
  const outcome = await generateText(
    { prompt: answerPrompt(query, results), maxTokens: 140, temperature: 0.3 },
    { timeoutMs: 20_000, onToken: opts.onToken },
  );
  if (!outcome.ok || !outcome.text.trim()) return null;
  return outcome.text.trim();
}
