import { getDb } from '@/lib/db/db';
import type { ScanConfig } from '@/lib/native/contract';

export const DEFAULT_SCAN: ScanConfig = {
  mode: 'wholePhone',
  includeRoots: [
    'DCIM/Camera',
    'Pictures/Screenshots',
    'DCIM/Screenshots',
    'Download',
    'Documents',
    'Pictures/Messenger',
    'Recordings',
  ],
  excludes: ['Android/data', 'Android/obb'],
  types: { images: true, documents: true, audio: true, video: true },
  respectNomedia: true,
  minImageBytes: 10_240,
  maxDocBytes: 100 * 1024 * 1024,
};

export type ScanRule = { id: number; path: string; mode: 'include' | 'exclude'; source: string };

export async function listScanRules(): Promise<ScanRule[]> {
  const db = await getDb();
  return db.getAllAsync<ScanRule>("SELECT id, path, mode, source FROM scan_rules ORDER BY id", []);
}

export async function addScanRule(path: string, mode: 'include' | 'exclude'): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO scan_rules (path, mode, source) VALUES (?,?,?)', [path, mode, 'user']);
}

export async function removeScanRule(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM scan_rules WHERE id = ?', [id]);
}

// Effective scan config: defaults plus user rules. Any include rule switches
// the scan to selected-roots mode; exclude rules are regex patterns matched
// against storage-relative paths. Excluded folders disappear after a rescan.
export async function loadScanConfig(): Promise<ScanConfig> {
  const rules = await listScanRules().catch(() => [] as ScanRule[]);
  const excludes = [...DEFAULT_SCAN.excludes, ...rules.filter((r) => r.mode === 'exclude').map((r) => r.path)];
  const includes = rules.filter((r) => r.mode === 'include').map((r) => r.path);
  return {
    ...DEFAULT_SCAN,
    mode: includes.length > 0 ? 'selected' : 'wholePhone',
    includeRoots: includes.length > 0 ? [...new Set(includes)] : DEFAULT_SCAN.includeRoots,
    excludes: [...new Set(excludes)],
  };
}
