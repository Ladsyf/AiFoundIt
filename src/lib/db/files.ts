import type { SQLiteDatabase } from 'expo-sqlite';

import type { FileItem, FilePreview } from '@/features/search/types';
import { getDb } from '@/lib/db/db';
import { formatBytes, toIsoDate } from '@/lib/format';
import type { FileKind } from '@/lib/native/contract';

export type FileRow = {
  id: number;
  path: string;
  uri: string;
  name: string;
  folder: string;
  ext: string;
  mime: string;
  kind: FileKind;
  size: number;
  modified_at: number;
  taken_at: number | null;
  duration_ms: number | null;
  is_screenshot: number;
  category: string | null;
  is_sensitive: number;
  description: string | null;
  thumbnail_path: string | null;
};

export function previewFor(row: FileRow, snippetLines?: string[]): FilePreview {
  switch (row.kind) {
    case 'image':
      return { kind: 'image', thumbnailPath: row.thumbnail_path ?? undefined };
    case 'video':
      return { kind: 'video', thumbnailPath: row.thumbnail_path ?? undefined, durationMs: row.duration_ms ?? undefined };
    case 'audio':
      return { kind: 'audio', durationMs: row.duration_ms ?? undefined };
    default:
      return {
        kind: 'document',
        title: row.name.replace(/\.[^.]+$/, ''),
        lines: snippetLines?.length ? snippetLines : row.description ? [row.description] : [row.folder],
      };
  }
}

export function rowToItem(
  row: FileRow,
  opts: { tags?: string[]; snippet?: string; highlights?: [number, number][]; page?: number; startMs?: number } = {},
): FileItem {
  const when = row.taken_at ?? row.modified_at;
  return {
    id: String(row.id),
    name: row.name,
    kind: row.kind,
    category: row.category,
    folder: row.folder.replace(/^\/storage\/emulated\/\d+\//, ''),
    savedAt: toIsoDate(when),
    size: formatBytes(row.size),
    sizeBytes: row.size,
    tags: opts.tags ?? [],
    preview: previewFor(row, opts.snippet ? [opts.snippet] : undefined),
    path: row.path,
    uri: row.uri,
    mime: row.mime,
    thumbnailPath: row.thumbnail_path ?? undefined,
    snippet: opts.snippet,
    highlights: opts.highlights,
    page: opts.page,
    startMs: opts.startMs,
    durationMs: row.duration_ms ?? undefined,
    isSensitive: row.is_sensitive === 1,
  };
}

export async function fileRowsByIds(db: SQLiteDatabase, ids: number[]): Promise<FileRow[]> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  return db.getAllAsync<FileRow>(`SELECT * FROM files WHERE id IN (${marks})`, ids);
}

export async function fileRowById(db: SQLiteDatabase, id: number): Promise<FileRow | null> {
  return db.getFirstAsync<FileRow>('SELECT * FROM files WHERE id = ?', [id]);
}

export async function tagsFor(db: SQLiteDatabase, fileIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (fileIds.length === 0) return map;
  const marks = fileIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ file_id: number; label: string }>(
    `SELECT file_id, label FROM labels WHERE file_id IN (${marks}) AND confidence >= 0.6 ORDER BY confidence DESC`,
    fileIds,
  );
  for (const r of rows) {
    const list = map.get(r.file_id) ?? [];
    if (list.length < 6) list.push(r.label);
    map.set(r.file_id, list);
  }
  return map;
}

export async function getMetaValue(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMetaValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function countFiles(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM files');
  return row?.n ?? 0;
}

export async function indexSizeBytes(): Promise<number> {
  const db = await getDb();
  const pageCount = await db.getFirstAsync<{ n: number }>('PRAGMA page_count');
  const pageSize = await db.getFirstAsync<{ n: number }>('PRAGMA page_size');
  return (pageCount?.n ?? 0) * (pageSize?.n ?? 0);
}

export async function deleteIndex(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM files;
    DELETE FROM chunks_fts;
    DELETE FROM labels;
    DELETE FROM facts;
    DELETE FROM index_steps;
  `);
}
