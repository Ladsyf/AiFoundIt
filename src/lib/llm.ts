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
export async function generateText(
  req: Omit<GenerateRequest, never>,
  opts: { timeoutMs?: number; onToken?: (accumulated: string) => void } = {},
): Promise<GenerateOutcome> {
  const requestId = nextRequestId();
  const timeoutMs = opts.timeoutMs ?? 15_000;

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
      }),
      addNativeListener('onGenerateDone', (p) => {
        if (p.requestId === requestId) finish({ ok: true, text });
      }),
      addNativeListener('onGenerateError', (p) => {
        if (p.requestId === requestId) finish({ ok: false, error: p.error });
      }),
    ];

    const timer = setTimeout(() => {
      finish(text ? { ok: true, text } : { ok: false, error: 'timeout' });
    }, timeoutMs);

    void native.generate(requestId, req).catch((e: unknown) => {
      finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
    });
  });
}
