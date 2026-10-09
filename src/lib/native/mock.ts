import type {
    AiFoundItNative,
    FileOp,
    FileOpResult,
    GenerateRequest,
    InboxItem,
    IndexStatus,
    ModelConfig,
    NativeEventMap,
    NativeEventName,
    ScanConfig,
} from '@/lib/native/contract';
import { demoCorpus } from '@/lib/native/mock-corpus';
import { hashEmbed } from '@/lib/vector';

type Listener = (payload: never) => void;

const TICK_MS = 140;

// Stand-in for modules/aifoundit-native so the JS pipeline runs in Expo Go and
// in tests. Vectors are deterministic hash embeddings — enough to exercise the
// merge, FTS and cosine paths without a model.
export function createMockNative(): AiFoundItNative & {
  addListener: <E extends NativeEventName>(event: E, listener: (p: NativeEventMap[E]) => void) => { remove: () => void };
  __mock: { files: Map<string, InboxItem>; addFile(f: InboxItem): void; deleteFile(path: string): void };
} {
  const listeners = new Map<NativeEventName, Set<Listener>>();
  const files = new Map<string, InboxItem>();
  const inbox = new Map<number, InboxItem>();
  let seen = new Map<string, string>(); // path -> `${size}:${mtime}`
  let running = false;
  let nextInboxId = 100_000;
  let status: IndexStatus = { running: false, done: 0, total: 0, failed: 0, embedder: 'cpu', llm: 'none' };

  for (const f of demoCorpus()) files.set(f.path, f);

  const emit = <E extends NativeEventName>(event: E, payload: NativeEventMap[E]) => {
    listeners.get(event)?.forEach((l) => (l as (p: NativeEventMap[E]) => void)(payload));
  };

  const addListener = <E extends NativeEventName>(event: E, listener: (p: NativeEventMap[E]) => void) => {
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(listener as Listener);
    return { remove: () => set.delete(listener as Listener) };
  };

  const withVectors = (item: InboxItem): InboxItem => ({
    ...item,
    chunks: item.chunks.map((c) => {
      if (c.vector) return c;
      const basis =
        c.kind === 'text' || c.kind === 'audio' || c.kind === 'frame'
          ? (c.text ?? `${item.name} ${item.labels.map((l) => l.label).join(' ')}`)
          : `${item.name} ${item.labels.map((l) => l.label).join(' ')}`;
      return { ...c, vector: Array.from(hashEmbed(basis)) };
    }),
  });

  const stage = (item: InboxItem) => {
    const copy = withVectors({ ...item, id: nextInboxId++ });
    inbox.set(copy.id, copy);
  };

  const api: AiFoundItNative = {
    getModelsDir: () => '/storage/emulated/0/Android/data/com.aifoundit.app/files/models',
    hasAllFilesAccess: () => true,
    openAllFilesAccessSettings: async () => {},
    openBatterySettings: async () => {},
    configure: async (_scan: ScanConfig, _models: ModelConfig) => status,
    getStatus: async () => status,

    runScanNow: async () => {
      if (running) return;
      running = true;
      const changes = [...files.values()].filter((f) => seen.get(f.path) !== `${f.size}:${f.modifiedAt}`);
      const deleted = [...seen.keys()].filter((p) => !files.has(p));
      const total = changes.length;
      status = { ...status, running: true, total, done: 0 };

      for (let i = 0; i < total; i++) {
        await new Promise((r) => setTimeout(r, TICK_MS));
        stage(changes[i]);
        status = { ...status, done: i + 1 };
        emit('onIndexProgress', { done: i + 1, total, current: changes[i].name });
      }
      for (const p of deleted) {
        inbox.set(nextInboxId, {
          id: nextInboxId++,
          op: 'delete',
          path: p,
          uri: '',
          name: p.split('/').pop() ?? p,
          folder: p.split('/').slice(0, -1).join('/'),
          ext: '',
          mime: '',
          kind: 'text',
          size: 0,
          modifiedAt: 0,
          isScreenshot: false,
          labels: [],
          chunks: [],
        });
      }
      seen = new Map([...files.values()].map((f) => [f.path, `${f.size}:${f.modifiedAt}`]));
      running = false;
      status = { ...status, running: false };
    },

    cancelScan: async () => {
      running = false;
      status = { ...status, running: false };
    },

    drainInbox: async (limit: number) => [...inbox.values()].slice(0, limit),
    ackInbox: async (ids: number[]) => ids.forEach((id) => inbox.delete(id)),

    embedText: async (text: string) => Array.from(hashEmbed(text)),

    generate: async (requestId: string, _req: GenerateRequest) => {
      await new Promise((r) => setTimeout(r, 30));
      emit('onGenerateError', { requestId, error: 'mock: no LLM loaded' });
    },
    stopGenerate: async (_requestId: string) => {},

    thumbnail: async () => null,
    readText: async (path: string, maxChars: number) => {
      const f = files.get(path);
      const all = (f?.chunks ?? [])
        .map((c) => c.text ?? '')
        .filter(Boolean)
        .join('\n');
      return all.slice(0, maxChars);
    },
    openFile: async () => true,
    showInFolder: async () => true,

    runFileOps: async (batchId: string, ops: FileOp[]): Promise<FileOpResult[]> => {
      const results: FileOpResult[] = [];
      let done = 0;
      for (const op of ops) {
        done++;
        emit('onFileOpsProgress', { batchId, done, total: ops.length, current: op.from });
        if (op.op === 'mkdir') {
          results.push({ op, ok: true, finalPath: op.to });
          continue;
        }
        const src = op.from ? files.get(op.from) : undefined;
        if (!src || !op.from) {
          results.push({ op, ok: false, error: 'not found' });
          continue;
        }
        const to = op.to;
        if (files.has(to)) {
          results.push({ op, ok: false, error: 'destination exists' });
          continue;
        }
        if (op.op === 'move' || op.op === 'rename') {
          files.delete(op.from);
          const moved = { ...src, path: to, name: to.split('/').pop() ?? src.name, modifiedAt: Date.now() };
          files.set(to, moved);
          seen.delete(op.from);
          results.push({ op, ok: true, finalPath: to });
        } else {
          const copy = { ...src, path: to, name: to.split('/').pop() ?? src.name, modifiedAt: Date.now() };
          files.set(to, copy);
          seen.delete(to);
          results.push({ op, ok: true, finalPath: to });
        }
      }
      return results;
    },

    bytesSent: async () => 0,
    scheduleBackground: async () => {},
    cancelBackground: async () => {},
  };

  return {
    ...api,
    addListener,
    __mock: {
      files,
      addFile: (f) => files.set(f.path, f),
      deleteFile: (p) => files.delete(p),
    },
  };
}
