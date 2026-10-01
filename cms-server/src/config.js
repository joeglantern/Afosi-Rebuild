// All configuration comes from the environment and is validated once, here.
// Anything security relevant fails closed: a missing or weak secret stops the
// process instead of falling back to a default.
//
// Better Auth in particular ships a public fallback secret
// ("better-auth-secret-12345678901234567890") that it uses when none is set,
// which would let anyone forge admin sessions. It must never get that far.

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

const list = (value, fallback) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

const authSecret = required('BETTER_AUTH_SECRET');
if (authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48');
}

const authUrl = required('BETTER_AUTH_URL');
if (isProd && !authUrl.startsWith('https://')) {
  throw new Error('BETTER_AUTH_URL must be https in production, or session cookies will not be marked Secure.');
}

const trustedOrigins = list(process.env.TRUSTED_ORIGINS, ['https://admin.afosi.org']);
if (isProd && trustedOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
  throw new Error('TRUSTED_ORIGINS must not include localhost in production.');
}

export const config = Object.freeze({
  nodeEnv,
  isProd,
  root,

  // Loopback only: nginx is the sole way in.
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8792),

  databaseUrl: required('DATABASE_URL'),

  // The admin dashboard's own origin. Auth cookies are set for this host.
  authUrl,
  authSecret,
  trustedOrigins,

  // Origins allowed to call the content API from a browser. The public site
  // only reads; the admin dashboard reads and writes.
  corsOrigins: list(process.env.CORS_ORIGINS, [
    'https://afosi.org',
    'https://www.afosi.org',
    'https://admin.afosi.org',
  ]),

  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads')),
  publicUploadBase: (process.env.PUBLIC_UPLOAD_BASE || 'https://api.afosi.org/uploads').replace(/\/+$/, ''),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024,
});
