import * as DocumentPicker from 'expo-document-picker';
import { Directory, File } from 'expo-file-system';

import { isMockNative, native } from '@/lib/native';
import type { ModelConfig } from '@/lib/native/contract';

export type ModelFile = { name: string; path: string; size: number };

const MODEL_EXTS = ['.litertlm', '.gguf', '.task', '.tflite', '.bin'];

export function modelsDir(): Directory {
  return new Directory(native.getModelsDir());
}

export async function listModelFiles(): Promise<ModelFile[]> {
  try {
    const dir = modelsDir();
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((e): e is File => e instanceof File)
      .filter((f) => MODEL_EXTS.some((x) => f.name.toLowerCase().endsWith(x)))
      .map((f) => ({ name: f.name, path: f.uri, size: f.size ?? 0 }));
  } catch {
    return [];
  }
}

const isEmbedder = (name: string) => /embed/i.test(name);
const isLlm = (name: string) => !isEmbedder(name);

export async function detectModelConfig(): Promise<{ config: ModelConfig; files: ModelFile[] }> {
  const files = await listModelFiles();
  const embedder = files.find((f) => isEmbedder(f.name));
  const llm = files.find((f) => isLlm(f.name));
  return {
    files,
    config: {
      embedderPath: embedder?.path ?? null,
      llmPath: llm?.path ?? null,
      useGpu: true,
      dims: 256,
    },
  };
}

// The demo fallback: pick a .litertlm/.gguf from shared storage and copy it
// into the app's private models dir. Works fully offline.
export async function importModelFile(): Promise<ModelFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false, multiple: false });
  if (picked.canceled || picked.assets.length === 0) return null;
  const asset = picked.assets[0];
  const dir = modelsDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, asset.name);
  new File(asset.uri).copy(dest);
  return { name: dest.name, path: dest.uri, size: dest.size ?? asset.size ?? 0 };
}

export async function deleteModelFile(path: string): Promise<void> {
  try {
    new File(path).delete();
  } catch {
    // already gone
  }
}

export { isMockNative };
