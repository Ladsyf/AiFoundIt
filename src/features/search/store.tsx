import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';

import type { SnackbarMessage } from '@/components/ui/snackbar';
import type {
  AssistantMessage,
  Conversation,
  FileItem,
  FilePlan,
  PlanResult,
  SearchResult,
} from '@/features/search/types';
import { enableBackgroundByDefault, setBackgroundEnabled, syncBackground } from '@/lib/background';
import { getDb } from '@/lib/db/db';
import { countFiles, getMetaValue, setMetaValue } from '@/lib/db/files';
import { EMBEDDER_FILE_KEY, deleteIndex as deleteIndexData, prepareReembed } from '@/lib/db/maintenance';
import { requestMerge } from '@/lib/db/merge';
import { describeFile } from '@/lib/intents/describe';
import { glanceCounts, type GlanceTile } from '@/lib/intents/glance';
import {
  buildMovePlan,
  reverseOps,
  runPlan,
  sensitiveFiles,
  summarizeResults,
  undoBatch,
} from '@/lib/intents/organize';
import { receiptTotal } from '@/lib/intents/totals';
import { onModelsChanged } from '@/lib/models';
import { addNativeListener, isMockNative, native } from '@/lib/native';
import type { FileOpResult, IndexStatus } from '@/lib/native/contract';
import { configureNative } from '@/lib/native-setup';
import { relativeFolderOf } from '@/lib/scan-paths';
import { streamAnswer, templatedAnswer } from '@/lib/search/answer';
import { planQuery } from '@/lib/search/plan';
import { retrieve } from '@/lib/search/retrieve';
import { PRIVATE_FOLDER, RECEIPTS_FOLDER } from '@/lib/search/vocab';

type BackendState = {
  embedder: IndexStatus['embedder'];
  llm: IndexStatus['llm'];
  llmLoading: boolean;
};

type State = {
  access: 'unknown' | 'granted';
  ready: boolean;
  indexing: boolean;
  indexed: number;
  indexTotal: number;
  fileCount: number;
  backends: BackendState;
  // A chat model file is chosen, so questions should wait for it to load instead of skipping it.
  llmConfigured: boolean;
  embedderConfigured: boolean;
  glance: GlanceTile[];
  conversations: Conversation[];
  activeId: string | null;
  snackbar: SnackbarMessage | null;
};

type Action =
  | { type: 'ready'; fileCount: number }
  | { type: 'grant' }
  | { type: 'index'; done: number; total: number; running: boolean }
  | { type: 'backends'; backends: BackendState }
  | { type: 'models'; backends: BackendState; llmConfigured: boolean; embedderConfigured: boolean }
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
  | {
      type: 'planState';
      conversationId: string;
      assistantId: string;
      next: FilePlan['state'];
      batchId?: string;
      result?: PlanResult;
    }
  | { type: 'planToggle'; conversationId: string; assistantId: string; opId: string }
  | { type: 'snackbar'; message: SnackbarMessage | null };

const NO_BACKENDS: BackendState = { embedder: 'none', llm: 'none', llmLoading: false };

const initialState: State = {
  access: 'unknown',
  ready: false,
  indexing: false,
  indexed: 0,
  indexTotal: 0,
  fileCount: 0,
  backends: NO_BACKENDS,
  llmConfigured: false,
  embedderConfigured: false,
  glance: [],
  conversations: [],
  activeId: null,
  snackbar: null,
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toBackends(status: IndexStatus): BackendState {
  return { embedder: status.embedder, llm: status.llm, llmLoading: status.llmLoading ?? false };
}

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
      return { ...state, ready: true, fileCount: action.fileCount };
    case 'grant':
      return { ...state, access: 'granted' };
    case 'index':
      return { ...state, indexing: action.running, indexed: action.done, indexTotal: action.total };
    case 'backends':
      return { ...state, backends: action.backends };
    case 'models':
      return {
        ...state,
        backends: action.backends,
        llmConfigured: action.llmConfigured,
        embedderConfigured: action.embedderConfigured,
      };
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
          proposal: {
            ...m.proposal!,
            state: action.next,
            batchId: action.batchId ?? m.proposal!.batchId,
            result: action.result ?? m.proposal!.result,
          },
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

type ScanOptions = { reembed?: boolean };

type SearchStore = State & {
  activeConversation: Conversation | null;
  isMock: boolean;
  grantAccess: () => void;
  startScan: (options?: ScanOptions) => Promise<void>;
  reloadModels: () => Promise<void>;
  deleteIndex: () => Promise<void>;
  setBackgroundIndexing: (on: boolean) => Promise<void>;
  send: (text: string) => void;
  newChat: () => void;
  openConversation: (id: string) => void;
  confirmPlan: (conversationId: string, assistantId: string) => void;
  cancelPlan: (conversationId: string, assistantId: string) => void;
  togglePlanOp: (conversationId: string, assistantId: string, opId: string) => void;
  refreshCounts: () => Promise<void>;
  describe: (file: FileItem) => Promise<string | null>;
  showSnackbar: (message: Omit<SnackbarMessage, 'id'>) => void;
  dismissSnackbar: () => void;
  fileById: (id: string) => FileItem | undefined;
};

const SearchContext = createContext<SearchStore | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const fileCache = useRef(new Map<string, FileItem>());
  const batches = useRef(new Map<string, FileOpResult[]>());
  const lastResults = useRef(new Map<string, FileItem[]>());
  const configuring = useRef<Promise<unknown> | null>(null);
  const scanning = useRef(false);
  const polling = useRef(false);
  const lastMergeAt = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  });

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

  const showSnackbar = useCallback(
    (message: Omit<SnackbarMessage, 'id'>) => dispatch({ type: 'snackbar', message: { ...message, id: nextId('snack') } }),
    [],
  );
  const dismissSnackbar = useCallback(() => dispatch({ type: 'snackbar', message: null }), []);

  // The chat model loads in the background after configure. Check on it until it is ready (or has given up).
  const watchChatModel = useCallback(() => {
    if (polling.current) return;
    polling.current = true;
    void (async () => {
      try {
        for (let i = 0; i < 160; i++) {
          await sleep(1500);
          const status = await native.getStatus().catch(() => null);
          if (!status) return;
          dispatch({ type: 'backends', backends: toBackends(status) });
          if (!status.llmLoading && (status.llm !== 'none' || i > 4)) return;
        }
      } finally {
        polling.current = false;
      }
    })();
  }, []);

  // Gives the native side the folder rules and the models in use, and starts loading them.
  const configureModels = useCallback(async () => {
    const { status, models } = await configureNative();
    const llmConfigured = models.config.llmPath !== null;
    dispatch({
      type: 'models',
      backends: toBackends(status),
      llmConfigured,
      embedderConfigured: models.config.embedderPath !== null,
    });
    if (llmConfigured && status.llm === 'none') watchChatModel();
    return { status, models };
  }, [watchChatModel]);

  // Boot: open the DB, merge anything the background worker left, then load the models.
  useEffect(() => {
    let cancelled = false;
    const subs = [
      addNativeListener('onIndexProgress', (p) => {
        dispatch({ type: 'index', done: p.done, total: p.total, running: true });
        // Show results while the scan is still running, not only when it ends.
        const now = Date.now();
        if (now - lastMergeAt.current > 2500) {
          lastMergeAt.current = now;
          void requestMerge(() => void refreshCounts());
        }
      }),
    ];
    void (async () => {
      try {
        await getDb();
        await requestMerge();
        const n = await countFiles();
        const granted = (await getMetaValue('accessGranted')) === '1';
        if (cancelled) return;
        dispatch({ type: 'ready', fileCount: n });
        if (granted) dispatch({ type: 'grant' });
        void refreshCounts();
        // Models load now, so the first question does not have to wait for them.
        configuring.current = configureModels()
          .then(() => syncBackground())
          .catch(() => undefined);
      } catch {
        if (!cancelled) dispatch({ type: 'ready', fileCount: 0 });
      }
    })();
    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, [configureModels, refreshCounts]);

  const startScan = useCallback(
    async (options: ScanOptions = {}) => {
      if (scanning.current) return;
      scanning.current = true;
      dispatch({ type: 'index', done: 0, total: 0, running: true });
      try {
        const { models } = await configureModels();
        const used = models.active.embedder?.name ?? '';
        const previous = (await getMetaValue(EMBEDDER_FILE_KEY)) ?? '';
        // Vectors from different search models cannot be compared, so a new search model means indexing again.
        if (options.reembed || (used !== previous && (await countFiles()) > 0)) await prepareReembed();
        // From here on, vectors in the index come from this search model. This is saved before the scan runs, so a
        // scan that is interrupted (the app closed, the phone ran out of memory) does not start over from zero.
        await setMetaValue(EMBEDDER_FILE_KEY, used);
        await native.runScanNow();
        await requestMerge();
        await enableBackgroundByDefault();
      } finally {
        scanning.current = false;
        dispatch({ type: 'index', done: 0, total: 0, running: false });
        void refreshCounts();
      }
    },
    [configureModels, refreshCounts],
  );

  // A model was downloaded, imported, chosen or deleted.
  const reloadModels = useCallback(async () => {
    try {
      const { models } = await configureModels();
      const used = models.active.embedder?.name ?? '';
      const previous = (await getMetaValue(EMBEDDER_FILE_KEY)) ?? '';
      const current = stateRef.current;
      if (current.access === 'granted' && used !== previous && (await countFiles()) > 0 && !scanning.current) {
        showSnackbar({ text: used ? 'New search model. Indexing your files again…' : 'Search model removed. Updating the index…' });
        void startScan();
      }
    } catch {
      // Settings shows the state of the models; nothing else to do here.
    }
  }, [configureModels, showSnackbar, startScan]);

  useEffect(() => onModelsChanged(() => void reloadModels()), [reloadModels]);

  const deleteIndex = useCallback(async () => {
    await deleteIndexData();
    fileCache.current.clear();
    lastResults.current.clear();
    await refreshCounts();
    showSnackbar({ text: 'Index deleted. Rescan to build it again.' });
  }, [refreshCounts, showSnackbar]);

  const setBackgroundIndexing = useCallback(async (on: boolean) => {
    await setBackgroundEnabled(on);
  }, []);

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

  const describe = useCallback(
    async (file: FileItem) => {
      const text = await describeFile(file);
      if (text) {
        fileCache.current.set(file.id, { ...file, description: text });
        void refreshCounts();
      }
      return text;
    },
    [refreshCounts],
  );

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
        // Right after the app starts the models may still be loading; wait a little so this question can use them.
        if (configuring.current) await Promise.race([configuring.current, sleep(20_000)]);
        const snapshot = stateRef.current;
        // The planner is only used when the chat model is already loaded, so it never delays the search.
        const plannerReady = snapshot.backends.llm !== 'none';
        // The answer waits for the model to finish loading, because a chat model is chosen.
        const answerReady = snapshot.llmConfigured;
        const plan = await planQuery(query, { llmAvailable: plannerReady });

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
              : (await retrieve(plan)).map((r) => r.item).filter((f) => relativeFolderOf(f.path) !== plan.destination);
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
              ? `Found ${candidates.length} file${candidates.length === 1 ? '' : 's'} that look like IDs or credentials. I can move them to ${proposal.destination}.`
              : `${candidates.length} files match. I can move them into ${proposal.destination} — nothing is deleted, and you can undo it.`;
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

        // "Describe" a photo: ask the chat model to look at the best matching picture and keep what it says.
        if (plan.intent === 'describe' && answerReady) {
          const photo = items.find((f) => f.kind === 'image');
          if (photo) {
            dispatch({
              type: 'results',
              conversationId,
              assistantId,
              results: results.map((r) => ({ fileId: r.item.id, reason: r.reason })),
              streaming: true,
            });
            const description = await describeFile(photo);
            if (description) {
              fileCache.current.set(photo.id, { ...photo, description });
              await finish(`${photo.name}: ${description}`);
              return;
            }
          }
        }

        dispatch({
          type: 'results',
          conversationId,
          assistantId,
          results: results.map((r) => ({ fileId: r.item.id, reason: r.reason })),
          streaming: answerReady && results.length > 0,
        });

        let text: string | null = null;
        if (answerReady && results.length > 0) {
          text = await streamAnswer(query, results, {
            llmAvailable: true,
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
    [cacheFiles, proofLine],
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
          const summary = summarizeResults(results);
          // Say what really happened: the card never claims files moved when the phone refused.
          dispatch({
            type: 'planState',
            conversationId,
            assistantId,
            next: summary.moved > 0 ? 'moved' : 'failed',
            batchId,
            result: summary,
          });
          for (const r of results) {
            const item = [...fileCache.current.values()].find((f) => f.path === r.op.from);
            if (item && r.ok && r.finalPath) {
              fileCache.current.set(item.id, {
                ...item,
                path: r.finalPath,
                folder: '/' + relativeFolderOf(r.finalPath),
              });
            }
          }
          if (summary.moved === 0) {
            showSnackbar({ text: `Nothing was moved${summary.firstError ? `: ${summary.firstError}` : ''}` });
            return;
          }
          showSnackbar({
            text:
              summary.failed > 0
                ? `Moved ${summary.moved} files, ${summary.failed} could not be moved`
                : `Moved ${summary.moved} files to ${proposal.destination}`,
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
                        folder: '/' + relativeFolderOf(r.to),
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
      reloadModels,
      deleteIndex,
      setBackgroundIndexing,
      send,
      newChat: () => dispatch({ type: 'newChat' }),
      openConversation: (id) => dispatch({ type: 'open', id }),
      confirmPlan,
      cancelPlan: (conversationId, assistantId) =>
        dispatch({ type: 'planState', conversationId, assistantId, next: 'cancelled' }),
      togglePlanOp: (conversationId, assistantId, opId) =>
        dispatch({ type: 'planToggle', conversationId, assistantId, opId }),
      refreshCounts,
      describe,
      showSnackbar,
      dismissSnackbar,
      fileById: (id) => fileCache.current.get(id),
    }),
    [
      state,
      startScan,
      reloadModels,
      deleteIndex,
      setBackgroundIndexing,
      send,
      confirmPlan,
      refreshCounts,
      describe,
      showSnackbar,
      dismissSnackbar,
    ],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const store = useContext(SearchContext);
  if (!store) throw new Error('useSearch must be used inside SearchProvider');
  return store;
}
