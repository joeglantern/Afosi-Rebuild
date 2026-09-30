// Run the migrations, then stop. Used on the VPS before the service starts:
//
//   node migrate.js
//
// Safe to run repeatedly: each migration is applied once and recorded in
// schema_migrations.

import 'dotenv/config';
import { migrate, DB_PATH } from './db.js';

const { applied } = migrate();
console.log(`database: ${DB_PATH}`);
console.log(applied ? `${applied} migration(s) applied` : 'no migrations needed');
