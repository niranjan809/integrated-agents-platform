// Postgres (node-postgres) shim — the primary datastore, replacing the libsql/Turso layer.
// A module-scoped Pool is reused across all queries; each batch() checks out its own
// dedicated connection so concurrent HTTP queries can never interleave into a transaction.
//
// This is a COMPATIBILITY SHIM: it preserves the previous db.js interface
// (all/get/run/batch/nowIso/close + `client`/`pool`) AND the libsql call conventions
// (`@name`+object OR `?`+array args; SQLite INSERT OR IGNORE/REPLACE), so downstream call
// sites need no changes. NEVER string-concat values into SQL — pass them via `args`.
import pg from "pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set in .env (Postgres connection string).");

// Pool sizing: modest defaults, tuneable via env if needed later.
export const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10, // max concurrent connections
  idleTimeoutMillis: 30000, // release idle after 30s
  connectionTimeoutMillis: 5000, // fail fast if pool is exhausted
});

// Export `client` for legacy callers that referenced it. Wrap it as a shim that delegates
// to pool.query. NOTE: this only supports .query() — the raw libsql client.execute()/batch()
// API is intentionally gone (Tier B init/migration scripts are guarded against Postgres).
export const client = {
  query: (sql, params) => pool.query(sql, params),
};

// --- dialect translation: SQLite/libsql -> Postgres ---
const REPLACE_PK = { posts: "post_id" }; // conflict target for INSERT OR REPLACE, per table

function translateUpsert(sql) {
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    return sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO") + " ON CONFLICT DO NOTHING";
  }
  const m = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]*)\)/i);
  if (m) {
    const table = m[1];
    const pk = REPLACE_PK[table];
    if (!pk) throw new Error(`INSERT OR REPLACE into '${table}': no conflict target configured in REPLACE_PK`);
    const cols = m[2].split(",").map((c) => c.trim());
    const set = cols
      .filter((c) => c.toLowerCase() !== pk.toLowerCase())
      .map((c) => `${c}=EXCLUDED.${c}`)
      .join(", ");
    return (
      sql.replace(/^\s*INSERT\s+OR\s+REPLACE\s+INTO/i, "INSERT INTO") +
      ` ON CONFLICT (${pk}) DO UPDATE SET ${set}`
    );
  }
  return sql;
}

// `?`+Array -> $1.. ; `@name`+Object -> $n (a repeated @name reuses the same $n).
function translateParams(sql, args) {
  if (Array.isArray(args)) {
    let i = 0;
    return { text: sql.replace(/\?/g, () => `$${++i}`), values: args };
  }
  const order = [];
  const idx = new Map();
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    if (!idx.has(name)) {
      order.push(name);
      idx.set(name, order.length);
    }
    return `$${idx.get(name)}`;
  });
  return { text, values: order.map((n) => (args ?? {})[n]) };
}

function translate(sql, args) {
  return translateParams(translateUpsert(sql), args);
}

// --- Public interface (matches previous libsql-based db.js) ---

// Return all rows for a query.
export async function all(sql, args = []) {
  const { text, values } = translate(sql, args);
  const r = await pool.query(text, values);
  return r.rows;
}

// Return the first row (or null).
export async function get(sql, args = []) {
  const { text, values } = translate(sql, args);
  const r = await pool.query(text, values);
  return r.rows[0] ?? null;
}

// Execute a single write/read; returns a libsql-compatible result ({ rows, rowsAffected }).
export async function run(sql, args = []) {
  const { text, values } = translate(sql, args);
  const r = await pool.query(text, values);
  return { rows: r.rows, rowCount: r.rowCount, rowsAffected: r.rowCount };
}

// Atomic multi-statement write. `statements` is an array of { sql, args }; all succeed or all
// roll back. Checks out a dedicated pool connection so concurrent queries stay outside the txn.
export async function batch(statements) {
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const out = [];
    for (const { sql, args = [] } of statements) {
      const { text, values } = translate(sql, args);
      out.push(await conn.query(text, values));
    }
    await conn.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await conn.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

// Current UTC timestamp as ISO 8601 (used for *_at columns).
export function nowIso() {
  return new Date().toISOString();
}

// Close the pool (used on graceful shutdown).
export async function close() {
  return pool.end();
}
