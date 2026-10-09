import { categorize, type Category } from '@/lib/enrich/categorize';
import { extractFacts, type Fact } from '@/lib/enrich/facts';
import { detectSensitive } from '@/lib/enrich/sensitive';
import type { InboxItem } from '@/lib/native/contract';
import { float32ToBytes, VECTOR_DIMS } from '@/lib/vector';

export type ChunkRow = {
  kind: string;
  page: number | null;
  startMs: number | null;
  endMs: number | null;
  text: string | null;
  embedding: Uint8Array | null;
};

export type FileRows = {
  file: {
    path: string;
    uri: string;
    name: string;
    folder: string;
    ext: string;
    mime: string;
    kind: string;
    size: number;
    modifiedAt: number;
    takenAt: number | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    isScreenshot: boolean;
    category: Category | null;
    isSensitive: boolean;
    thumbnailPath: string | null;
    error: string | null;
  };
  chunks: ChunkRow[];
  labels: { label: string; confidence: number }[];
  facts: Fact[];
};

function trimVector(vector: number[] | undefined): Uint8Array | null {
  if (!vector || vector.length === 0) return null;
  const f32 = Float32Array.from(vector.slice(0, VECTOR_DIMS));
  let sum = 0;
  for (const v of f32) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < f32.length; i++) f32[i] /= norm;
  return float32ToBytes(f32);
}

export function inboxToRows(item: InboxItem): FileRows {
  const ocrText = item.chunks
    .map((c) => c.text ?? '')
    .filter(Boolean)
    .join('\n');
  const labelNames = item.labels.filter((l) => l.confidence >= 0.6).map((l) => l.label);

  const category = categorize({
    name: item.name,
    folder: item.folder,
    kind: item.kind,
    isScreenshot: item.isScreenshot,
    ocrText,
    labels: labelNames,
  });
  const { sensitive } = detectSensitive(ocrText, item.name);
  const facts = extractFacts(ocrText, item.name);

  // Every file must have at least one text chunk — FTS only indexes chunks, so
  // a file with no extracted text and no labels (e.g. a video) would otherwise
  // be unsearchable even by name.
  const hasText = item.chunks.some((c) => c.text);
  const chunks = [...item.chunks];
  if (!hasText) {
    const basis = [item.name.replace(/[._-]+/g, ' '), ...labelNames].join(' ').trim();
    if (basis) chunks.push({ kind: 'text', text: basis });
  }

  return {
    file: {
      path: item.path,
      uri: item.uri,
      name: item.name,
      folder: item.folder,
      ext: item.ext,
      mime: item.mime,
      kind: item.kind,
      size: item.size,
      modifiedAt: item.modifiedAt,
      takenAt: item.takenAt ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      durationMs: item.durationMs ?? null,
      isScreenshot: item.isScreenshot,
      category,
      isSensitive: sensitive,
      thumbnailPath: item.thumbnailPath ?? null,
      error: item.error ?? null,
    },
    chunks: chunks.map((c) => ({
      kind: c.kind,
      page: c.page ?? null,
      startMs: c.startMs ?? null,
      endMs: c.endMs ?? null,
      text: c.text ?? null,
      embedding: trimVector(c.vector),
    })),
    labels: item.labels,
    facts,
  };
}
