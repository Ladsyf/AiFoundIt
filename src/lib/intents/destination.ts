import { normalizeFolderInput } from '@/lib/scan-paths';

export const DEFAULT_ORGANIZE_FOLDER = 'Documents/Organized';

const ILLEGAL_CHARS = '<>:"|?*';

/**
 * A folder name a plan may create. It stays inside the phone's storage, never points at another app's
 * private folder and never climbs above the root. Falls back to [fallback] when nothing usable is left.
 * (The folder name can come from the chat model, so it is never trusted as written.)
 */
export function sanitizeDestination(input: string | null | undefined, fallback = DEFAULT_ORGANIZE_FOLDER): string {
  if (!input) return fallback;
  const normalized = normalizeFolderInput(input);
  if (!normalized) return fallback;
  const parts = normalized
    .split('/')
    .map((part) =>
      Array.from(part)
        .filter((c) => c.charCodeAt(0) >= 32 && !ILLEGAL_CHARS.includes(c))
        .join('')
        .trim(),
    )
    .filter((part) => part.length > 0)
    .slice(0, 4);
  if (parts.length === 0) return fallback;
  if (parts[0].toLowerCase() === 'android') return fallback;
  return parts.join('/').slice(0, 120);
}
