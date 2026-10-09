import type { SQLiteBindValue } from 'expo-sqlite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getDb } from '@/lib/db/db';
import { indexSizeBytes } from '@/lib/db/files';
import { deleteIndex, removeExcludedFromIndex } from '@/lib/db/maintenance';
import { mergeInbox } from '@/lib/db/merge';
import { glanceCounts } from '@/lib/intents/glance';
import { buildMovePlan, runPlan, sensitiveFiles, summarizeResults, undoBatch } from '@/lib/intents/organize';
import { receiptTotal } from '@/lib/intents/totals';
import { native } from '@/lib/native';
import { demoCorpus } from '@/lib/native/mock-corpus';
import { heuristicPlan } from '@/lib/search/plan';
import { retrieve } from '@/lib/search/retrieve';

// The real schema and queries run on Node's built-in SQLite. Vectors use the JavaScript fallback
// (sqlite-vec is not available here), and the native scanner is the demo-corpus mock.
// (vi.mock calls are moved above the imports by Vitest.)
vi.mock('@/lib/db/db', async () => {
  const { openTestDb } = await import('@/lib/db/test-db');
  const db = openTestDb();
  await db.migrate();
  return { getDb: async () => db, vecAvailable: false };
});

vi.mock('@/lib/native', async () => {
  const { createMockNative } = await import('@/lib/native/mock');
  const native = createMockNative();
  return { native, isMockNative: true, addNativeListener: native.addListener, mockControls: native.__mock };
});

const count = async (sql: string, params: SQLiteBindValue[] = []) => {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>(sql, params))?.n ?? 0;
};

// Only chunks with words are in the keyword index, and its ranking must know exactly how many there are:
// telling it to forget a chunk it never held lowers that number, and with enough of those the ranking breaks.
async function expectKeywordIndexInSync() {
  const db = await getDb();
  await db.execAsync("INSERT INTO chunks_fts(chunks_fts) VALUES('integrity-check')");
  const withWords = await count("SELECT COUNT(*) AS n FROM chunks WHERE text IS NOT NULL AND text <> ''");
  expect(await count('SELECT COUNT(*) AS n FROM chunks_fts_docsize')).toBe(withWords);
  const averages = await db.getFirstAsync<{ block: Uint8Array }>('SELECT block FROM chunks_fts_data WHERE id = 1');
  // The first byte of this record is the document count the ranking uses (a single-byte number below 128).
  expect(withWords).toBeLessThan(128);
  expect(averages?.block[0]).toBe(withWords);
}

async function scanAndMerge() {
  vi.useFakeTimers();
  const scan = native.runScanNow();
  await vi.runAllTimersAsync();
  await scan;
  vi.useRealTimers();
  return mergeInbox();
}

beforeAll(async () => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  await scanAndMerge();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('merging the scan into the database', () => {
  it('keeps every file, with its words, tags and facts', async () => {
    expect(await count('SELECT COUNT(*) AS n FROM files')).toBe(demoCorpus().length);
    expect(await count('SELECT COUNT(*) AS n FROM chunks')).toBeGreaterThan(demoCorpus().length - 1);
    expect(await count('SELECT COUNT(*) AS n FROM labels')).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) AS n FROM facts WHERE kind = 'total'")).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'jollibee'")).toBeGreaterThan(0);
    await expectKeywordIndexInSync();
    expect(await indexSizeBytes()).toBeGreaterThan(0);
  });

  it('scans nothing new the second time', async () => {
    const again = await scanAndMerge();
    expect(again).toEqual({ merged: 0, deleted: 0, failed: 0 });
  });

  it('replaces the words of a file that changed and keeps a description the person asked for', async () => {
    const db = await getDb();
    const file = await db.getFirstAsync<{ id: number; path: string }>("SELECT id, path FROM files WHERE name LIKE '%beach%'");
    expect(file).not.toBeNull();
    await db.runAsync('UPDATE files SET description = ? WHERE id = ?', ['A quiet beach at sunset', file!.id]);

    const original = demoCorpus().find((f) => f.path === file!.path)!;
    (native as unknown as { __mock: { addFile(f: unknown): void } }).__mock.addFile({
      ...original,
      size: original.size + 1,
      chunks: [{ kind: 'text', text: 'new words about kayaks' }],
    });
    const result = await scanAndMerge();
    expect(result.merged).toBe(1);

    expect(await count('SELECT COUNT(*) AS n FROM files')).toBe(demoCorpus().length);
    expect(await count("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'kayaks'")).toBe(1);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
         WHERE chunks_fts MATCH 'sunset' AND c.file_id = ?`,
        [file!.id],
      ),
    ).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM chunks WHERE file_id = ? AND kind = 'description'", [file!.id])).toBe(1);
    await expectKeywordIndexInSync();
  });
});

describe('searching', () => {
  it('finds the Jollibee receipt for a Taglish question', async () => {
    const results = await retrieve(heuristicPlan('Nasaan yung resibo ko sa Jollibee?'));
    expect(results.length).toBeGreaterThan(0);
    const top = results.slice(0, 3).map((r) => r.item.snippet ?? '');
    expect(top.some((s) => /jollibee/i.test(s))).toBe(true);
  });

  it('finds a photo by what the camera app recognized in it', async () => {
    const results = await retrieve(heuristicPlan('beach photo'));
    expect(results.some((r) => /beach/i.test(r.item.name))).toBe(true);
  });

  it('still works by keywords alone when there is no search model, and finds nothing for nonsense', async () => {
    const noModel = vi.spyOn(native, 'embedText').mockRejectedValue(new Error('no search model'));
    try {
      expect(await retrieve(heuristicPlan('asdkfj qwerty zzz'))).toEqual([]);
      const results = await retrieve(heuristicPlan('jollibee'));
      expect(results.length).toBeGreaterThan(0);
    } finally {
      noModel.mockRestore();
    }
  });

  it('says nothing was found when a kind word comes with words that match nothing', async () => {
    const noModel = vi.spyOn(native, 'embedText').mockRejectedValue(new Error('no search model'));
    try {
      expect(await retrieve(heuristicPlan('xyzzy photos'))).toEqual([]);
    } finally {
      noModel.mockRestore();
    }
  });

  it('browses by kind when the question has no words to match', async () => {
    const results = await retrieve(heuristicPlan('screenshots'));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.item.kind === 'image')).toBe(true);
  });
});

describe('receipt totals', () => {
  it('adds up this week’s GCash receipts in code', async () => {
    const week = { dateFrom: Date.parse('2026-10-05T00:00:00'), dateTo: Date.parse('2026-10-11T00:00:00') };
    const { total } = await receiptTotal({ merchant: 'gcash', ...week });
    expect(total.amount).toBe(2095);
    expect(total.count).toBe(3);
  });

  it('counts category tiles for the home screen', async () => {
    const tiles = await glanceCounts();
    expect(tiles.some((t) => t.key === 'receipt' && t.count > 0)).toBe(true);
  });
});

describe('organizing', () => {
  it('moves receipts into a new folder, records it, and brings them back on undo', async () => {
    const db = await getDb();
    const receipts = (await retrieve(heuristicPlan('receipts'))).map((r) => r.item);
    expect(receipts.length).toBeGreaterThan(1);

    const plan = buildMovePlan(receipts, 'Documents/Receipts');
    const ran = await runPlan(plan, 'batch-1');
    expect(summarizeResults(ran)).toEqual({ moved: receipts.length, failed: 0, firstError: undefined });
    for (const file of receipts) {
      const row = await db.getFirstAsync<{ path: string; folder: string }>('SELECT path, folder FROM files WHERE id = ?', [
        Number(file.id),
      ]);
      expect(row?.path).toMatch(/^\/storage\/emulated\/0\/Documents\/Receipts\//);
      expect(row?.folder).toBe('/Documents/Receipts');
    }
    // The first operation makes the folder; every other one is a move that was logged.
    expect(await count("SELECT COUNT(*) AS n FROM actions_log WHERE batch_id = 'batch-1' AND status = 'done'")).toBe(
      receipts.length + 1,
    );

    const undone = await undoBatch('batch-1', ran);
    expect(undone.every((r) => r.ok)).toBe(true);
    for (const file of receipts) {
      const row = await db.getFirstAsync<{ path: string }>('SELECT path FROM files WHERE id = ?', [Number(file.id)]);
      expect(row?.path).toBe(file.path);
    }
    expect(await count("SELECT COUNT(*) AS n FROM actions_log WHERE batch_id = 'batch-1' AND undone = 1")).toBeGreaterThan(0);
  });

  it('lists the files that look like IDs for the privacy question', async () => {
    const sensitive = await sensitiveFiles();
    expect(sensitive.length).toBeGreaterThan(0);
    expect(sensitive.every((f) => f.isSensitive)).toBe(true);
  });
});

describe('removing files', () => {
  it('hides a skipped folder right away and leaves the search index consistent', async () => {
    const inFolder = await count("SELECT COUNT(*) AS n FROM files WHERE folder LIKE '%Pictures/Screenshots'");
    expect(inFolder).toBeGreaterThan(0);

    const removed = await removeExcludedFromIndex(['Screenshots']);
    expect(removed).toBe(inFolder);

    expect(await count("SELECT COUNT(*) AS n FROM files WHERE folder LIKE '%Pictures/Screenshots'")).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM chunks WHERE file_id NOT IN (SELECT id FROM files)')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM labels WHERE file_id NOT IN (SELECT id FROM files)')).toBe(0);
    await expectKeywordIndexInSync();
  });

  it('empties the index and makes the scanner forget what it saw', async () => {
    await deleteIndex();
    expect(await count('SELECT COUNT(*) AS n FROM files')).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM chunks')).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'jollibee'")).toBe(0);

    const rebuilt = await scanAndMerge();
    expect(rebuilt.merged).toBe(demoCorpus().length);
  });
});
