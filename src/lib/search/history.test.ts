import { describe, expect, it } from 'vitest';

import type { AssistantMessage, Message } from '@/features/search/types';
import { recentTurns, renderTurns } from '@/lib/search/history';

const person = (id: string, text: string): Message => ({ id, role: 'user', text });
const assistant = (id: string, text: string, fileIds: string[] = []): AssistantMessage => ({
  id,
  role: 'assistant',
  status: 'done',
  text,
  results: fileIds.map((fileId) => ({ fileId, reason: '' })),
  partialIndex: false,
});

describe('recentTurns', () => {
  it('keeps the conversation in order as person and assistant turns', () => {
    const turns = recentTurns([person('1', 'My name is Almar'), assistant('2', 'Nice to meet you, Almar.')]);
    expect(turns).toEqual([
      { role: 'person', text: 'My name is Almar' },
      { role: 'assistant', text: 'Nice to meet you, Almar.' },
    ]);
  });

  it('keeps only the last few turns', () => {
    const messages = Array.from({ length: 10 }, (_, i) => person(String(i), `question ${i}`));
    const turns = recentTurns(messages);
    expect(turns).toHaveLength(6);
    expect(turns[0].text).toBe('question 4');
    expect(turns[5].text).toBe('question 9');
  });

  it('skips an assistant message that has no words yet', () => {
    expect(recentTurns([person('1', 'hi'), assistant('2', '  ')])).toHaveLength(1);
  });

  it('clips very long turns', () => {
    const [turn] = recentTurns([person('1', 'x'.repeat(1000))]);
    expect(turn.text.length).toBeLessThanOrEqual(240);
    expect(turn.text.endsWith('…')).toBe(true);
  });

  it('names the files an answer showed, at most three', () => {
    const [turn] = recentTurns([assistant('1', 'Found 4 receipts.', ['a', 'b', 'c', 'd'])], (m) =>
      m.results.map((r) => `${r.fileId}.jpg`),
    );
    expect(turn.text).toBe('Found 4 receipts. (files shown: a.jpg, b.jpg, c.jpg)');
  });
});

describe('renderTurns', () => {
  it('writes one labelled line per turn', () => {
    expect(
      renderTurns([
        { role: 'person', text: 'hi' },
        { role: 'assistant', text: 'Hello!' },
      ]),
    ).toBe('Person: hi\nAssistant: Hello!');
  });
});
