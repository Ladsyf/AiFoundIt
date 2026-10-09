import * as DocumentPicker from 'expo-document-picker';

import { getMetaValue, setMetaValue } from '@/lib/db/files';
import type { ModelRole } from '@/lib/model-catalog';
import {
  isModelFileName,
  resolveActive,
  toInstalled,
  type ActiveModels,
  type InstalledModel,
} from '@/lib/model-select';
import { isMockNative, native } from '@/lib/native';
import type { ModelConfig } from '@/lib/native/contract';

export { isMockNative };
export type { ActiveModels, InstalledModel };

const ACTIVE_KEYS: Record<ModelRole, string> = {
  embedder: 'model.active.embedder',
  llm: 'model.active.llm',
};
const TOKEN_KEY = 'hf.token';
const WIFI_ONLY_KEY = 'dl.wifiOnly';

/** Model files on this phone, including partial downloads. The native side reports absolute paths. */
export async function listInstalled(): Promise<InstalledModel[]> {
  try {
    return (await native.listModels()).map(toInstalled);
  } catch {
    return [];
  }
}

async function chosenModels() {
  const [embedder, llm] = await Promise.all([
    getMetaValue(ACTIVE_KEYS.embedder).catch(() => null),
    getMetaValue(ACTIVE_KEYS.llm).catch(() => null),
  ]);
  return { embedder, llm };
}

/** Which model files are on the phone, which ones are in use, and the config the native side needs. */
export async function detectModelConfig(): Promise<{
  config: ModelConfig;
  installed: InstalledModel[];
  active: ActiveModels;
}> {
  const [installed, device] = await Promise.all([listInstalled(), native.getDeviceInfo().catch(() => null)]);
  const active = resolveActive(installed, await chosenModels(), device?.totalRamBytes);
  return {
    installed,
    active,
    config: {
      embedderPath: active.embedder?.path ?? null,
      llmPath: active.llm?.path ?? null,
      useGpu: true,
      dims: 256,
    },
  };
}

export async function setActiveModel(role: ModelRole, fileName: string): Promise<void> {
  await setMetaValue(ACTIVE_KEYS[role], fileName);
}

/**
 * Lets the person pick a model file they already have (downloaded in a browser, or copied from a computer)
 * and copies it into the app. The copy runs natively with progress, because these files are gigabytes.
 */
export async function importModelFile(): Promise<InstalledModel | null> {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false, multiple: false });
  if (picked.canceled || picked.assets.length === 0) return null;
  const asset = picked.assets[0];
  if (!isModelFileName(asset.name)) {
    throw new Error('Choose a model file that ends in .litertlm, .gguf, .task or .tflite.');
  }
  return toInstalled(await native.importModel(asset.uri, asset.name));
}

export async function deleteModelFile(fileName: string): Promise<boolean> {
  try {
    return await native.deleteModel(fileName);
  } catch {
    return false;
  }
}

// The Hugging Face token is only needed for models behind a license. It stays on this phone and is sent
// to huggingface.co only.
export async function getHfToken(): Promise<string> {
  return (await getMetaValue(TOKEN_KEY).catch(() => null)) ?? '';
}

export async function setHfToken(token: string): Promise<void> {
  await setMetaValue(TOKEN_KEY, token.trim());
}

export async function getWifiOnly(): Promise<boolean> {
  return (await getMetaValue(WIFI_ONLY_KEY).catch(() => null)) !== '0';
}

export async function setWifiOnly(on: boolean): Promise<void> {
  await setMetaValue(WIFI_ONLY_KEY, on ? '1' : '0');
}

// Screens that change the models (a finished download, an import, Use, Delete) tell the rest of the app,
// which then reloads the models in the native side.
const listeners = new Set<() => void>();

export function onModelsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitModelsChanged(): void {
  listeners.forEach((listener) => listener());
}
