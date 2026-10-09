import { getDb } from '@/lib/db/db';
import { getMetaValue, setMetaValue } from '@/lib/db/files';
import type { ScanConfig } from '@/lib/native/contract';
import { normalizeFolderInput } from '@/lib/scan-paths';

// Folders other apps keep private. They are always skipped and cannot be removed.
export const BUILT_IN_EXCLUDES = ['Android/data', 'Android/obb'];

// Scanned first, and the only folders scanned in "Only these folders" mode. They can be edited.
export const DEFAULT_INCLUDES = [
  'DCIM/Camera',
  'Pictures/Screenshots',
  'DCIM/Screenshots',
  'Download',
  'Documents',
  'Pictures/Messenger',
  'Recordings',
];

export type ScanMode = 'wholePhone' | 'selected';
export type RuleMode = 'include' | 'exclude';
export type ScanRule = { id: number; path: string; mode: RuleMode; source: 'default' | 'user' };

export const DEFAULT_SCAN: ScanConfig = {
  mode: 'wholePhone',
  includeRoots: DEFAULT_INCLUDES,
  excludes: BUILT_IN_EXCLUDES,
  types: { images: true, documents: true, audio: true, video: true },
  respectNomedia: true,
  minImageBytes: 10_240,
  maxDocBytes: 100 * 1024 * 1024,
};

const SEEDED_KEY = 'scan.seeded';
const MODE_KEY = 'scan.mode';

let seeding: Promise<void> | null = null;

/** Puts the default folders in the rules table once, so they can be edited like any other rule. */
export function ensureDefaultRules(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      if ((await getMetaValue(SEEDED_KEY)) === '1') return;
      const db = await getDb();
      for (const path of DEFAULT_INCLUDES) {
        await db.runAsync('INSERT INTO scan_rules (path, mode, source) VALUES (?,?,?)', [path, 'include', 'default']);
      }
      await setMetaValue(SEEDED_KEY, '1');
    })().catch((e) => {
      seeding = null;
      throw e;
    });
  }
  return seeding;
}

export async function listScanRules(): Promise<ScanRule[]> {
  await ensureDefaultRules();
  const db = await getDb();
  return db.getAllAsync<ScanRule>('SELECT id, path, mode, source FROM scan_rules ORDER BY id', []);
}

export type AddRuleResult = { ok: true; rule: string } | { ok: false; reason: string };

/** Adds a folder to skip (or to scan). The text is cleaned up first; duplicates are refused with a reason. */
export async function addScanRule(input: string, mode: RuleMode): Promise<AddRuleResult> {
  const path = normalizeFolderInput(input);
  if (!path) return { ok: false, reason: 'Enter a folder name or path, like Android or Documents/Private.' };
  const lower = path.toLowerCase();
  if (mode === 'exclude' && BUILT_IN_EXCLUDES.some((e) => e.toLowerCase() === lower)) {
    return { ok: false, reason: 'That folder is always skipped already.' };
  }
  const rules = await listScanRules();
  if (rules.some((r) => r.mode === mode && r.path.toLowerCase() === lower)) {
    return { ok: false, reason: mode === 'exclude' ? 'That folder is already skipped.' : 'That folder is already in the list.' };
  }
  const db = await getDb();
  await db.runAsync('INSERT INTO scan_rules (path, mode, source) VALUES (?,?,?)', [path, mode, 'user']);
  return { ok: true, rule: path };
}

export async function removeScanRule(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM scan_rules WHERE id = ?', [id]);
}

export async function getScanMode(): Promise<ScanMode> {
  return (await getMetaValue(MODE_KEY)) === 'selected' ? 'selected' : 'wholePhone';
}

export async function setScanMode(mode: ScanMode): Promise<void> {
  await setMetaValue(MODE_KEY, mode);
}

/** The exclusions in force: the built-in ones plus the person's own. */
export function effectiveExcludes(rules: ScanRule[]): string[] {
  return [...new Set([...BUILT_IN_EXCLUDES, ...rules.filter((r) => r.mode === 'exclude').map((r) => r.path)])];
}

/**
 * What the native scanner is told. Whole phone: everything except the skipped folders, with the chosen
 * folders scanned first. Only these folders: just the chosen folders (falls back to whole phone when none are left).
 */
export async function loadScanConfig(): Promise<ScanConfig> {
  const rules = await listScanRules().catch(() => [] as ScanRule[]);
  const includes = [...new Set(rules.filter((r) => r.mode === 'include').map((r) => r.path))];
  const wanted = await getScanMode().catch(() => 'wholePhone' as ScanMode);
  return {
    ...DEFAULT_SCAN,
    mode: wanted === 'selected' && includes.length > 0 ? 'selected' : 'wholePhone',
    includeRoots: includes,
    excludes: effectiveExcludes(rules),
  };
}
