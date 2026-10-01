// Shared request guards and helpers for the content routes.

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { config } from './config.js';

// Every content write needs a signed-in, unbanned admin. The old backend left
// gallery, opportunities and upload writes open to anyone; they are not open
// here.
export async function requireAdmin(req, res, next) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const { user } = session;
  if (user.banned || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  req.admin = user;
  next();
}

// Defence in depth for cookie-authenticated writes: a browser always sends
// Origin on a cross-site POST/PUT/PATCH/DELETE, so refuse any that is not
// ours. Requests without Origin (curl, server to server) carry no cookie of
// ours and fail requireAdmin anyway.
export function requireTrustedOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (origin && !config.trustedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }
  next();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

// Only columns named here can be written. The old backend passed req.body
// straight into UPDATE, which let a request set id, views or anything else.
export function pick(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body && Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out;
}

// Build "col1 = $1, col2 = $2" for an UPDATE. Column names only ever come
// from the allowlists in the route files, never from the request.
export function setClause(fields, startIndex = 1) {
  const keys = Object.keys(fields);
  return {
    sql: keys.map((k, i) => `${k} = $${i + startIndex}`).join(', '),
    values: keys.map((k) => fields[k]),
  };
}

// JSONB columns need their JS value serialised; node-pg would otherwise send
// a JS array as a Postgres array literal.
export function jsonb(fields, jsonbColumns) {
  const out = { ...fields };
  for (const col of jsonbColumns) {
    if (col in out) out[col] = JSON.stringify(Array.isArray(out[col]) ? out[col] : []);
  }
  return out;
}

export const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

// Postgres unique violation on a slug -> the same message the old API sent.
export function isUniqueViolation(err) {
  return err && err.code === '23505';
}

export function fail(res, status, message, err) {
  if (err) console.error(`[cms] ${message}:`, err.message);
  // Internal error text is useful while developing and a leak in production.
  const body = { success: false, message };
  if (err && !config.isProd) body.error = err.message;
  return res.status(status).json(body);
}
