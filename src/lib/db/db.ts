import * as SQLite from 'expo-sqlite';

import { MIGRATIONS, SCHEMA_VERSION } from '@/lib/db/schema';
import { VECTOR_DIMS } from '@/lib/vector';

export const DB_NAME = 'aifoundit.db';

// Vectors are normalized, so cosine distance (1 - similarity) is the natural measure. The first version
// of the table used the library default (L2 distance), which the search thresholds do not expect;
// a table made that way is rebuilt from the vectors kept on the chunks.
const VEC_METRIC = 'cosine';
const VEC_METRIC_KEY = 'vec.metric';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;
export let vecAvailable = false;

async function migrate(database: SQLite.SQLiteDatabase) {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < SCHEMA_VERSION && v < MIGRATIONS.length; v++) {
    await database.execAsync(MIGRATIONS[v]);
  }
  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function ensureVecTable(database: SQLite.SQLiteDatabase) {
  const table = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'chunks_vec'",
  );
  const current = await database.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [VEC_METRIC_KEY]);
  const exists = (table?.n ?? 0) > 0;
  if (exists && current?.value === VEC_METRIC) return;

  if (exists) await database.execAsync('DROP TABLE chunks_vec');
  await database.execAsync(
    `CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[${VECTOR_DIMS}] distance_metric=${VEC_METRIC})`,
  );

  const rows = await database.getAllAsync<{ id: number; embedding: Uint8Array }>(
    'SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL',
  );
  if (rows.length > 0) {
    await database.withTransactionAsync(async () => {
      for (const r of rows) {
        try {
          await database.runAsync('INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)', [r.id, r.embedding]);
        } catch {
          // A vector of the wrong size is skipped; the file is still found by its text.
        }
      }
    });
  }
  await database.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [VEC_METRIC_KEY, VEC_METRIC]);
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  try {
    const ext = SQLite.bundledExtensions['sqlite-vec'];
    if (ext?.libPath) {
      await database.loadExtensionAsync(ext.libPath, ext.entryPoint);
      vecAvailable = true;
    }
  } catch {
    vecAvailable = false;
  }

  await migrate(database);

  if (vecAvailable) {
    try {
      await ensureVecTable(database);
    } catch {
      // Without the vector table, search uses plain cosine over the stored vectors instead.
      vecAvailable = false;
    }
  }
  return database;
}

// Callers share one opening, so two things starting at once never open the file twice.
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = openDatabase().catch((e) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}

// For tests.
export async function closeDb() {
  const database = await opening?.catch(() => null);
  opening = null;
  await database?.closeAsync();
}
