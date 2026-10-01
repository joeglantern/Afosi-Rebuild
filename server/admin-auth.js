// Who is allowed into the applications admin routes.
//
// Two kinds of admin token are accepted during the move off Supabase:
//
//   Better Auth (cms-server): an asymmetrically signed JWT from
//   admin.afosi.org/api/auth/token, verified against the public keys that
//   service publishes at /api/auth/jwks. No shared secret: this service can
//   check a token but cannot mint one.
//
//   Legacy: the HS256 token the old dashboard login signs with JWT_SECRET.
//   Kept so the Applications tab works until the dashboard switches over;
//   remove this branch, and JWT_SECRET, once it has.
//
// The token's own header decides which check runs. Trying one and falling
// back to the other would invite algorithm confusion: an attacker could send
// an HS256 token "signed" with a public key. Here an HS* token only ever
// meets the shared secret, and anything else only ever meets the key set.

import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

// Read lazily: see the note in applications.js about dotenv ordering.
const legacySecret = () => process.env.JWT_SECRET;
const cmsIssuer = () => process.env.CMS_AUTH_ISSUER || 'https://admin.afosi.org';
// Loopback, so verifying a token never depends on nginx or DNS.
const cmsJwksUrl = () => process.env.CMS_JWKS_URL || 'http://127.0.0.1:8792/api/auth/jwks';

const ASYMMETRIC = ['EdDSA', 'ES256', 'ES512', 'RS256', 'PS256'];

let jwks;
let jwksFor;
function keySet() {
  const url = cmsJwksUrl();
  if (!jwks || jwksFor !== url) {
    // Keys are cached and refetched on an unknown key id, which is how
    // rotation on the cms side is picked up without a restart here.
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60 * 1000, cooldownDuration: 30 * 1000 });
    jwksFor = url;
  }
  return jwks;
}

/**
 * @returns {Promise<{ admin: object } | { status: number, message: string }>}
 */
export async function verifyAdminToken(token) {
  if (!token) return { status: 401, message: 'No token provided' };

  let alg;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return { status: 401, message: 'Invalid or expired token' };
  }

  if (typeof alg === 'string' && alg.startsWith('HS')) {
    const secret = legacySecret();
    if (!secret) return { status: 401, message: 'Invalid or expired token' };
    try {
      return { admin: { ...jwt.verify(token, secret, { algorithms: ['HS256'] }), via: 'legacy' } };
    } catch {
      return { status: 401, message: 'Invalid or expired token' };
    }
  }

  try {
    const { payload } = await jwtVerify(token, keySet(), {
      issuer: cmsIssuer(),
      audience: cmsIssuer(),
      algorithms: ASYMMETRIC,
    });
    if (payload.role !== 'admin' || payload.banned) {
      return { status: 403, message: 'Admin access required' };
    }
    return { admin: { id: payload.sub, email: payload.email, role: payload.role, via: 'better-auth' } };
  } catch {
    return { status: 401, message: 'Invalid or expired token' };
  }
}
