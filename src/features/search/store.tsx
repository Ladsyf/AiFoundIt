import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

import type { SnackbarMessage } from '@/components/ui/snackbar';
import { DEMO_FILES, DEMO_INDEX_TOTAL } from '@/features/search/demo-files';
import { search } from '@/features/search/search-engine';
import type { AssistantMessage, Conversation, FileItem, MoveProposal } from '@/features/search/types';

const SEARCH_DELAY_MS = 700;
const INDEX_TICK_MS = 250;
const INDEX_DURATION_MS = 30000;

type State = {
  access: 'unknown' | 'granted';
  indexed: number;
  files: FileItem[];
  conversations: Conversation[];
  activeId: string | null;
  snackbar: SnackbarMessage | null;
};

type Action =
  | { type: 'grant' }
  | { type: 'indexTick' }
  | { type: 'send'; conversationId: string; userId: string; assistantId: string; text: string; now: number }
  | { type: 'resolve'; conversationId: string; assistantId: string; query: string }
  | { type: 'newChat' }
  | { type: 'open'; id: string }
  | { type: 'proposal'; conversationId: string; assistantId: string; next: MoveProposal['state'] }
  | { type: 'snackbar'; message: SnackbarMessage | null };

const initialState: State = {
  access: 'unknown',
  indexed: 0,
  files: DEMO_FILES,
  conversations: [],
  activeId: null,
  snackbar: null,
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function updateAssistant(
  state: State,
  conversationId: string,
  assistantId: string,
  update: (message: AssistantMessage) => AssistantMessage,
): Conversation[] {
  return state.conversations.map((c) =>
    c.id !== conversationId
      ? c
      : {
          ...c,
          messages: c.messages.map((m) => (m.id === assistantId && m.role === 'assistant' ? update(m) : m)),
        },
  );
}

function findProposal(state: State, conversationId: string, assistantId: string) {
  const message = state.conversations
    .find((c) => c.id === conversationId)
    ?.messages.find((m) => m.id === assistantId);
  return message?.role === 'assistant' ? message.proposal : undefined;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'grant':
      return { ...state, access: 'granted' };
    case 'indexTick': {
      const step = Math.ceil(DEMO_INDEX_TOTAL / (INDEX_DURATION_MS / INDEX_TICK_MS));
      return { ...state, indexed: Math.min(DEMO_INDEX_TOTAL, state.indexed + step) };
    }
    case 'send': {
      const user = { id: action.userId, role: 'user' as const, text: action.text };
      const pending: AssistantMessage = {
        id: action.assistantId,
        role: 'assistant',
        status: 'searching',
        text: '',
        results: [],
        partialIndex: state.indexed < DEMO_INDEX_TOTAL,
      };
      const exists = state.conversations.some((c) => c.id === action.conversationId);
      const conversations = exists
        ? state.conversations.map((c) =>
            c.id === action.conversationId
              ? { ...c, updatedAt: action.now, messages: [...c.messages, user, pending] }
              : c,
          )
        : [
            {
              id: action.conversationId,
              title: action.text.length > 48 ? `${action.text.slice(0, 47).trimEnd()}…` : action.text,
              updatedAt: action.now,
              messages: [user, pending],
            },
            ...state.conversations,
          ];
      return { ...state, conversations, activeId: action.conversationId };
    }
    case 'resolve': {
      const outcome = search(action.query, state.files);
      return {
        ...state,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) => ({
          ...m,
          status: 'done',
          text: outcome.text,
          results: outcome.results,
          proposal: outcome.proposal,
        })),
      };
    }
    case 'newChat':
      return { ...state, activeId: null };
    case 'open':
      return { ...state, activeId: action.id };
    case 'proposal': {
      const proposal = findProposal(state, action.conversationId, action.assistantId);
      if (!proposal) return state;
      const ids = new Set(proposal.fileIds);
      const files =
        action.next === 'moved' || action.next === 'undone'
          ? state.files.map((f) =>
              ids.has(f.id) ? { ...f, folder: action.next === 'moved' ? proposal.to : proposal.from } : f,
            )
          : state.files;
      return {
        ...state,
        files,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) => ({
          ...m,
          proposal: { ...proposal, state: action.next },
        })),
      };
    }
    case 'snackbar':
      return { ...state, snackbar: action.message };
  }
}

type SearchStore = State & {
  activeConversation: Conversation | null;
  indexTotal: number;
  grantAccess: () => void;
  send: (text: string) => void;
  newChat: () => void;
  openConversation: (id: string) => void;
  confirmMove: (conversationId: string, assistantId: string) => void;
  cancelMove: (conversationId: string, assistantId: string) => void;
  showSnackbar: (message: Omit<SnackbarMessage, 'id'>) => void;
  dismissSnackbar: () => void;
  fileById: (id: string) => FileItem | undefined;
};

const SearchContext = createContext<SearchStore | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const indexing = state.access === 'granted' && state.indexed < DEMO_INDEX_TOTAL;
  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => dispatch({ type: 'indexTick' }), INDEX_TICK_MS);
    return () => clearInterval(timer);
  }, [indexing]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const conversationId = state.activeId ?? nextId('chat');
      const assistantId = nextId('msg');
      dispatch({ type: 'send', conversationId, userId: nextId('msg'), assistantId, text, now: Date.now() });
      setTimeout(() => dispatch({ type: 'resolve', conversationId, assistantId, query: text }), SEARCH_DELAY_MS);
    },
    [state.activeId],
  );

  const showSnackbar = useCallback(
    (message: Omit<SnackbarMessage, 'id'>) => dispatch({ type: 'snackbar', message: { ...message, id: nextId('snack') } }),
    [],
  );

  const dismissSnackbar = useCallback(() => dispatch({ type: 'snackbar', message: null }), []);

  const confirmMove = useCallback(
    (conversationId: string, assistantId: string) => {
      const proposal = findProposal(state, conversationId, assistantId);
      if (!proposal) return;
      dispatch({ type: 'proposal', conversationId, assistantId, next: 'moved' });
      showSnackbar({
        text: `Moved ${proposal.fileIds.length} files to ${proposal.to}`,
        action: {
          label: 'Undo',
          onPress: () => dispatch({ type: 'proposal', conversationId, assistantId, next: 'undone' }),
        },
      });
    },
    [state, showSnackbar],
  );

  const value = useMemo<SearchStore>(
    () => ({
      ...state,
      activeConversation: state.conversations.find((c) => c.id === state.activeId) ?? null,
      indexTotal: DEMO_INDEX_TOTAL,
      grantAccess: () => dispatch({ type: 'grant' }),
      send,
      newChat: () => dispatch({ type: 'newChat' }),
      openConversation: (id) => dispatch({ type: 'open', id }),
      confirmMove,
      cancelMove: (conversationId, assistantId) =>
        dispatch({ type: 'proposal', conversationId, assistantId, next: 'cancelled' }),
      showSnackbar,
      dismissSnackbar,
      fileById: (id) => state.files.find((f) => f.id === id),
    }),
    [state, send, confirmMove, showSnackbar, dismissSnackbar],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const store = useContext(SearchContext);
  if (!store) throw new Error('useSearch must be used inside SearchProvider');
  return store;
}
