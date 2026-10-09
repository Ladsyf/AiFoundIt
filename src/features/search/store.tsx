import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';

import type { SnackbarMessage } from '@/components/ui/snackbar';
import type {
  AssistantMessage,
  Conversation,
  FileItem,
  FilePlan,
  SearchResult
} from '@/features/search/types';
import { getDb } from '@/lib/db/db';
import { countFiles, getMetaValue, setMetaValue } from '@/lib/db/files';
import { mergeInbox } from '@/lib/db/merge';
import { glanceCounts, type GlanceTile } from '@/lib/intents/glance';
import { buildMovePlan, reverseOps, runPlan, sensitiveFiles, undoBatch } from '@/lib/intents/organize';
import { receiptTotal } from '@/lib/intents/totals';
import { detectModelConfig } from '@/lib/models';
import { addNativeListener, isMockNative, native } from '@/lib/native';
import type { FileOpResult, IndexStatus } from '@/lib/native/contract';
import { loadScanConfig } from '@/lib/scan-config';
import { streamAnswer, templatedAnswer } from '@/lib/search/answer';
import { planQuery } from '@/lib/search/plan';
import { retrieve } from '@/lib/search/retrieve';
import { PRIVATE_FOLDER, RECEIPTS_FOLDER } from '@/lib/search/vocab';


type BackendState = { embedder: IndexStatus['embedder']; llm: IndexStatus['llm'] };

type State = {
  access: 'unknown' | 'granted';
  ready: boolean;
  indexing: boolean;
  indexed: number;
  indexTotal: number;
  fileCount: number;
  backends: BackendState;
  glance: GlanceTile[];
  conversations: Conversation[];
  activeId: string | null;
  snackbar: SnackbarMessage | null;
};

type Action =
  | { type: 'ready'; fileCount: number; backends: BackendState }
  | { type: 'grant' }
  | { type: 'index'; done: number; total: number; running: boolean }
  | { type: 'backends'; backends: BackendState }
  | { type: 'counts'; fileCount: number; glance: GlanceTile[] }
  | { type: 'send'; conversationId: string; userId: string; assistantId: string; text: string; now: number }
  | {
      type: 'results';
      conversationId: string;
      assistantId: string;
      results: SearchResult[];
      text?: string;
      proposal?: FilePlan;
      total?: AssistantMessage['total'];
      streaming?: boolean;
    }
  | { type: 'answer'; conversationId: string; assistantId: string; text: string; proof: string }
  | { type: 'newChat' }
  | { type: 'open'; id: string }
  | { type: 'planState'; conversationId: string; assistantId: string; next: FilePlan['state']; batchId?: string }
  | { type: 'planToggle'; conversationId: string; assistantId: string; opId: string }
  | { type: 'snackbar'; message: SnackbarMessage | null };

const initialState: State = {
  access: 'unknown',
  ready: false,
  indexing: false,
  indexed: 0,
  indexTotal: 0,
  fileCount: 0,
  backends: { embedder: 'none', llm: 'none' },
  glance: [],
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
          updatedAt: Date.now(),
          messages: c.messages.map((m) => (m.id === assistantId && m.role === 'assistant' ? update(m) : m)),
        },
  );
}

function findAssistant(state: State, conversationId: string, assistantId: string) {
  const message = state.conversations
    .find((c) => c.id === conversationId)
    ?.messages.find((m) => m.id === assistantId);
  return message?.role === 'assistant' ? message : undefined;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ready':
      return { ...state, ready: true, fileCount: action.fileCount, backends: action.backends };
    case 'grant':
      return { ...state, access: 'granted' };
    case 'index':
      return { ...state, indexing: action.running, indexed: action.done, indexTotal: action.total };
    case 'backends':
      return { ...state, backends: action.backends };
    case 'counts':
      return { ...state, fileCount: action.fileCount, glance: action.glance };
    case 'send': {
      const user = { id: action.userId, role: 'user' as const, text: action.text };
      const pending: AssistantMessage = {
        id: action.assistantId,
        role: 'assistant',
        status: 'searching',
        text: '',
        results: [],
        partialIndex: state.indexing,
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
    case 'results':
      return {
        ...state,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) => ({
          ...m,
          status: action.streaming ? 'streaming' : 'done',
          text: action.text ?? m.text,
          results: action.results,
          proposal: action.proposal ?? m.proposal,
          total: action.total,
        })),
      };
    case 'answer':
      return {
        ...state,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) => ({
          ...m,
          status: 'done',
          text: action.text || m.text,
          proof: action.proof,
        })),
      };
    case 'newChat':
      return { ...state, activeId: null };
    case 'open':
      return { ...state, activeId: action.id };
    case 'planState': {
      const message = findAssistant(state, action.conversationId, action.assistantId);
      if (!message?.proposal) return state;
      return {
        ...state,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) => ({
          ...m,
          proposal: { ...m.proposal!, state: action.next, batchId: action.batchId ?? m.proposal!.batchId },
        })),
      };
    }
    case 'planToggle':
      return {
        ...state,
        conversations: updateAssistant(state, action.conversationId, action.assistantId, (m) =>
          m.proposal
            ? {
                ...m,
                proposal: {
                  ...m.proposal,
                  ops: m.proposal.ops.map((o) => (o.id === action.opId ? { ...o, checked: !o.checked } : o)),
                },
              }
            : m,
        ),
      };
    case 'snackbar':
      return { ...state, snackbar: action.message };
  }
}

type SearchStore = State & {
  activeConversation: Conversation | null;
  isMock: boolean;
  grantAccess: () => void;
  startScan: () => Promise<void>;
  send: (text: string) => void;
  newChat: () => void;
  openConversation: (id: string) => void;
  confirmPlan: (conversationId: string, assistantId: string) => void;
  cancelPlan: (conversationId: string, assistantId: string) => void;
  togglePlanOp: (conversationId: string, assistantId: string, opId: string) => void;
  refreshCounts: () => Promise<void>;
  showSnackbar: (message: Omit<SnackbarMessage, 'id'>) => void;
  dismissSnackbar: () => void;
  fileById: (id: string) => FileItem | undefined;
};

const SearchContext = createContext<SearchStore | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fileCache = useRef(new Map<string, FileItem>());
  const batches = useRef(new Map<string, FileOpResult[]>());
  const lastResults = useRef(new Map<string, FileItem[]>());

  const cacheFiles = useCallback((items: FileItem[]) => {
    for (const f of items) fileCache.current.set(f.id, f);
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const [n, glance] = await Promise.all([countFiles(), glanceCounts()]);
      dispatch({ type: 'counts', fileCount: n, glance });
    } catch {
      // db not open yet
    }
  }, []);

  // Boot: open DB, drain anything the native worker left, wire progress events.
  useEffect(() => {
    let cancelled = false;
    const subs = [
      addNativeListener('onIndexProgress', (p) => {
        dispatch({ type: 'index', done: p.done, total: p.total, running: true });
      }),
    ];
    void (async () => {
      try {
        await getDb();
        await mergeInbox();
        const n = await countFiles();
        const status = await native.getStatus().catch(() => null);
        const granted = (await getMetaValue('accessGranted')) === '1';
        if (cancelled) return;
        dispatch({
          type: 'ready',
          fileCount: n,
          backends: status
            ? { embedder: status.embedder, llm: status.llm }
            : { embedder: 'none', llm: 'none' },
        });
        if (granted) dispatch({ type: 'grant' });
        void refreshCounts();
      } catch {
        if (!cancelled) dispatch({ type: 'ready', fileCount: 0, backends: { embedder: 'none', llm: 'none' } });
      }
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, [refreshCounts]);

  const startScan = useCallback(async () => {
    const models = await detectModelConfig();
    const scan = await loadScanConfig().catch(() => null);
    const status = scan ? await native.configure(scan, models.config).catch(() => null) : null;
    if (status) dispatch({ type: 'backends', backends: { embedder: status.embedder, llm: status.llm } });
    try {
      await native.runScanNow();
    } finally {
      await mergeInbox();
      dispatch({ type: 'index', done: 0, total: 0, running: false });
      void refreshCounts();
    }
  }, [refreshCounts]);

  const showSnackbar = useCallback(
    (message: Omit<SnackbarMessage, 'id'>) => dispatch({ type: 'snackbar', message: { ...message, id: nextId('snack') } }),
    [],
  );
  const dismissSnackbar = useCallback(() => dispatch({ type: 'snackbar', message: null }), []);

  const proofLine = useCallback(async (started: number, bytesBefore: number) => {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    let sent = 0;
    try {
      sent = Math.max(0, (await native.bytesSent()) - bytesBefore);
    } catch {
      sent = 0;
    }
    return `Found in ${secs} s · on-device · ${sent} bytes sent`;
  }, []);

  const runQuery = useCallback(
    async (conversationId: string, assistantId: string, query: string) => {
      const started = Date.now();
      const bytesBefore = await native.bytesSent().catch(() => 0);
      const finish = async (text: string) =>
        dispatch({
          type: 'answer',
          conversationId,
          assistantId,
          text,
          proof: await proofLine(started, bytesBefore),
        });

      try {
        const llmAvailable = state.backends.llm !== 'none';
        const plan = await planQuery(query, { llmAvailable });

        if (plan.intent === 'compute') {
          const { total, items } = await receiptTotal({
            dateFrom: plan.dateFrom,
            dateTo: plan.dateTo,
            merchant: plan.merchant,
          });
          cacheFiles(items);
          const peso = `₱${total.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
          const where = plan.merchant ? ` on ${plan.merchant}` : '';
          const text =
            total.count === 0
              ? 'No receipts with amounts in that period.'
              : `You spent ${peso}${where} across ${total.count} receipt${total.count === 1 ? '' : 's'}. Totals are summed in code, not by the model.`;
          dispatch({
            type: 'results',
            conversationId,
            assistantId,
            results: items.map((f) => ({ fileId: f.id, reason: 'Receipt total' })),
            total,
            text,
          });
          await finish(text);
          return;
        }

        if (plan.intent === 'organize' || plan.intent === 'privacy') {
          const candidates =
            plan.intent === 'privacy'
              ? await sensitiveFiles()
              : (await retrieve(plan)).map((r) => r.item).filter((f) => f.folder !== plan.destination);
          cacheFiles(candidates);
          if (candidates.length === 0) {
            const text =
              plan.intent === 'privacy'
                ? 'No sensitive files flagged on this phone.'
                : 'Nothing matches that to organize.';
            dispatch({ type: 'results', conversationId, assistantId, results: [], text });
            await finish(text);
            return;
          }
          const destination =
            plan.intent === 'privacy' ? PRIVATE_FOLDER : (plan.destination ?? RECEIPTS_FOLDER);
          const proposal = buildMovePlan(candidates, destination);
          const text =
            plan.intent === 'privacy'
              ? `Found ${candidates.length} file${candidates.length === 1 ? '' : 's'} that look like IDs or credentials. I can move them to ${destination}.`
              : `${candidates.length} files match. I can move them into ${destination} — nothing is deleted, and you can undo it.`;
          dispatch({
            type: 'results',
            conversationId,
            assistantId,
            results: candidates.map((f) => ({ fileId: f.id, reason: 'In this plan' })),
            proposal,
            text,
          });
          await finish(text);
          return;
        }

        const results = await retrieve(plan);
        const items = results.map((r) => r.item);
        cacheFiles(items);
        lastResults.current.set(conversationId, items);
        dispatch({
          type: 'results',
          conversationId,
          assistantId,
          results: results.map((r) => ({ fileId: r.item.id, reason: r.reason })),
          streaming: llmAvailable && results.length > 0,
        });

        let text: string | null = null;
        if (llmAvailable && results.length > 0) {
          text = await streamAnswer(query, results, {
            llmAvailable,
            onToken: (accumulated) =>
              dispatch({
                type: 'results',
                conversationId,
                assistantId,
                results: results.map((r) => ({ fileId: r.item.id, reason: r.reason })),
                text: accumulated,
                streaming: true,
              }),
          });
        }
        if (plan.intent === 'count') {
          const n = await countFiles();
          text = `You have ${n} file${n === 1 ? '' : 's'} indexed on this phone.`;
        }
        await finish(text ?? templatedAnswer(plan, results));
      } catch (e) {
        await finish(`Something went wrong while searching: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [cacheFiles, proofLine, state.backends.llm],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const conversationId = state.activeId ?? nextId('chat');
      const assistantId = nextId('msg');
      dispatch({ type: 'send', conversationId, userId: nextId('msg'), assistantId, text, now: Date.now() });
      void runQuery(conversationId, assistantId, text);
    },
    [state.activeId, runQuery],
  );

  const confirmPlan = useCallback(
    (conversationId: string, assistantId: string) => {
      const message = findAssistant(state, conversationId, assistantId);
      const proposal = message?.proposal;
      if (!proposal || proposal.state !== 'pending') return;
      const checked = proposal.ops.filter((o) => o.checked);
      if (checked.length === 0) {
        dispatch({ type: 'planState', conversationId, assistantId, next: 'cancelled' });
        return;
      }
      const batchId = nextId('batch');
      void (async () => {
        try {
          const results = await runPlan(proposal, batchId);
          batches.current.set(batchId, results);
          const okCount = results.filter((r) => r.ok && r.op.op === 'move').length;
          dispatch({ type: 'planState', conversationId, assistantId, next: 'moved', batchId });
          for (const r of results) {
            const item = [...fileCache.current.values()].find((f) => f.path === r.op.from);
            if (item && r.finalPath) {
              fileCache.current.set(item.id, {
                ...item,
                path: r.finalPath,
                folder: r.finalPath.split('/').slice(0, -1).join('/').replace(/^\/storage\/emulated\/\d+\//, ''),
              });
            }
          }
          showSnackbar({
            text: `Moved ${okCount} files to ${proposal.destination}`,
            action: {
              label: 'Undo',
              onPress: () => {
                void (async () => {
                  const undoResults = batches.current.get(batchId);
                  if (!undoResults || reverseOps(undoResults).length === 0) return;
                  await undoBatch(batchId, undoResults);
                  dispatch({ type: 'planState', conversationId, assistantId, next: 'undone' });
                  for (const r of reverseOps(undoResults)) {
                    const item = [...fileCache.current.values()].find((f) => f.path === r.from);
                    if (item && r.to) {
                      fileCache.current.set(item.id, {
                        ...item,
                        path: r.to,
                        folder: r.to.split('/').slice(0, -1).join('/').replace(/^\/storage\/emulated\/\d+\//, ''),
                      });
                    }
                  }
                })();
              },
            },
          });
        } catch (e) {
          showSnackbar({ text: `Move failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      })();
    },
    [state, showSnackbar],
  );

  const value = useMemo<SearchStore>(
    () => ({
      ...state,
      activeConversation: state.conversations.find((c) => c.id === state.activeId) ?? null,
      isMock: isMockNative,
      grantAccess: () => {
        dispatch({ type: 'grant' });
        void setMetaValue('accessGranted', '1').catch(() => {});
      },
      startScan,
      send,
      newChat: () => dispatch({ type: 'newChat' }),
      openConversation: (id) => dispatch({ type: 'open', id }),
      confirmPlan,
      cancelPlan: (conversationId, assistantId) =>
        dispatch({ type: 'planState', conversationId, assistantId, next: 'cancelled' }),
      togglePlanOp: (conversationId, assistantId, opId) =>
        dispatch({ type: 'planToggle', conversationId, assistantId, opId }),
      refreshCounts,
      showSnackbar,
      dismissSnackbar,
      fileById: (id) => fileCache.current.get(id),
    }),
    [state, startScan, send, confirmPlan, refreshCounts, showSnackbar, dismissSnackbar],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const store = useContext(SearchContext);
  if (!store) throw new Error('useSearch must be used inside SearchProvider');
  return store;
}
