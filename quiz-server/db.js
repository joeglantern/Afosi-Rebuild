// Postgres for the quiz service.
//
// The website itself has no database: it is static, and the chat and donate
// service keeps small JSON files. So the quiz gets a database of its own,
// afosi_quiz, owned by its own role, on the Postgres already running on the
// box. It has no rights over any other database, which is what keeps this
// from touching the other sites on the server.
//
// deploy/setup-quiz-db.sh creates the role and the database; this file only
// connects to it and applies the migrations in ./migrations.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, 'migrations');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  // Loopback to a local cluster, so no TLS. Never point this at a remote host
  // without turning TLS on.
  ssl: false,
});

export async function migrate({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // The migration and its bookkeeping row commit together, so a failure
      // part way through leaves nothing half applied.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${err.message}`);
      }
      log(`applied ${file}`);
      ran += 1;
    }

    if (!ran) log('database already up to date');
    return { applied: ran };
  } finally {
    client.release();
  }
}

// Which database we are actually attached to, with the password stripped, for
// startup logging and the health check.
export function describeConnection() {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.pathname.replace('/', '')} on ${u.hostname}:${u.port || 5432} as ${u.username}`;
  } catch {
    return 'unknown';
  }
}
