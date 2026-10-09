import { addNativeListener, native } from '@/lib/native';
import type { GenerateRequest } from '@/lib/native/contract';

let counter = 0;
const nextRequestId = () => `req-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export type GenerateOutcome =
  | { ok: true; text: string }
  | { ok: false; error: string };

// Turns the event-based native generate() into a promise that resolves with the
// full text. onToken receives the accumulated text so callers can stream it
// into the UI. Resolves with ok:false on timeout instead of hanging.
//
// A model that is still answering is never cut off. Three limits apply:
//  - timeoutMs: how long to wait for the first word (the model may still be loading or reading the prompt),
//  - idleMs: how long the model may go quiet between two words,
//  - totalMs: an overall ceiling, so a runaway answer cannot go on forever.
export async function generateText(
  req: Omit<GenerateRequest, never>,
  opts: { timeoutMs?: number; idleMs?: number; totalMs?: number; onToken?: (accumulated: string) => void } = {},
): Promise<GenerateOutcome> {
  const requestId = nextRequestId();
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const idleMs = opts.idleMs ?? 15_000;
  const totalMs = opts.totalMs ?? 120_000;
  const startedAt = Date.now();

  return new Promise<GenerateOutcome>((resolve) => {
    let text = '';
    let settled = false;

    const finish = (outcome: GenerateOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      void native.stopGenerate(requestId).catch(() => {});
      resolve(outcome);
    };

    const subs = [
      addNativeListener('onToken', (p) => {
        if (p.requestId !== requestId) return;
        text += p.token;
        opts.onToken?.(text);
        // Still answering: wait for the next word, but never past the overall ceiling.
        arm(Math.min(idleMs, Math.max(0, totalMs - (Date.now() - startedAt))));
      }),
      addNativeListener('onGenerateDone', (p) => {
        if (p.requestId === requestId) finish({ ok: true, text });
      }),
      addNativeListener('onGenerateError', (p) => {
        if (p.requestId === requestId) finish({ ok: false, error: p.error });
      }),
    ];

    let timer: ReturnType<typeof setTimeout>;
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(text ? { ok: true, text } : { ok: false, error: 'timeout' });
      }, ms);
    };
    arm(timeoutMs);

    void native.generate(requestId, req).catch((e: unknown) => {
      finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
  });
}
