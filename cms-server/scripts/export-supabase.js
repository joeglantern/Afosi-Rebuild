// Copy everything out of the old Supabase project into a local folder:
// every row of every table the API exposes, and every file in every storage
// bucket. Read-only on the Supabase side. Run it as often as needed; files
// already downloaded with the same size are skipped.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/export-supabase.js <out-dir>
//
// The service key is read from the environment only, never an argument, so it
// stays out of shell history and the process list. On the VPS:
//
//   set -a; . /var/www/AFOSI_NGO/backend/.env; set +a
//   node scripts/export-supabase.js ~/supabase-export
//
// Output:
//   <out-dir>/tables/<table>.json      all rows, as returned by PostgREST
//   <out-dir>/storage/<bucket>/<path>  the files
//   <out-dir>/manifest.json            counts, so the import can be checked

import fs from 'node:fs';
import path from 'node:path';

const PAGE = 1000;

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
const outDir = process.argv[2];
if (!url || !key || !outDir) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/export-supabase.js <out-dir>');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function get(pathname, init = {}) {
  const res = await fetch(`${url}${pathname}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathname}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Every table and view PostgREST exposes, from its OpenAPI description.
async function listTables() {
  const spec = await (await get('/rest/v1/', { headers: { Accept: 'application/openapi+json' } })).json();
  return Object.keys(spec.definitions || {}).sort();
}

async function exportTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await get(`/rest/v1/${encodeURIComponent(table)}?select=*`, {
      headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function listObjects(bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await get(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const page = await res.json();
    for (const item of page) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back with no id; files have one, plus metadata.size.
      if (item.id === null) files.push(...(await listObjects(bucket, full)));
      else files.push({ path: full, size: item.metadata?.size ?? null });
    }
    if (page.length < PAGE) break;
  }
  return files;
}

function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error(`refusing path outside ${base}: ${rel}`);
  return target;
}

async function download(bucket, file, dir) {
  const target = safeJoin(dir, file.path);
  if (file.size !== null && fs.existsSync(target) && fs.statSync(target).size === file.size) return 'skipped';
  const encoded = file.path.split('/').map(encodeURIComponent).join('/');
  const res = await get(`/storage/v1/object/${bucket}/${encoded}`);
  const body = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return 'downloaded';
}

const manifest = { exportedAt: new Date().toISOString(), source: new URL(url).host, tables: {}, buckets: {} };

fs.mkdirSync(path.join(outDir, 'tables'), { recursive: true, mode: 0o700 });
fs.chmodSync(outDir, 0o700);

for (const table of await listTables()) {
  const rows = await exportTable(table);
  fs.writeFileSync(path.join(outDir, 'tables', `${table}.json`), JSON.stringify(rows, null, 2), { mode: 0o600 });
  manifest.tables[table] = rows.length;
  console.log(`table  ${table.padEnd(24)} ${rows.length} rows`);
}

const buckets = await (await get('/storage/v1/bucket')).json();
for (const { id: bucket } of buckets) {
  const dir = path.join(outDir, 'storage', bucket);
  fs.mkdirSync(dir, { recursive: true });
  const files = await listObjects(bucket);
  let downloaded = 0;
  let skipped = 0;
  let bytes = 0;
  const failed = [];
  for (const file of files) {
    try {
      (await download(bucket, file, dir)) === 'downloaded' ? downloaded++ : skipped++;
      bytes += file.size || 0;
    } catch (err) {
      failed.push({ path: file.path, error: err.message });
    }
  }
  manifest.buckets[bucket] = { files: files.length, bytes, failed };
  console.log(`bucket ${bucket.padEnd(24)} ${files.length} files (${(bytes / 1e6).toFixed(1)} MB): ` +
    `${downloaded} downloaded, ${skipped} already here, ${failed.length} failed`);
  for (const f of failed) console.log(`  FAILED ${f.path}: ${f.error}`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const anyFailed = Object.values(manifest.buckets).some((b) => b.failed.length);
console.log(anyFailed ? 'export finished WITH FAILURES (rerun to retry them)' : 'export complete');
process.exitCode = anyFailed ? 1 : 0;
