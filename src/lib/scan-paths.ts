// Folder rules for the scan. Paths are relative to the storage root ("DCIM/Camera").
// matchesExclude must behave exactly like ScanRules.kt in the native module; scan-paths.test.ts and
// ScanRulesTest.kt use the same cases.

const BACKSLASH = String.fromCharCode(92);

function norm(path: string): string {
  return path.split(BACKSLASH).join('/').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

/**
 * True when a folder is skipped by a rule.
 *  - A rule with no "/" ("Android", ".Statuses") skips every folder with that name, at any depth.
 *  - A rule with a "/" ("Documents/Private") skips that folder and everything under it.
 * Blank rules never match, so an empty entry cannot hide the whole phone.
 */
export function matchesExclude(relFolder: string, excludes: string[]): boolean {
  const rel = norm(relFolder);
  if (!rel) return false;
  const segments = rel.split('/');
  for (const raw of excludes) {
    const ex = norm(raw);
    if (!ex) continue;
    if (ex.includes('/')) {
      if (rel === ex || rel.startsWith(ex + '/')) return true;
    } else if (segments.includes(ex)) {
      return true;
    }
  }
  return false;
}

export function isPathRule(rule: string): boolean {
  return norm(rule).includes('/');
}

/**
 * The folder the system picker returned, as a path relative to the storage root.
 * "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FPrivate" gives "Documents/Private".
 * Returns null for the root of a volume or for places this app cannot scan.
 */
export function treeUriToRelativePath(uri: string): string | null {
  const match = /\/tree\/([^/?#]+)/.exec(uri);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (/downloads\.documents/.test(uri)) return id === 'downloads' ? 'Download' : null;
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const rel = id.slice(colon + 1).replace(/^\/+|\/+$/g, '');
  return rel.length > 0 ? rel : null;
}

const STORAGE_PREFIXES = [/^\/storage\/emulated\/\d+\//i, /^\/storage\/[^/]+\//i, /^\/sdcard\//i, /^internal storage\//i];

/**
 * Cleans up a folder typed by the person: it accepts "Android", "Documents/Private",
 * "/storage/emulated/0/Download/Bank" or "Internal storage/Download/Bank". Returns null when it is empty or unsafe.
 */
export function normalizeFolderInput(input: string): string | null {
  let text = input.split(BACKSLASH).join('/').trim();
  for (const prefix of STORAGE_PREFIXES) text = text.replace(prefix, '');
  const parts = text
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '.');
  if (parts.length === 0 || parts.some((p) => p === '..')) return null;
  const cleaned = parts.join('/');
  return cleaned.length <= 200 ? cleaned : null;
}

/** "/storage/emulated/0/DCIM/Camera/IMG_1.jpg" gives "DCIM/Camera". */
export function relativeFolderOf(absolutePath: string): string {
  let path = absolutePath;
  for (const prefix of STORAGE_PREFIXES) path = path.replace(prefix, '');
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * Folders worth offering as one tap, with a plain explanation. Folders that start with a dot (".thumbnails",
 * ".Statuses") are skipped by the scanner already, so they are not offered here.
 */
export const QUICK_EXCLUDES: { label: string; rule: string; hint: string }[] = [
  { label: 'Android', rule: 'Android', hint: 'Skips every folder named Android, including Android/media where apps like WhatsApp keep pictures' },
  { label: 'Private', rule: 'Private', hint: 'Any folder named Private' },
  { label: 'Bank', rule: 'Bank', hint: 'Any folder named Bank' },
];
