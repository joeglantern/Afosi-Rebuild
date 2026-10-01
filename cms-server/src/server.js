// Boot. Refuses to start against a database that has not been migrated, so a
// deploy that forgot "npm run migrate" fails loudly instead of serving 500s.

import fs from 'node:fs';
import { getMigrations } from 'better-auth/db/migration';
import { app } from './app.js';
import { auth } from './auth.js';
import { config } from './config.js';
import { pool, pendingContentMigrations, describeConnection } from './db.js';

const pendingContent = await pendingContentMigrations();
const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
if (pendingContent.length || toBeCreated.length || toBeAdded.length) {
  console.error('[cms] database is not up to date, run: npm run migrate');
  if (pendingContent.length) console.error('  content migrations pending:', pendingContent.join(', '));
  if (toBeCreated.length) console.error('  auth tables missing:', toBeCreated.map((t) => t.table).join(', '));
  if (toBeAdded.length) console.error('  auth columns missing on:', toBeAdded.map((t) => t.table).join(', '));
  await pool.end();
  process.exit(1);
}

fs.mkdirSync(config.uploadDir, { recursive: true });

if (!config.isProd) {
  // Better Auth relaxes its own checks outside production (see app.js). Our
  // guards cover the origin check, but secure cookies are still off.
  console.warn('[cms] NODE_ENV is not "production": session cookies are not marked Secure');
}

const server = app.listen(config.port, config.host, () => {
  console.log(`[cms] listening on ${config.host}:${config.port} (${config.nodeEnv})`);
  console.log(`[cms] database: ${describeConnection()}`);
  console.log(`[cms] auth base: ${config.authUrl}/api/auth`);
  console.log(`[cms] uploads: ${config.uploadDir} -> ${config.publicUploadBase}`);
});

// pm2 sends SIGINT on restart. Stop taking new connections, let in-flight
// requests finish, then close the pool.
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`[cms] ${signal}, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
