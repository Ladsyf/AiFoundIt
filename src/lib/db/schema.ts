export const SCHEMA_VERSION = 1;

// chunks_vec is created separately in db.ts, only when sqlite-vec loads.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    uri TEXT,
    name TEXT,
    folder TEXT,
    ext TEXT,
    mime TEXT,
    kind TEXT,
    size INTEGER,
    modified_at INTEGER,
    taken_at INTEGER,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    is_screenshot INTEGER DEFAULT 0,
    category TEXT,
    is_sensitive INTEGER DEFAULT 0,
    description TEXT,
    thumbnail_path TEXT,
    error TEXT,
    indexed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS index_steps (
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    step TEXT,
    status TEXT,
    error TEXT,
    model TEXT,
    updated_at INTEGER,
    PRIMARY KEY (file_id, step)
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    kind TEXT,
    page INTEGER,
    start_ms INTEGER,
    end_ms INTEGER,
    text TEXT,
    embedding BLOB
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    content='chunks',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );

  CREATE TABLE IF NOT EXISTS labels (
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    label TEXT,
    confidence REAL
  );

  CREATE TABLE IF NOT EXISTS facts (
    file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
    kind TEXT,
    value_num REAL,
    value_text TEXT,
    value_date INTEGER
  );

  CREATE TABLE IF NOT EXISTS scan_rules (
    id INTEGER PRIMARY KEY,
    path TEXT,
    mode TEXT,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    role TEXT,
    provider TEXT,
    file_path TEXT,
    size INTEGER,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS actions_log (
    id INTEGER PRIMARY KEY,
    batch_id TEXT,
    action TEXT,
    status TEXT,
    from_path TEXT,
    to_path TEXT,
    created_at INTEGER,
    undone INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS chunks_file ON chunks(file_id);
  CREATE INDEX IF NOT EXISTS files_category ON files(category);
  CREATE INDEX IF NOT EXISTS files_modified ON files(modified_at);
  CREATE INDEX IF NOT EXISTS labels_file ON labels(file_id);
  CREATE INDEX IF NOT EXISTS facts_file ON facts(file_id);
  `,
];
