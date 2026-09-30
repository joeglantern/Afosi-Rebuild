// Run the migrations, then stop:
//
//   node migrate.js
//
// Safe to run repeatedly: each migration is applied once and recorded in
// schema_migrations. The service also runs this on every start, so this is
// only needed to migrate without restarting it.

import 'dotenv/config';
import { migrate, describeConnection, pool } from './db.js';

try {
  const { applied } = await migrate();
  console.log(`database: ${describeConnection()}`);
  console.log(applied ? `${applied} migration(s) applied` : 'no migrations needed');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
