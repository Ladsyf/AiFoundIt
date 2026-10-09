// Exclude patterns are matched against a file's path relative to the storage
// root (e.g. "Pictures/Screenshots/foo.png"). Valid regex is compiled by the
// native scanner; anything else falls back to a case-insensitive substring
// match, so plain folder names like "private" still work.
export function validateExcludePattern(raw: string): string | null {
  const p = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!p) return 'Enter a pattern or folder name.';
  if (p.length > 200) return 'Keep it under 200 characters.';
  try {
    new RegExp(p, 'i');
    return null;
  } catch {
    return 'Not a valid pattern — check brackets, backslashes and parentheses.';
  }
}

export function normalizeExcludePattern(raw: string): string {
  return raw.trim().replace(/^\/+|\/+$/g, '');
}

export function normalizeScanRoot(raw: string): string {
  return raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}
