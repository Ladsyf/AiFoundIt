import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

import { downloadUrls, type CatalogModel, type ModelRole } from '@/lib/model-catalog';
import {
  deleteModelFile,
  detectModelConfig,
  emitModelsChanged,
  getHfToken,
  getWifiOnly,
  importModelFile,
  setActiveModel,
  setHfToken,
  setWifiOnly,
  type ActiveModels,
  type InstalledModel,
} from '@/lib/models';
import { addNativeListener, native } from '@/lib/native';
import type { DeviceInfo, ModelDownloadEvent } from '@/lib/native/contract';

export type DownloadView = {
  state: 'downloading' | 'paused' | 'error';
  bytes: number;
  total: number;
  code?: string | null;
  message?: string | null;
  retrying?: boolean;
};

type State = {
  loaded: boolean;
  installed: InstalledModel[];
  active: ActiveModels;
  // Running, paused and failed downloads by catalog id. Finished and cancelled ones are removed.
  downloads: Record<string, DownloadView>;
  // A model being copied in from a file the person picked.
  importing: DownloadView | null;
  device: DeviceInfo | null;
  token: string;
  wifiOnly: boolean;
  note: string | null;
};

type Action =
  | { type: 'loaded'; installed: InstalledModel[]; active: ActiveModels; token: string; wifiOnly: boolean; device: DeviceInfo | null }
  | { type: 'installed'; installed: InstalledModel[]; active: ActiveModels }
  | { type: 'event'; event: ModelDownloadEvent }
  | { type: 'running'; events: ModelDownloadEvent[] }
  | { type: 'token'; token: string }
  | { type: 'wifi'; wifiOnly: boolean }
  | { type: 'importEnded' }
  | { type: 'note'; note: string | null };

const initialState: State = {
  loaded: false,
  installed: [],
  active: { embedder: null, llm: null },
  downloads: {},
  importing: null,
  device: null,
  token: '',
  wifiOnly: true,
  note: null,
};

function viewOf(event: ModelDownloadEvent): DownloadView | null {
  if (event.state === 'downloading' || event.state === 'paused' || event.state === 'error') {
    return {
      state: event.state,
      bytes: event.bytes,
      total: event.total,
      code: event.code,
      message: event.message,
      retrying: event.retrying,
    };
  }
  return null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        loaded: true,
        installed: action.installed,
        active: action.active,
        token: action.token,
        wifiOnly: action.wifiOnly,
        device: action.device,
      };
    case 'installed':
      return { ...state, installed: action.installed, active: action.active };
    case 'running': {
      const downloads = { ...state.downloads };
      for (const e of action.events) {
        const view = viewOf(e);
        if (view && !e.id.startsWith('import:')) downloads[e.id] = view;
      }
      return { ...state, downloads };
    }
    case 'event': {
      const { event } = action;
      const view = viewOf(event);
      if (event.id.startsWith('import:')) return { ...state, importing: view };
      const downloads = { ...state.downloads };
      if (view) downloads[event.id] = view;
      else delete downloads[event.id];
      return { ...state, downloads };
    }
    case 'token':
      return { ...state, token: action.token };
    case 'wifi':
      return { ...state, wifiOnly: action.wifiOnly };
    case 'importEnded':
      return { ...state, importing: null };
    case 'note':
      return { ...state, note: action.note };
  }
}

type ModelsStore = State & {
  download: (model: CatalogModel) => Promise<void>;
  pause: (model: CatalogModel) => Promise<void>;
  cancel: (model: CatalogModel) => Promise<void>;
  remove: (model: InstalledModel) => Promise<void>;
  use: (model: InstalledModel) => Promise<void>;
  importFromFile: () => Promise<void>;
  saveToken: (token: string) => Promise<void>;
  changeWifiOnly: (on: boolean) => Promise<void>;
  dismissNote: () => void;
};

const ModelsContext = createContext<ModelsStore | null>(null);

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refresh = useCallback(async () => {
    const { installed, active } = await detectModelConfig();
    dispatch({ type: 'installed', installed, active });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ installed, active }, token, wifiOnly, device, running] = await Promise.all([
          detectModelConfig(),
          getHfToken(),
          getWifiOnly(),
          native.getDeviceInfo().catch(() => null),
          native.getDownloads().catch(() => [] as ModelDownloadEvent[]),
        ]);
        if (cancelled) return;
        dispatch({ type: 'loaded', installed, active, token, wifiOnly, device });
        dispatch({ type: 'running', events: running });
      } catch {
        if (!cancelled) {
          dispatch({
            type: 'loaded',
            installed: [],
            active: { embedder: null, llm: null },
            token: '',
            wifiOnly: true,
            device: null,
          });
        }
      }
    })();

    const sub = addNativeListener('onModelDownload', (event) => {
      dispatch({ type: 'event', event });
      if (event.state === 'done') {
        // A finished download (or import) is a new model: show it, and let the app load it.
        void refresh().then(() => emitModelsChanged());
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [refresh]);

  const download = useCallback(
    async (model: CatalogModel) => {
      const [url, fallbackUrl] = downloadUrls(model);
      dispatch({
        type: 'event',
        event: { id: model.id, state: 'downloading', bytes: state.downloads[model.id]?.bytes ?? 0, total: model.sizeBytes },
      });
      try {
        await native.downloadModel({
          id: model.id,
          url,
          fallbackUrl,
          fileName: model.file,
          expectedBytes: model.sizeBytes,
          token: state.token.trim() ? state.token.trim() : null,
          wifiOnly: state.wifiOnly,
        });
      } catch (e) {
        dispatch({
          type: 'event',
          event: {
            id: model.id,
            state: 'error',
            bytes: 0,
            total: model.sizeBytes,
            code: 'IO',
            message: e instanceof Error ? e.message : 'Could not start the download',
          },
        });
      }
    },
    [state.downloads, state.token, state.wifiOnly],
  );

  const pause = useCallback(async (model: CatalogModel) => {
    await native.pauseDownload(model.id).catch(() => {});
  }, []);

  const cancel = useCallback(async (model: CatalogModel) => {
    await native.cancelDownload(model.id, model.file).catch(() => {});
    dispatch({ type: 'event', event: { id: model.id, state: 'cancelled', bytes: 0, total: 0 } });
    await refresh();
  }, [refresh]);

  const remove = useCallback(
    async (model: InstalledModel) => {
      await deleteModelFile(model.name);
      await refresh();
      emitModelsChanged();
    },
    [refresh],
  );

  const use = useCallback(
    async (model: InstalledModel) => {
      await setActiveModel(model.role as ModelRole, model.name);
      await refresh();
      emitModelsChanged();
    },
    [refresh],
  );

  const importFromFile = useCallback(async () => {
    try {
      const imported = await importModelFile();
      // The copy announces itself with a "done" event, which refreshes the list and loads the model.
      if (imported) dispatch({ type: 'note', note: `Added ${imported.name}.` });
    } catch (e) {
      dispatch({ type: 'note', note: e instanceof Error ? e.message : 'Could not add that file.' });
    } finally {
      dispatch({ type: 'importEnded' });
    }
  }, []);

  const saveToken = useCallback(async (token: string) => {
    await setHfToken(token);
    dispatch({ type: 'token', token: token.trim() });
  }, []);

  const changeWifiOnly = useCallback(async (on: boolean) => {
    await setWifiOnly(on);
    dispatch({ type: 'wifi', wifiOnly: on });
  }, []);

  const dismissNote = useCallback(() => dispatch({ type: 'note', note: null }), []);

  const value = useMemo<ModelsStore>(
    () => ({ ...state, download, pause, cancel, remove, use, importFromFile, saveToken, changeWifiOnly, dismissNote }),
    [state, download, pause, cancel, remove, use, importFromFile, saveToken, changeWifiOnly, dismissNote],
  );

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels() {
  const store = useContext(ModelsContext);
  if (!store) throw new Error('useModels must be used inside ModelsProvider');
  return store;
}
