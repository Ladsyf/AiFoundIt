import type { FileKind, FileOp } from '@/lib/native/contract';

export type { FileKind, FileOp };

export type FilePreview =
  | { kind: 'screenshot'; app: string; title: string; rows: [string, string][] }
  | { kind: 'receipt'; merchant: string; items: [string, string][]; total: string }
  | { kind: 'document'; title: string; lines: string[] }
  | { kind: 'photo'; subject: string; tone: string }
  | { kind: 'image'; thumbnailPath?: string; sourcePath?: string }
  | { kind: 'video'; thumbnailPath?: string; sourcePath?: string; durationMs?: number }
  | { kind: 'audio'; durationMs?: number };

export type FileItem = {
  id: string;
  name: string;
  kind: FileKind;
  category?: string | null;
  folder: string;
  savedAt: string;
  size: string;
  sizeBytes: number;
  tags: string[];
  preview?: FilePreview;
  path: string;
  uri: string;
  mime: string;
  thumbnailPath?: string;
  snippet?: string;
  // What the chat model said when asked to describe the photo.
  description?: string;
  highlights?: [number, number][];
  page?: number;
  startMs?: number;
  durationMs?: number;
  isSensitive?: boolean;
};

export type SearchResult = {
  fileId: string;
  reason: string;
};

export type PlanOp = {
  id: string;
  fileId: string;
  from: string;
  to: string;
  checked: boolean;
};

export type PlanResult = {
  moved: number;
  failed: number;
  // The first thing that went wrong, in plain words, for the card.
  firstError?: string;
};

export type FilePlan = {
  ops: PlanOp[];
  destination: string;
  // 'failed' means nothing could be moved; 'moved' can still carry a few failures in `result`.
  state: 'pending' | 'moved' | 'failed' | 'cancelled' | 'undone';
  batchId?: string;
  result?: PlanResult;
};

export type ReceiptTotal = {
  amount: number;
  currency: 'PHP';
  count: number;
  merchant?: string;
  fileIds: string[];
};

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  status: 'searching' | 'streaming' | 'done';
  text: string;
  results: SearchResult[];
  partialIndex: boolean;
  proposal?: FilePlan;
  total?: ReceiptTotal;
  proof?: string;
};

export type Message = UserMessage | AssistantMessage;

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};
