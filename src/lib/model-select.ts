import { EMBEDDER_PREFERENCE, LLM_PREFERENCE, catalogByFile, catalogById, fitFor, type ModelRole } from '@/lib/model-catalog';

// Pure model choice logic, kept apart from the native bridge so it can be tested on its own.

export type InstalledModel = {
  // File name, also the name used to remember which model is in use.
  name: string;
  // Absolute path, as the native side needs it (not a file:// address).
  path: string;
  // Bytes on disk; for a partial download, the bytes saved so far.
  size: number;
  partial: boolean;
  role: ModelRole;
  catalogId?: string;
};

export type ActiveModels = { embedder: InstalledModel | null; llm: InstalledModel | null };

/** Catalog models know their role; any other file counts as a search model only if its name says "embed". */
export function roleOf(fileName: string): ModelRole {
  const known = catalogByFile(fileName);
  if (known) return known.role;
  return /embed/i.test(fileName) ? 'embedder' : 'llm';
}

export function toInstalled(file: { name: string; path: string; size: number; partial: boolean }): InstalledModel {
  const known = catalogByFile(file.name);
  return {
    name: file.name,
    path: file.path,
    size: file.size,
    partial: file.partial,
    role: roleOf(file.name),
    catalogId: known?.id,
  };
}

/**
 * The model to use for each job. The person's choice wins if that file is still there; otherwise the
 * first catalog model in the preference order that is on the phone; otherwise any model of that kind.
 *
 * A model that is far too big for this phone's memory is never picked on its own: Android closes the app
 * while it loads (seen with a 3.7 GB chat model on a phone with 7 GB), and it would do so on every start.
 * It still loads if the person chose it themselves.
 */
export function resolveActive(
  installed: InstalledModel[],
  chosen: { embedder?: string | null; llm?: string | null },
  totalRamBytes?: number | null,
): ActiveModels {
  const done = installed.filter((m) => !m.partial);
  const fits = (m: InstalledModel): boolean => {
    const known = m.catalogId ? catalogById(m.catalogId) : undefined;
    return !known || fitFor(known, totalRamBytes) !== 'too-big';
  };
  const pick = (role: ModelRole, preference: string[], chosenName?: string | null): InstalledModel | null => {
    const ofRole = done.filter((m) => m.role === role);
    const picked = chosenName ? ofRole.find((m) => m.name === chosenName) : undefined;
    if (picked) return picked;
    for (const id of preference) {
      const match = ofRole.find((m) => m.catalogId === id && fits(m));
      if (match) return match;
    }
    return ofRole.find(fits) ?? null;
  };
  return {
    embedder: pick('embedder', EMBEDDER_PREFERENCE, chosen.embedder),
    llm: pick('llm', LLM_PREFERENCE, chosen.llm),
  };
}

const ALLOWED_EXTENSIONS = ['.litertlm', '.gguf', '.task', '.tflite', '.bin'];

export function isModelFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
