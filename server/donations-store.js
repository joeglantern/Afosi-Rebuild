// Tiny file-backed store for donation state — no database in this project.
// Tracks each donation by tx_ref (pending -> paid/failed) so /donate/verify
// and the /donate/webhook can both safely no-op on a tx_ref that's already
// settled, which is what makes crediting idempotent. Also caches Paystack
// "plan" codes for recurring donations, keyed by currency:amount, so a
// pm2 restart doesn't spawn a duplicate plan for the same recurring amount.
//
// Writes are serialized through a promise queue since this is a plain JSON
// file with no locking of its own — fine at this project's donation volume.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_FILE = join(__dirname, 'donations-store.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let writeQueue = Promise.resolve();
function withStore(mutate) {
  writeQueue = writeQueue.then(() => {
    const store = readStore();
    mutate(store);
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  });
  return writeQueue;
}

async function savePending(txRef, record) {
  await withStore((store) => {
    store.donations = store.donations || {};
    store.donations[txRef] = { ...record, status: 'pending', createdAt: new Date().toISOString() };
  });
}

function getDonation(txRef) {
  const store = readStore();
  return (store.donations && store.donations[txRef]) || null;
}

async function markStatus(txRef, status, extra = {}) {
  await withStore((store) => {
    if (!store.donations || !store.donations[txRef]) return;
    store.donations[txRef] = { ...store.donations[txRef], ...extra, status, updatedAt: new Date().toISOString() };
  });
}

function getPlan(key) {
  const store = readStore();
  return (store.plans && store.plans[key]) || null;
}

async function savePlan(key, planId) {
  await withStore((store) => {
    store.plans = store.plans || {};
    store.plans[key] = planId;
  });
}

export { savePending, getDonation, markStatus, getPlan, savePlan };
