// Mirror of the native contract in docs/BUILD_PLAN.md §3.
// modules/aifoundit-native/src/AiFoundItNative.types.ts is the source of truth;
// keep this file identical to it. Any change must be agreed with the native stream.

export type FileKind = 'image' | 'pdf' | 'doc' | 'text' | 'audio' | 'video';

export type ScanConfig = {
  mode: 'wholePhone' | 'selected';
  includeRoots: string[];
  excludes: string[];
  types: { images: boolean; documents: boolean; audio: boolean; video: boolean };
  respectNomedia: boolean;
  minImageBytes: number;
  maxDocBytes: number;
};

export type ModelConfig = { embedderPath: string | null; llmPath: string | null; useGpu: boolean; dims: 256 };

export type Chunk = {
  kind: 'text' | 'image' | 'frame' | 'audio';
  page?: number;
  startMs?: number;
  endMs?: number;
  text?: string;
  vector?: number[];
};

export type InboxItem = {
  id: number;
  op: 'upsert' | 'delete';
  path: string;
  uri: string;
  name: string;
  folder: string;
  ext: string;
  mime: string;
  kind: FileKind;
  size: number;
  modifiedAt: number;
  takenAt?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  isScreenshot: boolean;
  labels: { label: string; confidence: number }[];
  thumbnailPath?: string;
  chunks: Chunk[];
  error?: string;
};

export type IndexStatus = {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  embedder: 'gpu' | 'cpu' | 'none';
  llm: 'gpu' | 'cpu' | 'none';
};

export type FileOp = { op: 'mkdir' | 'move' | 'copy' | 'rename'; from?: string; to: string };

export type FileOpResult = { op: FileOp; ok: boolean; finalPath?: string; error?: string };

export type GenerateRequest = {
  system?: string;
  prompt: string;
  imagePath?: string;
  audioPath?: string;
  maxTokens: number;
  temperature: number;
};

export interface AiFoundItNative {
  getModelsDir(): string;
  hasAllFilesAccess(): boolean;
  openAllFilesAccessSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  configure(scan: ScanConfig, models: ModelConfig): Promise<IndexStatus>;
  runScanNow(): Promise<void>;
  cancelScan(): Promise<void>;
  getStatus(): Promise<IndexStatus>;
  drainInbox(limit: number): Promise<InboxItem[]>;
  ackInbox(ids: number[]): Promise<void>;
  embedText(text: string): Promise<number[]>;
  generate(requestId: string, req: GenerateRequest): Promise<void>;
  stopGenerate(requestId: string): Promise<void>;
  thumbnail(path: string, opts: { size: number; page?: number }): Promise<string | null>;
  readText(path: string, maxChars: number): Promise<string>;
  openFile(path: string, how: 'default' | 'chooser'): Promise<boolean>;
  showInFolder(path: string): Promise<boolean>;
  runFileOps(batchId: string, ops: FileOp[]): Promise<FileOpResult[]>;
  bytesSent(): Promise<number>;
  scheduleBackground(opts: { everyHours: number; requireCharging: boolean; watchNewMedia: boolean }): Promise<void>;
  cancelBackground(): Promise<void>;
}

export type NativeEventMap = {
  onIndexProgress: { done: number; total: number; current?: string };
  onToken: { requestId: string; token: string };
  onGenerateDone: { requestId: string };
  onGenerateError: { requestId: string; error: string };
  onFileOpsProgress: { batchId: string; done: number; total: number; current?: string };
};

export type NativeEventName = keyof NativeEventMap;

export type NativeWithEvents = AiFoundItNative & {
  addListener<E extends NativeEventName>(
    event: E,
    listener: (payload: NativeEventMap[E]) => void,
  ): { remove: () => void };
};
