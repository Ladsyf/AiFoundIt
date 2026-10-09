import type { FileKind, FileOp } from '@/lib/native/contract';

export type { FileKind, FileOp };

export type FilePreview =
  | { kind: 'screenshot'; app: string; title: string; rows: [string, string][] }
  | { kind: 'receipt'; merchant: string; items: [string, string][]; total: string }
  | { kind: 'document'; title: string; lines: string[] }
  | { kind: 'photo'; subject: string; tone: string }
  | { kind: 'image'; thumbnailPath?: string }
  | { kind: 'video'; thumbnailPath?: string; durationMs?: number }
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

export type FilePlan = {
  ops: PlanOp[];
  destination: string;
  state: 'pending' | 'moved' | 'cancelled' | 'undone';
  batchId?: string;
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
