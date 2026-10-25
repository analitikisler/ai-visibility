// Database access layer. Import from here; don't fork it.
// Uses Node's built-in SQLite (node:sqlite, Node >= 22.13) so there are zero native deps.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(here, '../../data'));
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'app.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
// Wait (instead of failing with SQLITE_BUSY) while a replicator such as Litestream briefly holds a checkpoint lock.
db.exec('PRAGMA busy_timeout = 5000');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

/** Additive migrations for databases created before a column existed (CREATE TABLE IF NOT EXISTS won't add it). */
function ensureColumns(table: string, columns: Record<string, string>): void {
  const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  for (const [name, def] of Object.entries(columns)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
// Usage & cost of live answers (NULL for simulated ones).
ensureColumns('responses', {
  input_tokens: 'INTEGER',
  output_tokens: 'INTEGER',
  cached_tokens: 'INTEGER',
  search_calls: 'INTEGER',
  cost_usd: 'REAL',
  batch: 'INTEGER NOT NULL DEFAULT 0',
});
// Secret token for server-side ingestion (snippets, log shipping); the site key alone only admits referral beacons.
ensureColumns('projects', { ingest_token: 'TEXT' });
ensureColumns('runs', {
  mode: "TEXT NOT NULL DEFAULT 'realtime'",
  reused_jobs: 'INTEGER NOT NULL DEFAULT 0',
});

// ---------- helpers ----------

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
/** Short random id, e.g. id('prj') -> "prj_k3j2h1g9f8d7". */
export function id(prefix: string, len = 12): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return `${prefix}_${out}`;
}

export const nowIso = (): string => new Date().toISOString();
/** 'YYYY-MM-DD' in UTC for a Date (default now). */
export const dayOf = (d: Date = new Date()): string => d.toISOString().slice(0, 10);
/** 'YYYY-MM-DD' n days before today (UTC). daysAgo(0) === today. */
export const daysAgo = (n: number): string => dayOf(new Date(Date.now() - n * 86_400_000));

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type Params = Record<string, SQLInputValue> | SQLInputValue[];

function bind(stmt: ReturnType<DatabaseSync['prepare']>, params?: Params) {
  return { stmt, args: params === undefined ? [] : Array.isArray(params) ? params : [params] };
}

/** SELECT many rows. Named params use `:name` / `$name` / `@name`. */
export function all<T = Record<string, unknown>>(sql: string, params?: Params): T[] {
  const { stmt, args } = bind(db.prepare(sql), params);
  return stmt.all(...(args as SQLInputValue[])) as T[];
}

/** SELECT one row (or undefined). */
export function get<T = Record<string, unknown>>(sql: string, params?: Params): T | undefined {
  const { stmt, args } = bind(db.prepare(sql), params);
  return stmt.get(...(args as SQLInputValue[])) as T | undefined;
}

/** INSERT / UPDATE / DELETE. */
export function run(sql: string, params?: Params) {
  const { stmt, args } = bind(db.prepare(sql), params);
  return stmt.run(...(args as SQLInputValue[]));
}

/** Run fn inside a transaction (BEGIN/COMMIT, ROLLBACK on throw). Not re-entrant. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Insert a plain object into a table. Keys must match column names. */
export function insert(table: string, row: Record<string, SQLInputValue | boolean>): void {
  const keys = Object.keys(row);
  const values = keys.map((k) => {
    const v = row[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v as SQLInputValue);
  });
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(
    ...values,
  );
}

// ---------- settings (API keys, model overrides) ----------

export function getSetting(key: string): string | undefined {
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value;
}

export function setSetting(key: string, value: string | null): void {
  if (value === null || value === '') run('DELETE FROM settings WHERE key = ?', [key]);
  else run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

/** Setting with env fallback, e.g. secret('OPENAI_API_KEY'). DB value wins over env. */
export function secret(key: string): string | undefined {
  return getSetting(key) || process.env[key] || undefined;
}
