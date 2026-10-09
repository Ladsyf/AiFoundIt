export type FileKind = 'screenshot' | 'receipt' | 'document' | 'photo';

export type FilePreview =
  | { kind: 'screenshot'; app: string; title: string; rows: [string, string][] }
  | { kind: 'receipt'; merchant: string; items: [string, string][]; total: string }
  | { kind: 'document'; title: string; lines: string[] }
  | { kind: 'photo'; subject: string; tone: string };

export type FileItem = {
  id: string;
  name: string;
  kind: FileKind;
  folder: string;
  savedAt: string;
  size: string;
  tags: string[];
  preview: FilePreview;
};

export type SearchResult = {
  fileId: string;
  reason: string;
};

export type MoveProposal = {
  fileIds: string[];
  from: string;
  to: string;
  state: 'pending' | 'moved' | 'cancelled' | 'undone';
};

export type UserMessage = {
  id: string;
  role: 'user';
  text: string;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  status: 'searching' | 'done';
  text: string;
  results: SearchResult[];
  partialIndex: boolean;
  proposal?: MoveProposal;
};

export type Message = UserMessage | AssistantMessage;

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};
