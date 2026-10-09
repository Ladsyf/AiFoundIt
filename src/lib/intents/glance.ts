import { getDb } from '@/lib/db/db';

export type GlanceTile = { key: string; label: string; count: number };

const TILE_LABEL: Record<string, string> = {
  receipt: 'Receipts',
  id: 'IDs',
  school: 'School',
  work: 'Work',
  screenshot: 'Screenshots',
  meme: 'Memes',
  document: 'Documents',
};

export async function glanceCounts(): Promise<GlanceTile[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category: string | null; n: number }>(
    'SELECT category, COUNT(*) AS n FROM files GROUP BY category ORDER BY n DESC',
  );
  const tiles = rows
    .filter((r) => r.category && TILE_LABEL[r.category])
    .map((r) => ({ key: r.category!, label: TILE_LABEL[r.category!], count: r.n }));
  const photos = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM files WHERE kind = 'image' AND is_screenshot = 0",
  );
  if (photos && photos.n > 0) tiles.splice(Math.min(2, tiles.length), 0, { key: 'photo', label: 'Photos', count: photos.n });
  return tiles;
}
