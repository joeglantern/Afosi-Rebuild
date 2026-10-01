// Uploaded files on the VPS's own disk, replacing Supabase Storage.
//
// Layout mirrors the old buckets so the data migration is a plain prefix
// swap on every stored URL:
//   <supabase>/storage/v1/object/public/<bucket>/<path>
//   -> <PUBLIC_UPLOAD_BASE>/<bucket>/<path>
//
// The file type is decided by the bytes, never by the name or the browser's
// Content-Type, and the saved extension comes from that decision. So an HTML
// file renamed to .png is refused rather than stored and later served.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export const BUCKETS = ['afosi-images', 'afosi-news', 'afosi-projects'];
export const DEFAULT_BUCKET = 'afosi-images';

const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', kind: 'image', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png', ext: 'png', kind: 'image',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif', ext: 'gif', kind: 'image',
    test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  },
  {
    mime: 'image/webp', ext: 'webp', kind: 'image',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { mime: 'application/pdf', ext: 'pdf', kind: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export function sniff(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) || null;
}

// Resolve a stored relative path, refusing anything that would land outside
// the upload directory or outside a known bucket.
export function resolveUpload(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const bucket = rel.split('/')[0];
  if (!BUCKETS.includes(bucket)) return null;
  const full = path.resolve(config.uploadDir, rel);
  if (!full.startsWith(config.uploadDir + path.sep)) return null;
  return full;
}

export async function saveUpload(buffer, bucket = DEFAULT_BUCKET) {
  const detected = sniff(buffer);
  if (!detected) return { error: 'Only JPEG, PNG, GIF, WebP images and PDF files are allowed' };
  if (!BUCKETS.includes(bucket)) return { error: `Unknown bucket. Use one of: ${BUCKETS.join(', ')}` };

  const now = new Date();
  const fileName = `${randomUUID()}.${detected.ext}`;
  const rel = `${bucket}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${fileName}`;
  const full = resolveUpload(rel);

  await fs.mkdir(path.dirname(full), { recursive: true });
  // "wx" refuses to overwrite: a collision would mean a UUID clash, and
  // silently replacing someone else's file is the worse outcome.
  await fs.writeFile(full, buffer, { flag: 'wx', mode: 0o644 });

  return {
    rel,
    fileName,
    kind: detected.kind,
    mime: detected.mime,
    url: `${config.publicUploadBase}/${rel}`,
  };
}

export async function removeUpload(relPath) {
  const full = resolveUpload(relPath);
  if (!full) return false;
  try {
    await fs.unlink(full);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// Only files we host are ever deleted. A URL still pointing at Supabase, or
// anywhere else, is left alone.
export async function removeUploadByUrl(url) {
  const prefix = `${config.publicUploadBase}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return false;
  return removeUpload(url.slice(prefix.length));
}
