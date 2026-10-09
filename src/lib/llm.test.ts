import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateText } from '@/lib/llm';
import { native } from '@/lib/native';

// A tiny stand-in for the native bridge: the test decides when words arrive.
const bridge = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  return {
    listeners,
    emit(event: string, payload: unknown) {
      listeners.get(event)?.forEach((l) => (l as (p: unknown) => void)(payload));
    },
  };
});

vi.mock('@/lib/native', () => ({
  native: { generate: vi.fn(async () => {}), stopGenerate: vi.fn(async () => {}) },
  addNativeListener: (event: string, listener: (payload: never) => void) => {
    const set = bridge.listeners.get(event) ?? new Set();
    set.add(listener);
    bridge.listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  },
}));


const lastRequestId = () => {
  const calls = vi.mocked(native.generate).mock.calls;
  return calls[calls.length - 1][0];
};

const request = { prompt: 'hi', maxTokens: 10, temperature: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  bridge.listeners.clear();
  vi.mocked(native.generate).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('generateText timeouts', () => {
  it('waits for the first word, then does not cut off an answer that keeps going', async () => {
    const done = generateText(request, { timeoutMs: 45_000, idleMs: 15_000, totalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(40_000); // still reading the prompt
    const id = lastRequestId();
    bridge.emit('onToken', { requestId: id, token: 'Found ' });
    // Ten more seconds pass between words, far more than the old fixed 20 s deadline allowed in total.
    for (const word of ['the ', 'receipt ', 'in ', 'Download.']) {
      await vi.advanceTimersByTimeAsync(10_000);
      bridge.emit('onToken', { requestId: id, token: word });
    }
    bridge.emit('onGenerateDone', { requestId: id });
    expect(await done).toEqual({ ok: true, text: 'Found the receipt in Download.' });
  });

  it('gives up when no first word arrives in time', async () => {
    const done = generateText(request, { timeoutMs: 4_000 });
    await vi.advanceTimersByTimeAsync(4_001);
    expect(await done).toEqual({ ok: false, error: 'timeout' });
  });

  it('returns what was written when the model goes quiet', async () => {
    const done = generateText(request, { timeoutMs: 4_000, idleMs: 5_000 });
    bridge.emit('onToken', { requestId: lastRequestId(), token: 'Half an answer' });
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await done).toEqual({ ok: true, text: 'Half an answer' });
  });

  it('stops at the overall ceiling even while words keep coming', async () => {
    const done = generateText(request, { timeoutMs: 4_000, idleMs: 5_000, totalMs: 12_000 });
    const id = lastRequestId();
    for (let i = 0; i < 20; i++) {
      bridge.emit('onToken', { requestId: id, token: 'x' });
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const outcome = await done;
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.text.length).toBeLessThan(20);
  });

  it('reports an error from the model', async () => {
    const done = generateText(request);
    bridge.emit('onGenerateError', { requestId: lastRequestId(), error: 'out of memory' });
    expect(await done).toEqual({ ok: false, error: 'out of memory' });
  });
});
