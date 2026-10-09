import { describe, expect, it } from 'vitest';

import { isModelFileName, resolveActive, roleOf, toInstalled, type InstalledModel } from '@/lib/model-select';

const file = (name: string, partial = false) =>
  toInstalled({ name, path: '/storage/emulated/0/Android/data/com.aifoundit.app/files/models/' + name, size: 1000, partial });

describe('roleOf', () => {
  it('knows catalog models', () => {
    expect(roleOf('embeddinggemma-2-740m.litertlm')).toBe('embedder');
    expect(roleOf('gemma-4-E2B-it.litertlm')).toBe('llm');
  });

  it('guesses other files from their name', () => {
    expect(roleOf('my-embedding-model.litertlm')).toBe('embedder');
    expect(roleOf('some-chat-model.gguf')).toBe('llm');
  });
});

describe('toInstalled', () => {
  it('keeps the absolute path and tags catalog models', () => {
    const m = file('gemma-4-E2B-it.litertlm');
    expect(m.path.startsWith('/')).toBe(true);
    expect(m.path.startsWith('file:')).toBe(false);
    expect(m.catalogId).toBe('gemma-4-e2b');
  });
});

describe('resolveActive', () => {
  it('prefers the recommended chat model when nothing was chosen', () => {
    const installed: InstalledModel[] = [file('gemma3-1b-it-int4.litertlm'), file('gemma-4-E2B-it.litertlm')];
    expect(resolveActive(installed, {}).llm?.catalogId).toBe('gemma-4-e2b');
  });

  it('honours the person\'s choice while the file is there', () => {
    const installed = [file('gemma3-1b-it-int4.litertlm'), file('gemma-4-E2B-it.litertlm')];
    expect(resolveActive(installed, { llm: 'gemma3-1b-it-int4.litertlm' }).llm?.catalogId).toBe('gemma-3-1b');
  });

  it('ignores a choice whose file was deleted', () => {
    const installed = [file('gemma-4-E2B-it.litertlm')];
    expect(resolveActive(installed, { llm: 'gone.litertlm' }).llm?.catalogId).toBe('gemma-4-e2b');
  });

  it('never uses a partial download', () => {
    const installed = [file('gemma-4-E2B-it.litertlm', true), file('embeddinggemma-2-740m.litertlm', true)];
    const active = resolveActive(installed, {});
    expect(active.llm).toBeNull();
    expect(active.embedder).toBeNull();
  });

  it('keeps search and chat models apart', () => {
    const installed = [file('embeddinggemma-2-740m.litertlm'), file('gemma-4-E2B-it.litertlm')];
    const active = resolveActive(installed, {});
    expect(active.embedder?.catalogId).toBe('embeddinggemma-2');
    expect(active.llm?.catalogId).toBe('gemma-4-e2b');
  });

  it('falls back to any file of the right kind', () => {
    const installed = [file('custom-chat.gguf')];
    expect(resolveActive(installed, {}).llm?.name).toBe('custom-chat.gguf');
  });
});

describe('isModelFileName', () => {
  it('accepts model files only', () => {
    expect(isModelFileName('x.LITERTLM')).toBe(true);
    expect(isModelFileName('x.gguf')).toBe(true);
    expect(isModelFileName('holiday.jpg')).toBe(false);
  });
});

describe('resolveActive and the phone memory', () => {
  const e4b = file('gemma-4-E4B-it.litertlm');
  const sevenGb = 7.1 * 1024 ** 3;

  it('does not pick a chat model that is far too big for the phone on its own', () => {
    expect(resolveActive([e4b], {}, sevenGb).llm).toBeNull();
  });

  it('prefers a model that fits over one that does not', () => {
    const e2b = file('gemma-4-E2B-it.litertlm');
    expect(resolveActive([e4b, e2b], {}, sevenGb).llm?.catalogId).toBe('gemma-4-e2b');
  });

  it('still loads it when the person chose it, or when the phone has the memory', () => {
    expect(resolveActive([e4b], { llm: 'gemma-4-E4B-it.litertlm' }, sevenGb).llm?.catalogId).toBe('gemma-4-e4b');
    expect(resolveActive([e4b], {}, 16 * 1024 ** 3).llm?.catalogId).toBe('gemma-4-e4b');
  });

  it('has nothing to compare when the memory is unknown, so the model is allowed', () => {
    expect(resolveActive([e4b], {}).llm?.catalogId).toBe('gemma-4-e4b');
  });
});
