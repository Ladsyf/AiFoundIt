import type { FileItem } from '@/features/search/types';
import { getDb, vecAvailable } from '@/lib/db/db';
import { fileRowsByIds, rowToItem, tagsFor, type FileRow } from '@/lib/db/files';
import { formatDate } from '@/lib/format';
import { native } from '@/lib/native';
import type { QueryPlan } from '@/lib/search/plan';
import { rrfByFile, type Ranked } from '@/lib/search/rrf';
import { makeSnippet } from '@/lib/search/snippet';
import { buildFtsQuery } from '@/lib/search/tokenize';
import { bytesToFloat32, cosineSimilarity, float32ToBytes } from '@/lib/vector';

const RRF_K = 60;
const TOP_CHUNKS = 50;
const TOP_FILES = 10;
const VEC_MIN_SIMILARITY = 0.12;

export type RetrievedFile = {
  item: FileItem;
  score: number;
  reason: string;
};

type ChunkHit = {
  chunkId: number;
  fileId: number;
  kind: string;
  text: string | null;
  page: number | null;
  startMs: number | null;
  endMs: number | null;
};

type RankedList = Map<number, { chunk: ChunkHit; rank: number; distance?: number }>;

async function ftsRank(plan: QueryPlan): Promise<RankedList> {
  const db = await getDb();
  const match = buildFtsQuery(plan.terms);
  if (!match) return new Map();
  try {
    const rows = await db.getAllAsync<ChunkHit & { score: number }>(
      `SELECT c.id AS chunkId, c.file_id AS fileId, c.kind, c.text, c.page, c.start_ms AS startMs, c.end_ms AS endMs,
              bm25(chunks_fts) AS score
       FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
       WHERE chunks_fts MATCH ?
       ORDER BY score LIMIT ?`,
      [match, TOP_CHUNKS],
    );
    const list: RankedList = new Map();
    rows.forEach((r, i) => list.set(r.chunkId, { chunk: r, rank: i + 1 }));
    return list;
  } catch {
    return new Map();
  }
}

async function vecRank(plan: QueryPlan): Promise<RankedList> {
  const db = await getDb();
  let query: Float32Array;
  try {
    query = Float32Array.from(await native.embedText(plan.queryEn || plan.terms.join(' ')));
  } catch {
    return new Map();
  }

  const list: RankedList = new Map();
  if (vecAvailable) {
    try {
      const rows = await db.getAllAsync<{ chunkId: number; distance: number }>(
        `SELECT rowid AS chunkId, distance FROM chunks_vec WHERE embedding MATCH ? AND k = ?`,
        [float32ToBytes(query), TOP_CHUNKS],
      );
      if (rows.length === 0) return list;
      const ids = rows.map((r) => r.chunkId);
      const marks = ids.map(() => '?').join(',');
      const chunks = await db.getAllAsync<ChunkHit>(
        `SELECT id AS chunkId, file_id AS fileId, kind, text, page, start_ms AS startMs, end_ms AS endMs
         FROM chunks WHERE id IN (${marks})`,
        ids,
      );
      const byId = new Map(chunks.map((c) => [c.chunkId, c]));
      rows.forEach((r, i) => {
        const chunk = byId.get(r.chunkId);
        if (chunk) list.set(r.chunkId, { chunk, rank: i + 1, distance: r.distance });
      });
      return list;
    } catch {
      // fall through to brute force
    }
  }

  const rows = await db.getAllAsync<ChunkHit & { embedding: Uint8Array | null }>(
    `SELECT id AS chunkId, file_id AS fileId, kind, text, page, start_ms AS startMs, end_ms AS endMs, embedding
     FROM chunks WHERE embedding IS NOT NULL`,
  );
  const scored = rows
    .map((r) => ({ r, sim: r.embedding ? cosineSimilarity(query, bytesToFloat32(r.embedding)) : 0 }))
    .filter((s) => s.sim > VEC_MIN_SIMILARITY)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, TOP_CHUNKS);
  scored.forEach((s, i) => list.set(s.r.chunkId, { chunk: s.r, rank: i + 1, distance: 1 - s.sim }));
  return list;
}

function passesFilters(row: FileRow, plan: QueryPlan): boolean {
  if (plan.kinds && plan.kinds.length > 0 && !plan.kinds.includes(row.kind)) return false;
  if (plan.screenshot && row.is_screenshot !== 1) return false;
  const when = row.taken_at ?? row.modified_at;
  if (plan.dateFrom !== undefined && when < plan.dateFrom) return false;
  if (plan.dateTo !== undefined && when >= plan.dateTo) return false;
  if (plan.category && row.category !== plan.category) return false;
  if (row.is_sensitive === 1 && !plan.includeSensitive) return false;
  return true;
}

// Queries that are pure filters ("screenshots", "photos from last week") produce
// no FTS terms, so ranked retrieval comes back empty — browse files directly.
async function browseFallback(plan: QueryPlan): Promise<RetrievedFile[]> {
  const conds: string[] = [];
  const args: (string | number)[] = [];
  if (plan.kinds && plan.kinds.length > 0) {
    conds.push(`kind IN (${plan.kinds.map(() => '?').join(',')})`);
    args.push(...plan.kinds);
  }
  if (plan.screenshot) conds.push('is_screenshot = 1');
  if (plan.dateFrom !== undefined) {
    conds.push('COALESCE(taken_at, modified_at) >= ?');
    args.push(plan.dateFrom);
  }
  if (plan.dateTo !== undefined) {
    conds.push('COALESCE(taken_at, modified_at) < ?');
    args.push(plan.dateTo);
  }
  if (plan.category) {
    conds.push('category = ?');
    args.push(plan.category);
  }
  if (!plan.includeSensitive) conds.push('is_sensitive = 0');
  if (conds.length === 0) return [];

  const db = await getDb();
  const rows = await db.getAllAsync<FileRow>(
    `SELECT * FROM files WHERE ${conds.join(' AND ')} ORDER BY COALESCE(taken_at, modified_at) DESC LIMIT ?`,
    [...args, TOP_FILES],
  );
  const tagMap = await tagsFor(db, rows.map((r) => r.id));
  return rows.map((row) => {
    const tags = tagMap.get(row.id) ?? [];
    return {
      item: rowToItem(row, { tags }),
      score: 0,
      reason: reasonFor(row, null, undefined, tags, plan),
    };
  });
}

export async function retrieve(plan: QueryPlan): Promise<RetrievedFile[]> {
  const db = await getDb();
  const [fts, vec] = await Promise.all([ftsRank(plan), vecRank(plan)]);

  // RRF by file: best chunk rank per list, summed.
  const toRanked = (list: RankedList): Ranked[] =>
    [...list.values()].map(({ chunk, rank, distance }) => ({
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      rank,
      distance,
    }));
  const fused = rrfByFile([toRanked(fts), toRanked(vec)], RRF_K);

  const chunkById = new Map<number, ChunkHit>();
  for (const { chunk } of [...fts.values(), ...vec.values()]) chunkById.set(chunk.chunkId, chunk);
  const files = new Map<number, { score: number; best: ChunkHit; distance?: number }>();
  for (const [fileId, fs] of fused) {
    const best = chunkById.get(fs.bestChunkId);
    if (best) files.set(fileId, { score: fs.score, best, distance: fs.distance });
  }

  if (files.size === 0) return browseFallback(plan);

  const rows = new Map((await fileRowsByIds(db, [...files.keys()])).map((r) => [r.id, r]));
  const lower = plan.terms;

  const scored = [...files.entries()]
    .filter(([id]) => {
      const row = rows.get(id);
      return row && passesFilters(row, plan);
    })
    .map(([id, entry]) => {
      const row = rows.get(id)!;
      let score = entry.score;
      const hay = `${row.name} ${row.folder}`.toLowerCase();
      if (lower.some((t) => hay.includes(t))) score += 0.012;
      if (plan.category && row.category === plan.category) score += 0.006;
      const ageDays = (Date.now() - (row.taken_at ?? row.modified_at)) / 86_400_000;
      score += 0.004 * Math.exp(-ageDays / 90);
      return { id, row, entry, score };
    })
    .filter(({ entry }) => fts.has(entry.best.chunkId) || (entry.distance !== undefined && entry.distance < 0.88))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_FILES);

  const tagMap = await tagsFor(db, scored.map((s) => s.id));

  return scored.map(({ id, row, entry }) => {
    const tags = tagMap.get(id) ?? [];
    const best = entry.best;
    const snippet = best.text ? makeSnippet(best.text, plan.terms) : undefined;
    const reason = reasonFor(row, best, snippet?.text, tags, plan);
    return {
      item: rowToItem(row, {
        tags,
        snippet: snippet?.text,
        highlights: snippet?.ranges,
        page: best.page ?? undefined,
        startMs: best.startMs ?? undefined,
      }),
      score: entry.score,
      reason,
    };
  });
}

function reasonFor(
  row: FileRow,
  best: ChunkHit | null,
  snippetText: string | undefined,
  tags: string[],
  plan: QueryPlan,
): string {
  if (snippetText && best) {
    const where = best.page ? `Page ${best.page}` : best.startMs !== null ? `At ${Math.round((best.startMs ?? 0) / 1000)}s` : null;
    const lead = where ? `${where} · ` : '';
    return `${lead}“${snippetText}”`;
  }
  if (tags.length > 0) return `Recognized in the image: ${tags.slice(0, 3).join(', ')}`;
  if (plan.category && row.category === plan.category) return `Tagged as ${plan.category}`;
  return `Saved on ${formatDate((row.taken_at ?? row.modified_at) ? new Date(row.taken_at ?? row.modified_at).toISOString().slice(0, 10) : '')}`;
}
