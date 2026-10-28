// Load a Supabase export (made by export-supabase.js) into this service.
//
//   node scripts/import-supabase.js <export-dir> --dry-run   check, change nothing
//   node scripts/import-supabase.js <export-dir>             import
//
// What it does:
// - Copies the exported storage files into UPLOAD_DIR, same bucket/path, so
//   every old file URL maps 1:1 onto PUBLIC_UPLOAD_BASE.
// - Rewrites every Supabase storage URL in the rows to PUBLIC_UPLOAD_BASE.
// - REPLACES the content tables (news, projects, opportunities,
//   gallery_images) with the export, keeping ids and timestamps, in one
//   transaction. It is meant to be run again right before cutover to pick up
//   anything edited in the old dashboard since; any content written to THIS
//   service in between is overwritten.
// - Adds each active admin_users account to Better Auth, keeping its bcrypt
//   hash (auth.js accepts it and upgrades it on first sign-in). An account that
//   already exists here is left alone, so a changed password is never undone.
//
// Columns the export has but these tables do not are reported, never guessed.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool, pendingContentMigrations, describeConnection } from '../src/db.js';
import { config } from '../src/config.js';
import { BUCKETS } from '../src/storage.js';
import { isLegacyHash } from '../src/auth.js';

const TABLES = ['news', 'projects', 'opportunities', 'gallery_images'];
const SUPABASE_STORAGE = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//g;

const dir = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!dir || dir.startsWith('--')) {
  console.error('Usage: node scripts/import-supabase.js <export-dir> [--dry-run]');
  process.exit(1);
}

const readTable = (name) => JSON.parse(fs.readFileSync(path.join(dir, 'tables', `${name}.json`), 'utf8'));

// Swap the storage prefix everywhere in a value, including inside JSON arrays
// and rich text, and remember any URL whose file is not in the export.
const missing = new Set();
function rewrite(value) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/([^\s"'<>)]+)/g)) {
      const rel = decodeURIComponent(m[1].split('?')[0]);
      if (!fs.existsSync(path.join(dir, 'storage', rel))) missing.add(m[0]);
    }
    return value.replace(SUPABASE_STORAGE, `${config.publicUploadBase}/`);
  }
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
  return value;
}

// Copy files, skipping any already there with the same size.
function copyFiles() {
  let copied = 0;
  let present = 0;
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, 'storage', rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) { walk(child); continue; }
      const from = path.join(dir, 'storage', child);
      const to = path.resolve(config.uploadDir, child);
      if (!to.startsWith(config.uploadDir + path.sep)) throw new Error(`refusing path outside UPLOAD_DIR: ${child}`);
      if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) { present++; continue; }
      if (!dryRun) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
      copied++;
    }
  };
  for (const bucket of fs.readdirSync(path.join(dir, 'storage'))) {
    if (!BUCKETS.includes(bucket)) throw new Error(`export has an unknown bucket: ${bucket}`);
    walk(bucket);
  }
  return { copied, present };
}

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable = 'YES' AS nullable, column_default IS NOT NULL AS has_default
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Map(rows.map((r) => [r.column_name, r]));
}

async function importTable(client, table) {
  const cols = await columnsOf(client, table);
  const rows = readTable(table);
  const dropped = new Set();
  for (const raw of rows) {
    const row = rewrite(raw);
    const names = [];
    const values = [];
    for (const [key, value] of Object.entries(row)) {
      const col = cols.get(key);
      if (!col) {
        if (value !== null && value !== '') dropped.add(key);
        continue;
      }
      // A null in a NOT NULL column with a default (e.g. an empty list stored
      // as null) takes the default instead of failing the import.
      if (value === null && !col.nullable && col.has_default) continue;
      names.push(`"${key}"`);
      values.push(col.data_type === 'jsonb' && value !== null ? JSON.stringify(value) : value);
    }
    const params = values.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${params})`, values);
  }
  return { rows: rows.length, dropped: [...dropped] };
}

async function importAdmins(client) {
  const result = [];
  for (const u of readTable('admin_users')) {
    const email = String(u.email).trim().toLowerCase();
    if (!u.is_active) { result.push(`${email}: inactive, skipped`); continue; }
    if (!isLegacyHash(u.password_hash)) { result.push(`${email}: not a bcrypt hash, skipped`); continue; }
    const existing = await client.query('SELECT id FROM "user" WHERE lower(email) = $1', [email]);
    if (existing.rows[0]) { result.push(`${email}: already here, left alone`); continue; }
    const id = randomUUID();
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'admin', $4, now())`,
      [id, u.full_name || email, email, u.created_at || new Date()]
    );
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
      [randomUUID(), id, u.password_hash]
    );
    result.push(`${email}: imported as admin (existing password kept)`);
  }
  return result;
}

const client = await pool.connect();
try {
  console.log(`database: ${describeConnection()}${dryRun ? '  (DRY RUN: nothing is kept)' : ''}`);
  const pending = await pendingContentMigrations();
  if (pending.length) throw new Error(`run "npm run migrate" first; pending: ${pending.join(', ')}`);

  const files = copyFiles();
  console.log(`files: ${files.copied} ${dryRun ? 'to copy' : 'copied'}, ${files.present} already in ${config.uploadDir}`);

  await client.query('BEGIN');
  await client.query(`TRUNCATE ${TABLES.join(', ')}`);
  for (const table of TABLES) {
    const { rows, dropped } = await importTable(client, table);
    console.log(`table ${table.padEnd(15)} ${rows} rows` + (dropped.length ? `   (not carried over, has data: ${dropped.join(', ')})` : ''));
  }
  for (const line of await importAdmins(client)) console.log(`admin ${line}`);

  if (missing.size) {
    console.log(`\n${missing.size} URL(s) point at files that are not in the export:`);
    for (const u of missing) console.log(`  ${u}`);
  }
  const left = await client.query(
    `SELECT count(*) AS n FROM (SELECT row_to_json(t)::text AS j FROM news t UNION ALL
       SELECT row_to_json(t)::text FROM projects t UNION ALL
       SELECT row_to_json(t)::text FROM gallery_images t UNION ALL
       SELECT row_to_json(t)::text FROM opportunities t) x WHERE j LIKE '%supabase.co%'`
  );
  console.log(`rows still mentioning supabase.co: ${left.rows[0].n}`);

  await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  console.log(dryRun ? '\ndry run OK: rolled back, nothing changed' : '\nimport committed');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`import failed, nothing changed: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
