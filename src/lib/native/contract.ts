// Mirror of the native contract in docs/BUILD_PLAN.md §3, plus the model download functions.
// src/lib/native/contract.ts must stay byte-identical to this file.
// Any change must be agreed with the native stream.

export type FileKind = 'image' | 'pdf' | 'doc' | 'text' | 'audio' | 'video';

export type ScanConfig = {
  // wholePhone: scan everything except the excluded folders; includeRoots only set the scan order.
  // selected: scan only the folders in includeRoots.
  mode: 'wholePhone' | 'selected';
  includeRoots: string[];
  // A name without "/" skips every folder with that name; a path with "/" skips that folder and its contents.
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
  // True while the chat model is still loading in the background.
  llmLoading: boolean;
};

// Relative paths ("Documents/Receipts") start at the storage root; absolute paths must be in shared storage.
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

// ---- model files ----

export type ModelFileInfo = {
  name: string;
  // Absolute path for the native side. For a partial download this is where the finished file will be.
  path: string;
  // Bytes on disk. For a partial download, the bytes saved so far.
  size: number;
  partial: boolean;
};

export type DeviceInfo = {
  totalRamBytes: number;
  freeStorageBytes: number;
  sdk: number;
  model: string;
};

export type DownloadRequest = {
  // Catalog id; also the id on the events.
  id: string;
  url: string;
  // Tried when `url` answers 404 (for example the same file on the main branch).
  fallbackUrl?: string | null;
  fileName: string;
  expectedBytes: number;
  // Hugging Face access token for gated models. Sent to the first host only.
  token?: string | null;
  wifiOnly: boolean;
};

export type DownloadState = 'downloading' | 'paused' | 'done' | 'error' | 'cancelled';

export type DownloadErrorCode =
  | 'AUTH'
  | 'NOT_FOUND'
  | 'HTTP'
  | 'NETWORK'
  | 'SPACE'
  | 'WIFI'
  | 'OFFLINE'
  | 'SIZE'
  | 'IO'
  | 'BAD_REQUEST';

export type ModelDownloadEvent = {
  // The catalog id for downloads, or "import:<file name>" for a model copied from a picked file.
  id: string;
  state: DownloadState;
  bytes: number;
  total: number;
  code?: DownloadErrorCode | null;
  message?: string | null;
  // True while waiting to retry after a dropped connection.
  retrying?: boolean;
};

export interface AiFoundItNative {
  getModelsDir(): string;
  hasAllFilesAccess(): boolean;
  // Changes whenever anything in the phone's media database changes; -1 when the phone cannot say.
  mediaGeneration(): number;
  openAllFilesAccessSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  // Saves the settings, loads the embedder, and starts loading the chat model in the background.
  configure(scan: ScanConfig, models: ModelConfig): Promise<IndexStatus>;
  runScanNow(): Promise<void>;
  cancelScan(): Promise<void>;
  getStatus(): Promise<IndexStatus>;
  drainInbox(limit: number): Promise<InboxItem[]>;
  ackInbox(ids: number[]): Promise<void>;
  // Forgets what was scanned, so the next scan indexes every file again.
  resetIndex(): Promise<void>;
  embedText(text: string): Promise<number[]>;
  generate(requestId: string, req: GenerateRequest): Promise<void>;
  stopGenerate(requestId: string): Promise<void>;
  listModels(): Promise<ModelFileInfo[]>;
  downloadModel(req: DownloadRequest): Promise<void>;
  pauseDownload(id: string): Promise<void>;
  // Cancels a running download, or throws away the saved part of a stopped one (give its file name).
  cancelDownload(id: string, fileName?: string | null): Promise<void>;
  getDownloads(): Promise<ModelDownloadEvent[]>;
  importModel(uri: string, fileName: string): Promise<ModelFileInfo>;
  deleteModel(fileName: string): Promise<boolean>;
  getDeviceInfo(): Promise<DeviceInfo>;
  thumbnail(path: string, opts: { size: number; page?: number }): Promise<string | null>;
  readText(path: string, maxChars: number): Promise<string>;
  openFile(path: string, how: 'default' | 'chooser'): Promise<boolean>;
  showInFolder(path: string): Promise<boolean>;
  runFileOps(batchId: string, ops: FileOp[]): Promise<FileOpResult[]>;
  // Bytes this app has sent since it started, not counting model downloads.
  bytesSent(): Promise<number>;
  // Bytes spent on model downloads since the app started.
  downloadTraffic(): Promise<{ received: number; sent: number }>;
  scheduleBackground(opts: { everyHours: number; requireCharging: boolean; watchNewMedia: boolean }): Promise<void>;
  cancelBackground(): Promise<void>;
}

export type NativeEventMap = {
  onIndexProgress: { done: number; total: number; current?: string };
  onToken: { requestId: string; token: string };
  onGenerateDone: { requestId: string };
  onGenerateError: { requestId: string; error: string };
  onFileOpsProgress: { batchId: string; done: number; total: number; current?: string };
  onModelDownload: ModelDownloadEvent;
};

export type NativeEventName = keyof NativeEventMap;

export type NativeWithEvents = AiFoundItNative & {
  addListener<E extends NativeEventName>(
    event: E,
    listener: (payload: NativeEventMap[E]) => void,
  ): { remove: () => void };
};
