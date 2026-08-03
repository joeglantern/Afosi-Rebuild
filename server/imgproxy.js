// On-the-fly image resize/compress proxy.
//
// Why this exists: gallery/news photos are uploaded through the AFOSI admin
// dashboard straight to Supabase Storage and served at their original
// upload size (some are 10-20MB). We don't control that backend or the
// Supabase plan (no image-transformation add-on there), so this endpoint
// fetches the original once, resizes+recompresses it with sharp, and caches
// the result to disk — every request after the first is served straight
// from disk, no re-processing and no re-fetching from Supabase.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Fixed path relative to this file, not an env var — process.env isn't
// populated by dotenv yet when this module's top level runs (ES module
// imports evaluate before server.js's own dotenv.config() call).
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'img-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024; // guard against runaway downloads

function allowedHosts() {
  return (process.env.IMG_ALLOWED_HOSTS || 'pmigmljjnyucethipdtk.supabase.co')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function isAllowedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return allowedHosts().includes(u.hostname);
  } catch {
    return false;
  }
}

function cacheKey(url, width) {
  return createHash('sha256').update(`${url}::${width}`).digest('hex');
}

async function fetchOriginal(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Upstream image fetch failed (${r.status})`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len && len > MAX_SOURCE_BYTES) throw new Error('Upstream image too large');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) throw new Error('Upstream image too large');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

// Express handler: GET /img?url=<source>&w=<width>
async function handleImgRequest(req, res) {
  const src = req.query.url;
  if (!src || typeof src !== 'string' || !isAllowedUrl(src)) {
    return res.status(400).json({ message: 'Missing or disallowed url.' });
  }
  const width = Math.min(Math.max(Number(req.query.w) || DEFAULT_WIDTH, 80), MAX_WIDTH);

  const key = cacheKey(src, width);
  const cachePath = join(CACHE_DIR, `${key}.webp`);

  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Type', 'image/webp');

  if (fs.existsSync(cachePath)) {
    return fs.createReadStream(cachePath).pipe(res);
  }

  try {
    const original = await fetchOriginal(src);
    const resized = await sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    fs.writeFileSync(cachePath, resized);
    res.send(resized);
  } catch (err) {
    console.error('[img] proxy error:', err.message);
    res.status(502).json({ message: 'Could not process image.' });
  }
}

export { handleImgRequest };
