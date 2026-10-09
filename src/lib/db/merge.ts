import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb, vecAvailable } from '@/lib/db/db';
import { inboxToRows } from '@/lib/db/rows';
import { native } from '@/lib/native';

export const DRAIN_BATCH = 50;

type OldChunk = { id: number; text: string | null };

export async function removeChunks(db: SQLiteDatabase, fileId: number) {
  const old = await db.getAllAsync<OldChunk>('SELECT id, text FROM chunks WHERE file_id = ?', [fileId]);
  for (const c of old) {
    // Only chunks with words were added to the keyword index (see mergeItem). Telling an external-content
    // FTS table to forget a row it never held corrupts its index, so picture chunks are skipped here.
    if (c.text) {
      await db.runAsync('INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES (?, ?, ?)', ['delete', c.id, c.text]);
    }
    if (vecAvailable) await db.runAsync('DELETE FROM chunks_vec WHERE rowid = ?', [c.id]);
  }
  await db.runAsync('DELETE FROM chunks WHERE file_id = ?', [fileId]);
}

export async function deleteFileByPath(db: SQLiteDatabase, path: string) {
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM files WHERE path = ?', [path]);
  if (!row) return;
  await removeChunks(db, row.id);
  await db.runAsync('DELETE FROM files WHERE id = ?', [row.id]);
}

async function mergeItem(db: SQLiteDatabase, item: Parameters<typeof inboxToRows>[0]) {
  if (item.op === 'delete') {
    await deleteFileByPath(db, item.path);
    return;
  }

  const rows = inboxToRows(item);
  const f = rows.file;
  const now = Date.now();

  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM files WHERE path = ?', [f.path]);
  let fileId: number;
  if (existing) {
    fileId = existing.id;
    await db.runAsync(
      `UPDATE files SET uri=?, name=?, folder=?, ext=?, mime=?, kind=?, size=?, modified_at=?, taken_at=?,
        width=?, height=?, duration_ms=?, is_screenshot=?, category=?, is_sensitive=?, thumbnail_path=?, error=?, indexed_at=?
       WHERE id=?`,
      [
        f.uri, f.name, f.folder, f.ext, f.mime, f.kind, f.size, f.modifiedAt, f.takenAt,
        f.width, f.height, f.durationMs, f.isScreenshot ? 1 : 0, f.category, f.isSensitive ? 1 : 0,
        f.thumbnailPath, f.error, now, fileId,
      ],
    );
    await removeChunks(db, fileId);
    await db.runAsync('DELETE FROM labels WHERE file_id = ?', [fileId]);
    await db.runAsync('DELETE FROM facts WHERE file_id = ?', [fileId]);
  } else {
    const res = await db.runAsync(
      `INSERT INTO files (path, uri, name, folder, ext, mime, kind, size, modified_at, taken_at,
        width, height, duration_ms, is_screenshot, category, is_sensitive, thumbnail_path, error, indexed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        f.path, f.uri, f.name, f.folder, f.ext, f.mime, f.kind, f.size, f.modifiedAt, f.takenAt,
        f.width, f.height, f.durationMs, f.isScreenshot ? 1 : 0, f.category, f.isSensitive ? 1 : 0,
        f.thumbnailPath, f.error, now,
      ],
    );
    fileId = res.lastInsertRowId;
  }

  for (const c of rows.chunks) {
    const ins = await db.runAsync(
      'INSERT INTO chunks (file_id, kind, page, start_ms, end_ms, text, embedding) VALUES (?,?,?,?,?,?,?)',
      [fileId, c.kind, c.page, c.startMs, c.endMs, c.text, c.embedding],
    );
    const chunkId = ins.lastInsertRowId;
    if (c.text) {
      await db.runAsync('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)', [chunkId, c.text]);
    }
    if (vecAvailable && c.embedding) {
      await db.runAsync('INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)', [chunkId, c.embedding]);
    }
  }
  // A description the person asked for earlier survives re-indexing (as words; the vector comes back with the next Describe).
  if (existing) {
    const kept = await db.getFirstAsync<{ description: string | null }>('SELECT description FROM files WHERE id = ?', [fileId]);
    if (kept?.description) {
      const ins = await db.runAsync('INSERT INTO chunks (file_id, kind, text) VALUES (?,?,?)', [fileId, 'description', kept.description]);
      await db.runAsync('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)', [ins.lastInsertRowId, kept.description]);
    }
  }
  for (const l of rows.labels) {
    await db.runAsync('INSERT INTO labels (file_id, label, confidence) VALUES (?,?,?)', [
      fileId, l.label, l.confidence,
    ]);
  }
  for (const fact of rows.facts) {
    await db.runAsync('INSERT INTO facts (file_id, kind, value_num, value_text, value_date) VALUES (?,?,?,?,?)', [
      fileId,
      fact.kind,
      'valueNum' in fact ? fact.valueNum : null,
      'valueText' in fact ? fact.valueText : null,
      'valueDate' in fact ? fact.valueDate : null,
    ]);
  }
  await db.runAsync(
    `INSERT INTO index_steps (file_id, step, status, error, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(file_id, step) DO UPDATE SET status=excluded.status, error=excluded.error, updated_at=excluded.updated_at`,
    [fileId, 'merge', f.error ? 'error' : 'done', f.error, now],
  );
}

export type MergeResult = { merged: number; deleted: number; failed: number };

// Drains the native inbox into the main DB. Each file is merged inside its own savepoint, so one
// bad file is skipped (and counted) instead of blocking every file behind it.
export async function mergeInbox(): Promise<MergeResult> {
  const database = await getDb();
  let merged = 0;
  let deleted = 0;
  let failed = 0;

  for (;;) {
    const items = await native.drainInbox(DRAIN_BATCH);
    if (items.length === 0) break;
    await database.withTransactionAsync(async () => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const savepoint = `merge_item_${i}`;
        await database.execAsync(`SAVEPOINT ${savepoint}`);
        try {
          await mergeItem(database, item);
          await database.execAsync(`RELEASE ${savepoint}`);
          if (item.op === 'delete') deleted++;
          else merged++;
        } catch (e) {
          await database.execAsync(`ROLLBACK TO ${savepoint}`);
          await database.execAsync(`RELEASE ${savepoint}`);
          failed++;
          console.warn('[merge] skipped', item.path, e instanceof Error ? e.message : e);
        }
      }
    });
    await native.ackInbox(items.map((i) => i.id));
  }
  return { merged, deleted, failed };
}

// Several things ask for a merge (a scan reporting progress, the app starting, a scan ending).
// This runs one at a time, and asks again once if more was requested while it ran.
let running: Promise<void> | null = null;
let again = false;

export function requestMerge(onDone?: (result: MergeResult) => void): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        onDone?.(await mergeInbox());
      } catch (e) {
        console.warn('[merge] failed', e instanceof Error ? e.message : e);
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}
