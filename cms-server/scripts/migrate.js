// Bring the database up to date: content tables, then Better Auth's tables.
//
//   node scripts/migrate.js            apply everything pending
//   node scripts/migrate.js --dry-run  print what would change, touch nothing
//
// Safe to run repeatedly. The server refuses to start until this has run.

import { getMigrations } from 'better-auth/db/migration';
import { auth } from '../src/auth.js';
import { pool, migrateContent, pendingContentMigrations, describeConnection } from '../src/db.js';

const dryRun = process.argv.includes('--dry-run');

try {
  console.log(`database: ${describeConnection()}${dryRun ? '  (dry run)' : ''}`);

  const pending = await pendingContentMigrations();
  if (dryRun) {
    console.log(pending.length ? `content migrations pending: ${pending.join(', ')}` : 'content tables up to date');
  } else {
    const ran = await migrateContent();
    console.log(ran ? `content: ${ran} migration(s) applied` : 'content tables up to date');
  }

  const { toBeCreated, toBeAdded, runMigrations, compileMigrations } = await getMigrations(auth.options);
  if (!toBeCreated.length && !toBeAdded.length) {
    console.log('auth tables up to date');
  } else {
    console.log(`auth tables to create: ${toBeCreated.map((t) => t.table).join(', ') || 'none'}`);
    console.log(`auth tables to alter:  ${toBeAdded.map((t) => t.table).join(', ') || 'none'}`);
    if (dryRun) {
      console.log('\n-- SQL Better Auth would run --');
      console.log(await compileMigrations());
    } else {
      await runMigrations();
      console.log('auth tables migrated');
    }
  }
} catch (err) {
  console.error('migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
