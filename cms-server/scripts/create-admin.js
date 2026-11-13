// Create a dashboard account. Public sign-up is disabled, so this, the
// Supabase import and the dashboard's Blog team tab (admins only) are the only
// ways an account comes into existence.
//
//   node scripts/create-admin.js --email you@afosi.org --name "Your Name"
//   node scripts/create-admin.js --email writer@afosi.org --name "Writer" --role editor
//
// --role is admin (the default: everything) or editor (a blog editor: the
// Blog tab only).
//
// The password is asked for with the input hidden. It is deliberately not
// accepted as a command-line argument, which would leave it in the shell
// history and visible to anyone listing processes. For automation it can be
// piped on stdin instead.

import readline from 'node:readline';
import { auth, ROLE_ADMIN, ROLE_EDITOR } from '../src/auth.js';
import { pool } from '../src/db.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Echo the prompt itself, swallow every keystroke after it.
    rl._writeToOutput = (text) => {
      if (text.includes(prompt)) rl.output.write(text);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let data = '';
    for await (const chunk of process.stdin) data += chunk;
    return data.replace(/\r?\n$/, '');
  }
  const first = await askHidden('Password (12+ characters): ');
  const second = await askHidden('Repeat password: ');
  if (first !== second) throw new Error('Passwords do not match.');
  return first;
}

try {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const role = arg('role')?.trim() || ROLE_ADMIN;
  if (!email || !name) {
    throw new Error('Usage: node scripts/create-admin.js --email you@afosi.org --name "Your Name" [--role admin|editor]');
  }
  if (role !== ROLE_ADMIN && role !== ROLE_EDITOR) {
    throw new Error(`--role must be ${ROLE_ADMIN} or ${ROLE_EDITOR}`);
  }
  const password = await readPassword();
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');

  const { user } = await auth.api.createUser({
    body: { email, password, name, role },
  });
  console.log(`created ${role === ROLE_EDITOR ? 'blog editor' : 'admin'} ${user.email} (${user.id})`);
} catch (err) {
  const message = err?.body?.message || err.message;
  console.error(`could not create account: ${message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
