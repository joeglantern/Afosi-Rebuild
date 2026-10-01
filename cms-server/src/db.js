// Postgres for the content API.
//
// One pool, shared by the content routes and Better Auth. Content tables are
// created by the numbered SQL files in ../migrations; Better Auth's own
// tables (user, session, account, verification, jwks, rateLimit) are created
// by its migration API. Both run from scripts/migrate.js, as an explicit
// deploy step rather than on every boot.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from './config.js';

const MIGRATIONS_DIR = path.join(config.root, 'migrations');

// Count columns come back from Postgres as bigint, which node-pg returns as a
// string to avoid losing precision. Every count here is small, so parse it.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Loopback to the local cluster, so no TLS. Turn it on before ever pointing
  // this at another host.
  ssl: false,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));

const LOCK_KEY = 732_401; // arbitrary, just unique to this service

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function appliedMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

export async function pendingContentMigrations() {
  const client = await pool.connect();
  try {
    const applied = await appliedMigrations(client);
    return migrationFiles().filter((f) => !applied.has(f));
  } finally {
    client.release();
  }
}

export async function migrateContent({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    // Serialise concurrent runs, e.g. two deploys started at once.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    const applied = await appliedMigrations(client);
    let ran = 0;
    for (const file of migrationFiles()) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
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
    return ran;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

export function describeConnection() {
  try {
    const u = new URL(config.databaseUrl);
    return `${u.pathname.slice(1)} on ${u.hostname}:${u.port || 5432} as ${u.username}`;
  } catch {
    return 'unknown';
  }
}
