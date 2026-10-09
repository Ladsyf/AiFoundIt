import type { FileItem } from '@/features/search/types';
import { getDb, vecAvailable } from '@/lib/db/db';
import { generateText } from '@/lib/llm';
import { native } from '@/lib/native';
import { VECTOR_DIMS, float32ToBytes, l2normalize } from '@/lib/vector';

const PROMPT =
  'Describe this photo in one or two plain sentences. If it shows a receipt, an ID, a document or a message, ' +
  'say what it is and give the main details you can read. Do not guess names.';

/**
 * Asks the chat model to look at a photo. What it says is kept with the file and added to the search
 * index (as words and as a vector), so the photo can be found by that description later.
 * Returns null when there is no chat model that can see pictures, or it did not answer in time.
 */
export async function describeFile(file: FileItem): Promise<string | null> {
  if (file.kind !== 'image') return null;
  const outcome = await generateText(
    { prompt: PROMPT, imagePath: file.path, maxTokens: 160, temperature: 0.2 },
    { timeoutMs: 60_000 },
  );
  if (!outcome.ok) return null;
  const text = outcome.text.trim();
  if (!text) return null;
  await saveDescription(Number(file.id), text);
  return text;
}

async function saveDescription(fileId: number, text: string): Promise<void> {
  const db = await getDb();

  let embedding: Uint8Array | null = null;
  try {
    const vector = Float32Array.from(await native.embedText(text)).slice(0, VECTOR_DIMS);
    embedding = float32ToBytes(l2normalize(vector));
  } catch {
    // No search model loaded: the description is still searchable as words.
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE files SET description = ? WHERE id = ?', [text, fileId]);
    const old = await db.getAllAsync<{ id: number; text: string | null }>(
      "SELECT id, text FROM chunks WHERE file_id = ? AND kind = 'description'",
      [fileId],
    );
    for (const c of old) {
      await db.runAsync('INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES (?, ?, ?)', ['delete', c.id, c.text ?? '']);
      if (vecAvailable) await db.runAsync('DELETE FROM chunks_vec WHERE rowid = ?', [c.id]);
    }
    await db.runAsync("DELETE FROM chunks WHERE file_id = ? AND kind = 'description'", [fileId]);

    const inserted = await db.runAsync('INSERT INTO chunks (file_id, kind, text, embedding) VALUES (?,?,?,?)', [
      fileId,
      'description',
      text,
      embedding,
    ]);
    await db.runAsync('INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)', [inserted.lastInsertRowId, text]);
    if (vecAvailable && embedding) {
      await db.runAsync('INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)', [inserted.lastInsertRowId, embedding]);
    }
  });
}
