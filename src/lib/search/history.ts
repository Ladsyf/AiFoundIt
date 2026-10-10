import type { AssistantMessage, Message } from '@/features/search/types';

export type Turn = { role: 'person' | 'assistant'; text: string };

const MAX_TURNS = 6;
const MAX_CHARS = 240;
const MAX_FILES = 3;

const clip = (text: string) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1).trimEnd()}…` : text);

export function recentTurns(
  messages: Message[],
  fileNames: (message: AssistantMessage) => string[] = () => [],
): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ role: 'person', text: clip(m.text) });
      continue;
    }
    const text = m.text.trim();
    if (!text) continue;
    const files = fileNames(m).slice(0, MAX_FILES);
    turns.push({ role: 'assistant', text: clip(files.length > 0 ? `${text} (files shown: ${files.join(', ')})` : text) });
  }
  return turns.slice(-MAX_TURNS);
}

export function renderTurns(turns: Turn[]): string {
  return turns.map((t) => `${t.role === 'person' ? 'Person' : 'Assistant'}: ${t.text}`).join('\n');
}
