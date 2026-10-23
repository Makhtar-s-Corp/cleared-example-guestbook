// The guestbook's entries in Postgres: one table, created if missing.
import { Pool } from 'pg';

export type Entry = {
  readonly id: number;
  readonly name: string;
  readonly message: string;
  readonly createdAt: Date;
};

// An entry the filter flagged: kept off the page until someone reviews it,
// with the words it was held for.
export type HeldEntry = Entry & {
  readonly heldWords: readonly string[];
};

export interface Store {
  init(): Promise<void>;
  // The entries shown on the page, held ones left out.
  list(): Promise<Entry[]>;
  // The held entries, newest first.
  listHeld(): Promise<HeldEntry[]>;
  // With heldWords, the entry is stored as held, for those words.
  add(name: string, message: string, heldWords?: readonly string[]): Promise<Entry>;
  // true when the database answers within the timeout; never throws.
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export type StoreOptions = {
  // A schema to work in instead of public (the tests use one each).
  readonly schema?: string;
  // How long a connection or a query may take, in milliseconds.
  readonly timeoutMs?: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS held_words text[] NOT NULL DEFAULT '{}'`;

type Row = { id: string; name: string; message: string; created_at: Date };
type HeldRow = Row & { held_words: string[] };

const toEntry = (row: Row): Entry => ({ id: Number(row.id), name: row.name, message: row.message, createdAt: row.created_at });

export function createStore(connectionString: string, options: StoreOptions = {}): Store {
  const timeoutMs = options.timeoutMs ?? 2000;
  if (options.schema !== undefined && !/^[a-z_][a-z0-9_]*$/.test(options.schema)) throw new Error(`not a plain schema name: ${options.schema}`);
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    max: 5,
    ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
  });
  // An idle client that loses its connection must not crash the process.
  pool.on('error', () => {});

  return {
    async init() {
      await pool.query(SCHEMA);
    },
    async list() {
      const result = await pool.query<Row>('SELECT id, name, message, created_at FROM entries WHERE NOT held ORDER BY id DESC');
      return result.rows.map(toEntry);
    },
    async listHeld() {
      const result = await pool.query<HeldRow>('SELECT id, name, message, created_at, held_words FROM entries WHERE held ORDER BY id DESC');
      return result.rows.map((row) => ({ ...toEntry(row), heldWords: row.held_words }));
    },
    async add(name, message, heldWords) {
      const result = await pool.query<Row>(
        'INSERT INTO entries (name, message, held, held_words) VALUES ($1, $2, $3, $4) RETURNING id, name, message, created_at',
        [name, message, heldWords !== undefined, heldWords ?? []],
      );
      const row = result.rows[0];
      if (!row) throw new Error('the insert returned no row');
      return toEntry(row);
    },
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await pool.end();
    },
  };
}
