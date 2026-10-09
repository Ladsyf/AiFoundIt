import { getDb, vecAvailable } from '@/lib/db/db';
import { setMetaValue } from '@/lib/db/files';
import { deleteFileByPath } from '@/lib/db/merge';
import { native } from '@/lib/native';
import { matchesExclude, relativeFolderOf } from '@/lib/scan-paths';

export const EMBEDDER_FILE_KEY = 'embedderFile';

/**
 * Empties the search index and tells the native side to forget what it scanned, so the next scan
 * rebuilds everything. (Clearing only this database would leave the scanner believing nothing changed.)
 */
export async function deleteIndex(): Promise<void> {
  await native.resetIndex();
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // chunks_fts is an external-content table, so it has to be emptied with its own command.
    await db.runAsync("INSERT INTO chunks_fts(chunks_fts) VALUES('delete-all')");
    if (vecAvailable) await db.runAsync('DELETE FROM chunks_vec');
    await db.runAsync('DELETE FROM labels');
    await db.runAsync('DELETE FROM facts');
    await db.runAsync('DELETE FROM index_steps');
    await db.runAsync('DELETE FROM chunks');
    await db.runAsync('DELETE FROM files');
  });
  await setMetaValue(EMBEDDER_FILE_KEY, '');
}

/**
 * Throws away the vectors but keeps the text, and makes the next scan process every file again.
 * Used when the search model changes: vectors from different models cannot be compared.
 */
export async function prepareReembed(): Promise<void> {
  await native.resetIndex();
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (vecAvailable) await db.runAsync('DELETE FROM chunks_vec');
    await db.runAsync('UPDATE chunks SET embedding = NULL');
  });
}

/**
 * Removes files that live in skipped folders from the index right away, so a new rule hides them
 * without waiting for the next scan. Returns how many files were removed.
 */
export async function removeExcludedFromIndex(excludes: string[]): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ path: string }>('SELECT path FROM files');
  const doomed = rows.filter((r) => matchesExclude(relativeFolderOf(r.path), excludes)).map((r) => r.path);
  if (doomed.length === 0) return 0;
  await db.withTransactionAsync(async () => {
    for (const path of doomed) await deleteFileByPath(db, path);
  });
  return doomed.length;
}
