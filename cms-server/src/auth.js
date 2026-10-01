// Better Auth for the admin dashboard.
//
// Replaces the old custom login (an admin_users table in Supabase, bcrypt
// hashes, and a hand-signed 24h JWT kept in localStorage). Sessions are now
// httpOnly cookies on admin.afosi.org, stored in Postgres, and revocable.
//
// Choices, and why:
// - Sign-up is disabled. Accounts are created by scripts/create-admin.js or
//   imported from the old admin_users table. Nobody can register themselves.
// - Passwords: new hashes use Better Auth's scrypt. Hashes imported from the
//   old system are bcrypt; those are still accepted, and rewritten as scrypt
//   the first time that person signs in, so nobody needs a password reset.
// - Only the "admin" role may use the content API (see http.js).
// - The jwt plugin lets other services on the box (the applications API in
//   ../server) check an admin's identity against a public key set, instead of
//   sharing a signing secret the way the old setup did.

import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { admin, jwt } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { pool } from './db.js';
import { config } from './config.js';

const LEGACY_BCRYPT = /^\$2[aby]\$\d{2}\$/;
export const isLegacyHash = (hash) => typeof hash === 'string' && LEGACY_BCRYPT.test(hash);

export const auth = betterAuth({
  appName: 'Afosi Admin',
  baseURL: config.authUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  database: pool,
  trustedOrigins: config.trustedOrigins,

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: (password) => hashPassword(password),
      verify: ({ hash, password }) =>
        isLegacyHash(hash) ? bcrypt.compare(password, hash) : verifyPassword({ hash, password }),
    },
  },

  // The old token lasted 24 hours; keep the same ceiling, refreshed hourly
  // while the dashboard is in use.
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },

  // On by default only in production; set explicitly so behaviour does not
  // silently change with NODE_ENV. Stored in Postgres so counts survive a
  // restart, which would otherwise reset an attacker's budget.
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },

  advanced: {
    database: { generateId: 'uuid' },
    useSecureCookies: config.isProd,
    cookiePrefix: 'afosi',
    // The service only listens on 127.0.0.1, so these headers can only have
    // been set by nginx, which overwrites any value a client sends.
    ipAddress: { ipAddressHeaders: ['x-real-ip', 'x-forwarded-for'] },
  },

  plugins: [
    admin({ adminRoles: ['admin'], defaultRole: 'user' }),
    // By default this plugin signs a fresh JWT onto every session response,
    // which makes sign-in and every session check depend on decrypting the
    // signing key. Found in testing: if that key cannot be decrypted (for
    // example after BETTER_AUTH_SECRET changes), the whole dashboard then
    // fails with 500s. The dashboard asks /api/auth/token for a token only
    // when it talks to the applications service, so turn the header off and
    // keep a key problem confined to that one feature.
    jwt({ disableSettingJwtHeader: true }),
  ],

  // Upgrade an imported bcrypt hash to scrypt on the first successful sign-in.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email' || !ctx.context.newSession) return;
      const password = ctx.body?.password;
      if (typeof password !== 'string') return;
      const userId = ctx.context.newSession.user.id;
      const accounts = await ctx.context.internalAdapter.findAccounts(userId);
      const credential = accounts.find((a) => a.providerId === 'credential');
      if (credential && isLegacyHash(credential.password)) {
        await ctx.context.internalAdapter.updatePassword(userId, await hashPassword(password));
      }
    }),
  },

  telemetry: { enabled: false },
  logger: { level: config.isProd ? 'warn' : 'info' },
});
