// File-backed store for opportunity applications submitted through the
// website's built-in form (src/apply.js). No database in this project —
// mirrors the pattern in donations-store.js. Uploaded documents live on disk
// under uploads/applications/<opportunity-slug>/<application-id>/; this store
// only holds metadata plus each file's on-disk path (used by the admin-only
// download route, never served publicly).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_FILE = join(__dirname, 'applications-store.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return { applications: {} };
  }
}

// Same serialized-write pattern as donations-store.js — a plain JSON file has
// no locking of its own, so concurrent submissions are queued rather than
// racing each other.
let writeQueue = Promise.resolve();
function withStore(mutate) {
  writeQueue = writeQueue.then(() => {
    const store = readStore();
    mutate(store);
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  });
  return writeQueue;
}

async function saveApplication(record) {
  const id = crypto.randomUUID();
  const entry = { id, createdAt: new Date().toISOString(), reviewed: false, ...record };
  await withStore((store) => {
    store.applications = store.applications || {};
    store.applications[id] = entry;
  });
  return entry;
}

function getApplication(id) {
  const store = readStore();
  return (store.applications && store.applications[id]) || null;
}

// Newest first; optionally narrowed to one opportunity type (employment /
// consulting / volunteering) and/or one opportunity slug — this is what
// powers the "categorize by job/consultancy type" grouping in the admin panel.
function listApplications({ type, opportunitySlug } = {}) {
  const store = readStore();
  const all = Object.values(store.applications || {});
  return all
    .filter((a) => !type || a.opportunity?.type === type)
    .filter((a) => !opportunitySlug || a.opportunity?.slug === opportunitySlug)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function markReviewed(id, reviewed = true) {
  await withStore((store) => {
    if (!store.applications || !store.applications[id]) return;
    store.applications[id].reviewed = reviewed;
  });
}

export { saveApplication, getApplication, listApplications, markReviewed };
