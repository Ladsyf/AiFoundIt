import * as SQLite from 'expo-sqlite';

import { MIGRATIONS, SCHEMA_VERSION } from '@/lib/db/schema';
import { VECTOR_DIMS } from '@/lib/vector';

export const DB_NAME = 'aifoundit.db';

let db: SQLite.SQLiteDatabase | null = null;
export let vecAvailable = false;

async function migrate(database: SQLite.SQLiteDatabase) {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < SCHEMA_VERSION && v < MIGRATIONS.length; v++) {
    await database.execAsync(MIGRATIONS[v]);
  }
  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
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
      await database.execAsync(
        `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[${VECTOR_DIMS}])`,
      );
    } catch {
      vecAvailable = false;
    }
  }

  db = database;
  return database;
}

// For tests and for Delete index in Settings.
export async function closeDb() {
  await db?.closeAsync();
  db = null;
}
