import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from '@/lib/db/schema';

type Param = string | number | bigint | null | Uint8Array;

// Test helper (not used by the app). It gives Node's built-in SQLite the part of the expo-sqlite API that the
// app uses, so the real schema and queries run in the unit tests. Binding `undefined` throws on purpose:
// a value like that should be `null` in the app.
export function openTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const bind = (params: unknown[] = []): Param[] =>
    params.map((p) => {
      if (p === undefined) throw new Error('A query parameter was undefined; use null');
      return p as Param;
    });

  return {
    async migrate() {
      for (const sql of MIGRATIONS) sqlite.exec(sql);
    },
    async execAsync(sql: string) {
      sqlite.exec(sql);
    },
    async runAsync(sql: string, params: unknown[] = []) {
      const result = sqlite.prepare(sql).run(...bind(params));
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (sqlite.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
