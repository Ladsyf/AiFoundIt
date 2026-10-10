import type { SQLiteDatabase } from 'expo-sqlite';

import type { FileItem } from '@/features/search/types';
import { getDb, vecAvailable } from '@/lib/db/db';
import { fileRowsByIds, rowToItem, tagsFor, type FileRow } from '@/lib/db/files';
import { formatDate } from '@/lib/format';
import { native } from '@/lib/native';
import type { QueryPlan } from '@/lib/search/plan';
import { backgroundOf, standsOut, zScore, type Background } from '@/lib/search/relevance';
import { rrfByFile, type Ranked } from '@/lib/search/rrf';
import { makeSnippet } from '@/lib/search/snippet';
import { buildFtsQuery } from '@/lib/search/tokenize';
import { bytesToFloat32, cosineSimilarity, float32ToBytes } from '@/lib/vector';

const RRF_K = 60;
const TOP_CHUNKS = 50;
const VEC_CANDIDATES = 200;
const FTS_KEEP_OF_BEST = 0.35;
const TOP_FILES = 10;
// A file found only by meaning must stand clear of how similar this query is to the rest of the index
// (see relevance.ts). The fixed limits below only apply to an index too small to measure that.
const VEC_MIN_SIMILARITY = 0.12;
const VEC_KEEP_OF_BEST = 0.6;
const BACKGROUND_SAMPLE = 256;

type Group = 'words' | 'pictures';
type Backgrounds = Record<Group, Background | null>;

const groupOf = (kind: string): Group => (kind === 'image' || kind === 'frame' ? 'pictures' : 'words');

const NO_BACKGROUND: Backgrounds = { words: null, pictures: null };

let sampleCache: { key: string; words: Float32Array[]; pictures: Float32Array[] } | null = null;

async function indexSample(db: SQLiteDatabase) {
  const stamp = await db.getFirstAsync<{ n: number; last: number | null }>(
    'SELECT COUNT(*) AS n, MAX(id) AS last FROM chunks WHERE embedding IS NOT NULL',
  );
  const key = `${stamp?.n ?? 0}:${stamp?.last ?? 0}`;
  if (sampleCache?.key === key) return sampleCache;
  const load = async (kinds: string[]) => {
    const rows = await db.getAllAsync<{ embedding: Uint8Array }>(
      `SELECT embedding FROM chunks WHERE embedding IS NOT NULL AND kind IN (${kinds.map(() => '?').join(',')})
       ORDER BY RANDOM() LIMIT ?`,
      [...kinds, BACKGROUND_SAMPLE],
    );
    return rows.map((r) => bytesToFloat32(r.embedding));
  };
  sampleCache = {
    key,
    words: await load(['text', 'description']),
    pictures: await load(['image', 'frame']),
  };
  return sampleCache;
}

async function backgroundsFor(db: SQLiteDatabase, query: Float32Array): Promise<Backgrounds> {
  try {
    const sample = await indexSample(db);
    const sims = (vectors: Float32Array[]) => vectors.map((v) => cosineSimilarity(query, v));
    return { words: backgroundOf(sims(sample.words)), pictures: backgroundOf(sims(sample.pictures)) };
  } catch {
    return NO_BACKGROUND;
  }
}

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
    const strongest = rows.length > 0 ? -rows[0].score : 0;
    const strong = rows.filter((r) => -r.score >= strongest * FTS_KEEP_OF_BEST);
    const list: RankedList = new Map();
    strong.forEach((r, i) => list.set(r.chunkId, { chunk: r, rank: i + 1 }));
    return list;
  } catch {
    return new Map();
  }
}

async function embedQuery(plan: QueryPlan): Promise<Float32Array | null> {
  try {
    return Float32Array.from(await native.embedText(plan.queryEn || plan.terms.join(' ')));
  } catch {
    return null;
  }
}

type VecHit = { chunk: ChunkHit; distance: number };

async function vecCandidates(query: Float32Array): Promise<VecHit[]> {
  const db = await getDb();
  if (vecAvailable) {
    try {
      const rows = await db.getAllAsync<{ chunkId: number; distance: number }>(
        `SELECT rowid AS chunkId, distance FROM chunks_vec WHERE embedding MATCH ? AND k = ?`,
        [float32ToBytes(query), VEC_CANDIDATES],
      );
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.chunkId);
      const marks = ids.map(() => '?').join(',');
      const chunks = await db.getAllAsync<ChunkHit>(
        `SELECT id AS chunkId, file_id AS fileId, kind, text, page, start_ms AS startMs, end_ms AS endMs
         FROM chunks WHERE id IN (${marks})`,
        ids,
      );
      const byId = new Map(chunks.map((c) => [c.chunkId, c]));
      return rows.flatMap((r) => {
        const chunk = byId.get(r.chunkId);
        return chunk ? [{ chunk, distance: r.distance }] : [];
      });
    } catch {
      // fall through to brute force
    }
  }

  const rows = await db.getAllAsync<ChunkHit & { embedding: Uint8Array | null }>(
    `SELECT id AS chunkId, file_id AS fileId, kind, text, page, start_ms AS startMs, end_ms AS endMs, embedding
     FROM chunks WHERE embedding IS NOT NULL`,
  );
  return rows
    .map((r) => ({ chunk: r as ChunkHit, sim: r.embedding ? cosineSimilarity(query, bytesToFloat32(r.embedding)) : 0 }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, VEC_CANDIDATES)
    .map((s) => ({ chunk: s.chunk, distance: 1 - s.sim }));
}

type Judged = VecHit & { sim: number; z: number | null };

// Keeps only the chunks that are really about the question. Words and pictures score on different scales, so each
// is judged against its own background and ranked by how far it stands above it.
function selectByMeaning(candidates: VecHit[], background: Backgrounds): { list: RankedList; judged: Judged[] } {
  const judged: Judged[] = candidates.map((h) => {
    const sim = 1 - h.distance;
    const bg = background[groupOf(h.chunk.kind)];
    return { ...h, sim, z: bg ? zScore(sim, bg) : null };
  });
  const measured = judged.filter((h): h is Judged & { z: number } => h.z !== null).sort((a, b) => b.z - a.z);
  const bestZ = measured[0]?.z ?? -Infinity;
  const unmeasured = judged.filter((h) => h.z === null && h.sim >= VEC_MIN_SIMILARITY).sort((a, b) => b.sim - a.sim);
  const bestUnmeasured = unmeasured[0]?.sim ?? 0;

  const kept = [
    ...measured.filter((h) => standsOut(h.z, bestZ)),
    ...unmeasured.filter((h) => h.sim >= bestUnmeasured * VEC_KEEP_OF_BEST),
  ].slice(0, TOP_CHUNKS);
  const list: RankedList = new Map();
  kept.forEach((h, i) => list.set(h.chunk.chunkId, { chunk: h.chunk, rank: i + 1, distance: h.distance }));
  return { list, judged: [...measured, ...unmeasured] };
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

// Lists the files that pass the plan's filters (kind, screenshot, dates, category), newest first.
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
  // A question with no words to match ("screenshots", "photos from last week") is only a filter, so list the
  // files that pass it, newest first. Ranking by meaning would hand back unrelated files for such a question.
  if (plan.terms.length === 0) {
    const browsed = await browseFallback(plan);
    if (browsed.length > 0) return browsed;
  }

  const db = await getDb();
  const [fts, query] = await Promise.all([ftsRank(plan), embedQuery(plan)]);
  const candidates = query ? await vecCandidates(query) : [];
  const background = query ? await backgroundsFor(db, query) : NO_BACKGROUND;
  const { list: vec, judged } = selectByMeaning(candidates, background);

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

  if (__DEV__) {
    const top = judged
      .slice(0, 12)
      .map((h) => `${h.chunk.kind[0]}${h.sim.toFixed(3)}/${h.z === null ? '?' : h.z.toFixed(1)}`)
      .join(' ');
    const bg = (b: Background | null) => (b ? `${b.mean.toFixed(3)}±${b.std.toFixed(3)}` : 'none');
    console.log(
      `[search] "${plan.queryEn}" keyword hits ${fts.size}, kept by meaning ${vec.size}, background words ${bg(background.words)} pictures ${bg(background.pictures)}, top sim/z: ${top}`,
    );
  }

  // Words were asked for and nothing matched them: say so, instead of listing files that merely pass a filter.
  if (files.size === 0) return [];

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
