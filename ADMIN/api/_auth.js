// Shared auth + CORS for the admin serverless functions.
//
// Vercel does not route files in api/ whose name starts with an underscore,
// so this is a helper module rather than an endpoint.
//
// Every handler in this folder talks to Supabase with the SERVICE key, which
// bypasses row-level security. That makes an unauthenticated write here
// equivalent to handing out full database access, so mutations must go
// through requireAdmin() before they touch the client.

import jwt from 'jsonwebtoken';

// Fail closed. There is deliberately no fallback secret: a default committed
// to the repo is a publicly known signing key, which lets anyone mint a valid
// admin token. If JWT_SECRET is missing the endpoints refuse to authenticate
// rather than trusting tokens signed with a guessable value.
const JWT_SECRET = process.env.JWT_SECRET;

const DEFAULT_ORIGINS = [
  'https://admin.afosi.org',
  'http://localhost:5173',
  'http://localhost:3000',
];

const ALLOWED_ORIGINS = (process.env.ADMIN_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

// Reflecting req.headers.origin back while also setting
// Allow-Credentials: true tells the browser to trust *any* site with the
// user's credentials, so the origin is matched against an allowlist instead.
export function applyCors(req, res, methods = 'GET,OPTIONS,PATCH,DELETE,POST,PUT') {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // handled, caller should return
  }
  return false;
}

// Returns the decoded token, or null when the request is not a valid admin.
export function getAdmin(req) {
  if (!JWT_SECRET) return null;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Gate for anything that changes data. Returns true when the caller should
// stop (a response has already been sent).
export function requireAdmin(req, res) {
  if (!JWT_SECRET) {
    console.error('[auth] JWT_SECRET is not set; refusing to authorize.');
    res.status(500).json({ success: false, message: 'Server auth is not configured.' });
    return true;
  }
  const admin = getAdmin(req);
  if (!admin) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    return true;
  }
  req.admin = admin;
  return false;
}

// Convenience: writes always need an admin, reads are public by default
// (the public website reads this same content unauthenticated).
export function requireAdminForWrites(req, res) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return requireAdmin(req, res);
  }
  return false;
}
