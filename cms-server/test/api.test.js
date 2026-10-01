// End-to-end tests: the real app, the real Postgres, real HTTP.
//
// Needs a disposable database. Locally:
//   docker run -d --name afosi-cms-test -e POSTGRES_USER=afosi_cms \
//     -e POSTGRES_PASSWORD=localtestonly -e POSTGRES_DB=afosi_cms \
//     -p 127.0.0.1:55432:5432 postgres:16
//   TEST_DATABASE_URL=postgresql://afosi_cms:localtestonly@127.0.0.1:55432/afosi_cms npm test
//
// It wipes every table it touches, so it refuses to run against anything
// whose URL does not say "test" or point at port 55432.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import bcrypt from 'bcryptjs';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || !(/test/i.test(DB) || DB.includes(':55432/'))) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database (see the top of this file).');
}

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'afosi-cms-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: DB,
  BETTER_AUTH_SECRET: crypto.randomBytes(36).toString('base64'),
  BETTER_AUTH_URL: 'http://localhost:3999',
  TRUSTED_ORIGINS: 'https://admin.afosi.org',
  CORS_ORIGINS: 'https://afosi.org,https://admin.afosi.org',
  UPLOAD_DIR: UPLOADS,
  PUBLIC_UPLOAD_BASE: 'https://api.afosi.org/uploads',
});

const { getMigrations } = await import('better-auth/db/migration');
const { migrateContent, pool } = await import('../src/db.js');
const { auth, isLegacyHash } = await import('../src/auth.js');
const { app } = await import('../src/app.js');

const ADMIN = 'https://admin.afosi.org';
let base;
let server;
let ipCounter = 0;
// Each sign-in comes from its own address, so Better Auth's per-IP limit on
// sign-in never trips except in the test that is about it.
const freshIp = () => `10.0.0.${++ipCounter}`;

async function call(method, url, { body, cookie, origin, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (origin !== null) h.origin = origin ?? ADMIN;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

async function signIn(email, password, ip = freshIp()) {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN, 'x-real-ip': ip },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
  return { status: res.status, cookie: cookies.join('; '), json: await res.json().catch(() => null) };
}

const ADMIN_EMAIL = 'admin@afosi.test';
const ADMIN_PASS = 'correct horse battery staple';
let adminCookie;

before(async () => {
  // Start clean every run.
  await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await migrateContent({ log: () => {} });
  await (await getMigrations(auth.options)).runMigrations();

  await auth.api.createUser({ body: { email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Test Admin', role: 'admin' } });

  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const s = await signIn(ADMIN_EMAIL, ADMIN_PASS);
  assert.equal(s.status, 200, 'admin sign-in');
  adminCookie = s.cookie;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

// ── auth ────────────────────────────────────────────────────────────────────
test('session cookie is httpOnly and carries the afosi prefix', async () => {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN, 'x-real-ip': freshIp() },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  const session = res.headers.getSetCookie().find((c) => c.startsWith('afosi.session_token='));
  assert.ok(session, 'session cookie set');
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=Lax/i);
});

test('public sign-up is disabled', async () => {
  const r = await call('POST', '/api/auth/sign-up/email', {
    body: { email: 'intruder@x.test', password: 'long enough password', name: 'X' },
  });
  assert.notEqual(r.status, 200);
  const { rows } = await pool.query(`SELECT 1 FROM "user" WHERE email = 'intruder@x.test'`);
  assert.equal(rows.length, 0, 'no account was created');
});

test('wrong password is refused', async () => {
  const s = await signIn(ADMIN_EMAIL, 'not the password');
  assert.equal(s.status, 401);
});

test('sign-in from an untrusted origin is refused', async () => {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', 'x-real-ip': freshIp() },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  assert.equal(res.status, 403);
});

test('an imported bcrypt password works and is upgraded to scrypt on first sign-in', async () => {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email: 'legacy@afosi.test', name: 'Legacy Admin', emailVerified: true, role: 'admin',
  });
  const legacyHash = await bcrypt.hash('old supabase password', 10);
  await ctx.internalAdapter.linkAccount({
    userId: user.id, providerId: 'credential', accountId: user.id, password: legacyHash,
  });

  const s = await signIn('legacy@afosi.test', 'old supabase password');
  assert.equal(s.status, 200, 'old password still works');

  const [acct] = (await ctx.internalAdapter.findAccounts(user.id)).filter((a) => a.providerId === 'credential');
  assert.equal(isLegacyHash(acct.password), false, 'hash rewritten');
  assert.notEqual(acct.password, legacyHash);

  const again = await signIn('legacy@afosi.test', 'old supabase password');
  assert.equal(again.status, 200, 'still works after the upgrade');
});

test('a non-admin user cannot write content', async () => {
  await auth.api.createUser({
    body: { email: 'viewer@afosi.test', password: 'viewer password long', name: 'Viewer', role: 'user' },
  });
  const s = await signIn('viewer@afosi.test', 'viewer password long');
  assert.equal(s.status, 200);
  const r = await call('POST', '/api/projects', { cookie: s.cookie, body: { title: 'x', description: 'y' } });
  assert.equal(r.status, 403);
});

test('JWKS is published for other services to verify admin tokens', async () => {
  const r = await call('GET', '/api/auth/jwks', { origin: null });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.keys) && r.json.keys.length > 0);
  assert.equal(r.json.keys[0].d, undefined, 'private key material is not exposed');
});

// The contract the applications service (../server/applications.js) relies
// on to accept an admin: a short-lived token from /api/auth/token, signed
// with a key published at /api/auth/jwks, carrying the user's role.
test('admin JWT: issued to a session, verifiable against JWKS, carries role', async () => {
  const { createLocalJWKSet, jwtVerify } = await import('jose');
  const tok = await call('GET', '/api/auth/token', { cookie: adminCookie, origin: null });
  assert.equal(tok.status, 200);
  assert.equal(typeof tok.json.token, 'string');

  const jwks = (await call('GET', '/api/auth/jwks', { origin: null })).json;
  const { payload, protectedHeader } = await jwtVerify(tok.json.token, createLocalJWKSet(jwks), {
    issuer: process.env.BETTER_AUTH_URL,
    audience: process.env.BETTER_AUTH_URL,
  });
  assert.equal(payload.role, 'admin');
  assert.equal(payload.email, ADMIN_EMAIL);
  assert.ok(protectedHeader.kid, 'key id present, so keys can rotate');
  const lifetime = payload.exp - payload.iat;
  assert.ok(lifetime > 0 && lifetime <= 60 * 60, `short-lived token (${lifetime}s)`);

  const noSession = await call('GET', '/api/auth/token', { origin: null });
  assert.equal(noSession.status, 401, 'no token without a session');
});

// ── writes that were open to anyone before ─────────────────────────────────
for (const [method, url] of [
  ['POST', '/api/opportunities'],
  ['POST', '/api/gallery'],
  ['POST', '/api/news/admin'],
  ['POST', '/api/projects'],
  ['DELETE', '/api/upload'],
]) {
  test(`${method} ${url} without a session is 401`, async () => {
    const r = await call(method, url, { body: {} });
    assert.equal(r.status, 401);
  });
}

test('a write from a foreign origin is refused even with a valid cookie', async () => {
  const r = await call('POST', '/api/projects', {
    cookie: adminCookie, origin: 'https://evil.example', body: { title: 'x', description: 'y' },
  });
  assert.equal(r.status, 403);
});

// ── news: same contract as the old backend ─────────────────────────────────
test('news: create, list, slug view counter, toggle, duplicate slug, delete', async () => {
  const created = await call('POST', '/api/news/admin', {
    cookie: adminCookie,
    body: {
      title: 'Hello', slug: 'hello', excerpt: 'e', content: 'c',
      published_date: '2026-09-01', tags: ['a', 'b'],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.message, 'News article created successfully');
  assert.deepEqual(created.json.data.tags, ['a', 'b']);
  assert.equal(created.json.data.category, 'general');
  const id = created.json.data.id;

  const dup = await call('POST', '/api/news/admin', {
    cookie: adminCookie,
    body: { title: 'x', slug: 'hello', excerpt: 'e', content: 'c', published_date: '2026-09-01' },
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.json.message, 'A news article with this slug already exists');

  const list = await call('GET', '/api/news', { origin: null });
  assert.equal(list.json.success, true);
  assert.equal(list.json.data.length, 1);
  assert.equal(list.json.limit, 10);

  const v1 = await call('GET', '/api/news/slug/hello', { origin: null });
  const v2 = await call('GET', '/api/news/slug/hello', { origin: null });
  assert.equal(v2.json.data.views, v1.json.data.views + 1);

  const hidden = await call('PATCH', `/api/news/admin/${id}/toggle-publish`, { cookie: adminCookie });
  assert.equal(hidden.json.data.is_published, false);
  assert.equal((await call('GET', '/api/news', { origin: null })).json.data.length, 0, 'unpublished is hidden');
  assert.equal((await call('GET', '/api/news/slug/hello', { origin: null })).status, 404);

  const stats = await call('GET', '/api/news/admin/stats', { cookie: adminCookie });
  assert.deepEqual(
    { total: stats.json.data.total, published: stats.json.data.published, unpublished: stats.json.data.unpublished },
    { total: 1, published: 0, unpublished: 1 }
  );

  const admin = await call('GET', '/api/news/admin/all', { cookie: adminCookie });
  assert.equal(admin.json.total, 1);
  assert.equal(admin.json.data[0]._total, undefined, 'internal count column is not leaked');

  const del = await call('DELETE', `/api/news/admin/${id}`, { cookie: adminCookie });
  assert.equal(del.json.message, 'News article deleted successfully');
});

test('news: update ignores columns that are not editable (no mass assignment)', async () => {
  const c = await call('POST', '/api/news/admin', {
    cookie: adminCookie,
    body: { title: 'T', slug: 'mass', excerpt: 'e', content: 'c', published_date: '2026-09-01' },
  });
  const id = c.json.data.id;
  const u = await call('PUT', `/api/news/admin/${id}`, {
    cookie: adminCookie,
    body: { title: 'T2', views: 99999, id: crypto.randomUUID(), created_at: '1999-01-01' },
  });
  assert.equal(u.status, 200);
  assert.equal(u.json.data.title, 'T2');
  assert.equal(u.json.data.views, 0);
  assert.equal(u.json.data.id, id);
  assert.notEqual(new Date(u.json.data.created_at).getUTCFullYear(), 1999);
});

// ── projects ────────────────────────────────────────────────────────────────
test('projects: auto slug, arrays, order, lookups, toggle', async () => {
  const a = await call('POST', '/api/projects', {
    cookie: adminCookie,
    body: { title: 'We Lead Project', description: 'd', display_order: 2, what_we_do: ['x', '', 'y'], impact: ['i'] },
  });
  assert.equal(a.status, 201);
  assert.equal(a.json.data.slug, 'we-lead-project');
  assert.deepEqual(a.json.data.what_we_do, ['x', 'y'], 'empty entries dropped, as before');
  assert.equal(a.json.data.icon, 'Lightbulb');

  await call('POST', '/api/projects', { cookie: adminCookie, body: { title: 'First', description: 'd', display_order: 1 } });
  const list = await call('GET', '/api/projects', { origin: null });
  assert.deepEqual(list.json.data.map((p) => p.title), ['First', 'We Lead Project']);

  assert.equal((await call('GET', '/api/projects/slug/we-lead-project', { origin: null })).json.data.id, a.json.data.id);
  assert.equal((await call('GET', `/api/projects/${a.json.data.id}`, { origin: null })).status, 200);
  assert.equal((await call('GET', '/api/projects/not-a-uuid', { origin: null })).status, 404);

  const t = await call('PATCH', `/api/projects/${a.json.data.id}/toggle-featured`, { cookie: adminCookie });
  assert.equal(t.json.data.is_featured, true);
  const featured = await call('GET', '/api/projects?featured=true', { origin: null });
  assert.equal(featured.json.data.length, 1);
});

// ── opportunities ───────────────────────────────────────────────────────────
test('opportunities: validation, open-ended deadline, toggle', async () => {
  const base_ = { title: 'Field Officer', description: 'd', location: 'Nairobi', duration: '6 months' };
  const badType = await call('POST', '/api/opportunities', {
    cookie: adminCookie, body: { ...base_, type: 'internship', deadline: '2026-12-01' },
  });
  assert.equal(badType.status, 400);
  assert.equal(badType.json.message, 'Type must be either employment, consulting, or volunteering');

  const ok = await call('POST', '/api/opportunities', {
    cookie: adminCookie, body: { ...base_, type: 'employment', deadline: 'Open until filled' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.data.deadline, 'Open until filled', 'text deadlines survive');
  assert.equal(ok.json.data.slug, 'field-officer');

  const toggled = await call('PATCH', `/api/opportunities/${ok.json.data.id}/toggle`, { cookie: adminCookie });
  assert.equal(toggled.json.data.manually_disabled, true);
  const pub = await call('GET', '/api/opportunities', { origin: null });
  assert.equal(pub.json.data.length, 1, 'disabled ones are still listed, as before');
});

// ── gallery + uploads ───────────────────────────────────────────────────────
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  crypto.randomBytes(64),
]);

async function uploadFile(buffer, name, fields = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([buffer]), name);
  const res = await fetch(`${base}/api/upload`, {
    method: 'POST', headers: { cookie: adminCookie, origin: ADMIN }, body: fd,
  });
  return { status: res.status, json: await res.json() };
}

test('upload: a real image is stored under its bucket and served back', async () => {
  const up = await uploadFile(PNG, 'photo.png', { bucket: 'afosi-projects' });
  assert.equal(up.status, 201);
  assert.match(up.json.data.path, /^afosi-projects\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.equal(up.json.url, up.json.data.url, 'top-level url kept for the old callers');

  const served = await fetch(`${base}/uploads/${up.json.data.path}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(served.headers.get('cross-origin-resource-policy'), 'same-site');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
});

test('upload: an HTML file named .png is refused', async () => {
  const up = await uploadFile(Buffer.from('<html><script>alert(1)</script></html>'), 'evil.png');
  assert.equal(up.status, 400);
});

test('upload: unknown bucket and path traversal are refused', async () => {
  assert.equal((await uploadFile(PNG, 'a.png', { bucket: '../../etc' })).status, 400);
  const del = await call('DELETE', '/api/upload', { cookie: adminCookie, body: { path: 'afosi-images/../../../etc/passwd' } });
  assert.equal(del.status, 404, 'never resolves outside the upload directory');
});

test('gallery: category normalised and validated; delete removes our file', async () => {
  const up = await uploadFile(PNG, 'g.png');
  const bad = await call('POST', '/api/gallery', {
    cookie: adminCookie, body: { image_url: up.json.url, category: 'selfies', title: 't' },
  });
  assert.equal(bad.status, 400);

  const g = await call('POST', '/api/gallery', {
    cookie: adminCookie, body: { src: up.json.url, category: 'youth', alt: 'kids planting trees' },
  });
  assert.equal(g.status, 201);
  assert.equal(g.json.data.category, 'Youth');
  assert.equal(g.json.data.src, g.json.data.image_url);
  assert.equal(g.json.data.title, 'kids planting trees', 'alt stands in for title, as before');

  const filtered = await call('GET', '/api/gallery?category=Youth', { origin: null });
  assert.equal(filtered.json.data.length, 1);

  const file = path.join(UPLOADS, up.json.data.path);
  assert.ok(fs.existsSync(file));
  await call('DELETE', `/api/gallery/${g.json.data.id}`, { cookie: adminCookie });
  assert.ok(!fs.existsSync(file), 'file removed with its row');
});

// ── plumbing ────────────────────────────────────────────────────────────────
test('CORS: the public site may read, an unknown origin gets no allowance', async () => {
  const ok = await fetch(`${base}/api/projects`, { headers: { origin: 'https://afosi.org' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://afosi.org');
  const no = await fetch(`${base}/api/projects`, { headers: { origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('unknown route keeps the old 404 body', async () => {
  const r = await call('GET', '/api/nope', { origin: null });
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { success: false, message: 'Route not found' });
});

test('malformed JSON is a 400, not a 500', async () => {
  const r = await call('POST', '/api/projects', {
    cookie: adminCookie, raw: '{not json', headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 400);
});

// The applications service's verifier (../server/admin-auth.js), exercised
// against this real auth server rather than a mock.
test('applications service accepts Better Auth admins and legacy tokens, and nothing forged', async () => {
  const { SignJWT } = await import('jose');
  const legacySecret = crypto.randomBytes(32).toString('hex');
  Object.assign(process.env, {
    CMS_JWKS_URL: `${base}/api/auth/jwks`,
    CMS_AUTH_ISSUER: process.env.BETTER_AUTH_URL,
    JWT_SECRET: legacySecret,
  });
  const { verifyAdminToken } = await import('../../server/admin-auth.js');
  const tokenFor = async (cookie) => (await call('GET', '/api/auth/token', { cookie, origin: null })).json.token;

  const ok = await verifyAdminToken(await tokenFor(adminCookie));
  assert.equal(ok.admin?.via, 'better-auth');
  assert.equal(ok.admin.email, ADMIN_EMAIL);

  await auth.api.createUser({
    body: { email: 'editor@afosi.test', password: 'editor password long', name: 'Editor', role: 'user' },
  });
  const editor = await signIn('editor@afosi.test', 'editor password long');
  const notAdmin = await verifyAdminToken(await tokenFor(editor.cookie));
  assert.equal(notAdmin.status, 403, 'a signed-in non-admin is refused');

  const hs = (secret, claims = { id: 'x', email: 'old@afosi.org', role: 'admin' }) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

  const legacy = await verifyAdminToken(await hs(legacySecret));
  assert.equal(legacy.admin?.via, 'legacy', 'old dashboard tokens still work until switch-over');

  assert.equal((await verifyAdminToken(await hs('guessed secret'))).status, 401);

  // Algorithm confusion: an HS256 token "signed" with the published public
  // key. It must be judged against the shared secret, and fail.
  const publicKey = JSON.stringify((await call('GET', '/api/auth/jwks', { origin: null })).json.keys[0]);
  assert.equal((await verifyAdminToken(await hs(publicKey))).status, 401);

  const foreign = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS512' })
    .sign(new TextEncoder().encode(legacySecret));
  assert.equal((await verifyAdminToken(foreign)).status, 401, 'only HS256 is accepted on the legacy path');

  assert.equal((await verifyAdminToken('not.a.jwt')).status, 401);
  assert.equal((await verifyAdminToken('')).status, 401);
});

// Last, because it spends this address's sign-in budget.
test('sign-in is rate limited per address (5 a minute)', async () => {
  const ip = '10.9.9.9';
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await signIn(ADMIN_EMAIL, 'wrong password', ip)).status);
  assert.ok(codes.includes(429), `expected a 429, got ${codes.join(',')}`);
  const other = await signIn(ADMIN_EMAIL, ADMIN_PASS, '10.9.9.10');
  assert.equal(other.status, 200, 'another address is unaffected');
});
