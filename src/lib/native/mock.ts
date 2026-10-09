import type {
    AiFoundItNative,
    DeviceInfo,
    DownloadRequest,
    FileOp,
    FileOpResult,
    GenerateRequest,
    InboxItem,
    IndexStatus,
    ModelConfig,
    ModelDownloadEvent,
    ModelFileInfo,
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
  let status: IndexStatus = {
    running: false,
    done: 0,
    total: 0,
    failed: 0,
    embedder: 'cpu',
    llm: 'none',
    llmLoading: false,
  };

  // Model downloads are simulated so the screens can be tried in Expo Go. The files are not real.
  const modelsDir = '/storage/emulated/0/Android/data/com.aifoundit.app/files/models';
  const models = new Map<string, ModelFileInfo>();
  const downloads = new Map<string, { timer: ReturnType<typeof setInterval>; last: ModelDownloadEvent }>();
  const MOCK_STORAGE_ROOT = '/storage/emulated/0';

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

  const startMockDownload = (req: DownloadRequest) => {
    if (downloads.has(req.id)) return;
    const total = req.expectedBytes > 0 ? req.expectedBytes : 100_000_000;
    let bytes = 0;
    const send = (event: ModelDownloadEvent) => {
      const current = downloads.get(req.id);
      if (current) current.last = event;
      emit('onModelDownload', event);
    };
    const timer = setInterval(() => {
      bytes = Math.min(total, bytes + total / 25);
      if (bytes >= total) {
        clearInterval(timer);
        downloads.delete(req.id);
        models.set(req.fileName, { name: req.fileName, path: `${modelsDir}/${req.fileName}`, size: total, partial: false });
        emit('onModelDownload', { id: req.id, state: 'done', bytes: total, total });
      } else {
        send({ id: req.id, state: 'downloading', bytes, total });
      }
    }, 200);
    downloads.set(req.id, { timer, last: { id: req.id, state: 'downloading', bytes: 0, total } });
  };

  const resolvePath = (p: string) => (p.startsWith('/') ? p : `${MOCK_STORAGE_ROOT}/${p}`);

  // Same rule as the real file operations: a taken name becomes "name (1).ext", never an overwrite.
  const uniquePath = (path: string) => {
    if (!files.has(path)) return path;
    const slash = path.lastIndexOf('/');
    const dir = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 1;
    while (files.has(`${dir}/${base} (${n})${ext}`)) n++;
    return `${dir}/${base} (${n})${ext}`;
  };

  const api: AiFoundItNative = {
    getModelsDir: () => modelsDir,
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
          results.push({ op, ok: true, finalPath: resolvePath(op.to) });
          continue;
        }
        const src = op.from ? files.get(op.from) : undefined;
        if (!src || !op.from) {
          results.push({ op, ok: false, error: 'not found' });
          continue;
        }
        // Like the real file operations: relative paths start at the storage root, a taken name gets "(1)".
        const to = uniquePath(resolvePath(op.to));
        const folder = '/' + to.slice(MOCK_STORAGE_ROOT.length + 1, to.lastIndexOf('/'));
        if (op.op === 'move' || op.op === 'rename') {
          files.delete(op.from);
          const moved = { ...src, path: to, folder, name: to.split('/').pop() ?? src.name, modifiedAt: Date.now() };
          files.set(to, moved);
          seen.delete(op.from);
          results.push({ op, ok: true, finalPath: to });
        } else {
          const copy = { ...src, path: to, folder, name: to.split('/').pop() ?? src.name, modifiedAt: Date.now() };
          files.set(to, copy);
          seen.delete(to);
          results.push({ op, ok: true, finalPath: to });
        }
      }
      return results;
    },

    resetIndex: async () => {
      seen = new Map();
      inbox.clear();
    },

    listModels: async () => [...models.values()],
    downloadModel: async (req: DownloadRequest) => startMockDownload(req),
    pauseDownload: async (id: string) => {
      const d = downloads.get(id);
      if (!d) return;
      clearInterval(d.timer);
      downloads.delete(id);
      emit('onModelDownload', { ...d.last, state: 'paused' });
    },
    cancelDownload: async (id: string) => {
      const d = downloads.get(id);
      if (d) clearInterval(d.timer);
      downloads.delete(id);
      emit('onModelDownload', { id, state: 'cancelled', bytes: 0, total: 0 });
    },
    getDownloads: async () => [...downloads.values()].map((d) => d.last),
    importModel: async (_uri: string, fileName: string) => {
      const info: ModelFileInfo = { name: fileName, path: `${modelsDir}/${fileName}`, size: 1, partial: false };
      models.set(fileName, info);
      return info;
    },
    deleteModel: async (fileName: string) => models.delete(fileName),
    getDeviceInfo: async (): Promise<DeviceInfo> => ({
      totalRamBytes: 7.4 * 1024 * 1024 * 1024,
      freeStorageBytes: 40 * 1024 * 1024 * 1024,
      sdk: 35,
      model: 'Demo phone',
    }),

    bytesSent: async () => 0,
    downloadTraffic: async () => ({ received: 0, sent: 0 }),
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
