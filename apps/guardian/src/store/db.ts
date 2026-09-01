/**
 * Local persistence. Everything stays on the handset — there is no server in
 * v1, and the absence of one is a feature, not a shortcut: no footage leaves
 * the device because there is nowhere for it to go.
 */
import * as SQLite from 'expo-sqlite';

let handle: SQLite.SQLiteDatabase | null = null;

export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;
  handle = await SQLite.openDatabaseAsync('guardian.db');
  await migrate(handle);
  return handle;
}

async function migrate(d: SQLite.SQLiteDatabase): Promise<void> {
  await d.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      at            INTEGER NOT NULL,
      track_id      INTEGER NOT NULL,
      zone_id       TEXT,
      label         TEXT NOT NULL,
      score         REAL NOT NULL,
      alerted       INTEGER NOT NULL,
      reason        TEXT,
      thumb_uri     TEXT,
      box_json      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_at ON events (at DESC);

    CREATE TABLE IF NOT EXISTS zones (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      armed         INTEGER NOT NULL,
      points_json   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consent (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      accepted_at   INTEGER,
      notice_shown  INTEGER NOT NULL DEFAULT 0,
      version       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key           TEXT PRIMARY KEY,
      value         TEXT NOT NULL
    );
  `);
}

export async function getSetting(key: string): Promise<string | null> {
  const d = await db();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
