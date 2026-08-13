// Minimal Paystack client for the donation flow.
// Docs: https://paystack.com/docs/payments/accept-payments/
//       https://paystack.com/docs/developer-tools/inlinejs/
//       https://paystack.com/docs/payments/webhooks/
//
// Flow: our backend hands the browser a public key + server-generated
// reference + authoritative amount/currency (and a plan code for recurring
// gifts) -> the donor pays inside Paystack's own inline popup (no page
// navigation) -> the popup's onSuccess fires client-side, which the frontend
// immediately posts to our /donate/verify -> this module calls Paystack's
// server-side verify endpoint so we never trust the client-side callback
// alone. A webhook is a second, independent path to the same verification.
//
// Amounts: Paystack expects the smallest currency subunit (KES cents), so
// every amount in/out of their API is the shilling amount * 100 — helpers
// below do that conversion at the boundary so the rest of the codebase can
// keep working in whole KES like it already does for logging/storage.
//
// process.env is read lazily inside these functions, never cached into
// module-level consts at import time — dotenv.config() in server.js runs
// after this module's static import is evaluated, so top-level consts would
// silently capture an empty environment (same gotcha as every other
// processor this codebase has integrated).

import { timingSafeEqual, createHmac } from 'node:crypto';

const API_BASE = 'https://api.paystack.co';

function getPublicKey() {
  return process.env.PAYSTACK_PUBLIC_KEY || '';
}
function getSecretKey() {
  return process.env.PAYSTACK_SECRET_KEY || '';
}

function configured() {
  return Boolean(getPublicKey() && getSecretKey());
}

function toSubunit(amountKES) {
  return Math.round(Number(amountKES) * 100);
}
function fromSubunit(amountSubunit) {
  return Number(amountSubunit) / 100;
}

async function verifyTransaction(reference) {
  const r = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.status || !json.data) {
    throw new Error(json.message || `Paystack verify failed (${r.status})`);
  }
  // { status: 'success'|'failed'|..., amount (subunit), currency, reference, channel, gateway_response, paid_at }
  return { ...json.data, amount: fromSubunit(json.data.amount) };
}

// A Paystack "plan" is their subscription primitive for recurring card
// billing. Callers should cache the returned plan_code per amount/currency
// rather than creating a fresh plan on every donation (see donations-store.js
// getPlan/savePlan — same caching pattern used for Flutterwave payment plans
// before this migration).
//
// Caveat worth knowing before relying on this: Paystack subscriptions
// auto-charge a saved card authorization. M-Pesa/mobile money has no
// equivalent token to auto-debit, so a "monthly" donation only actually
// recurs if the donor pays by card — server.js restricts the MONTHLY
// frequency to the 'card' channel for that reason, and the confirm-donation
// copy on the frontend says so.
async function createPlan(amountKES, currency) {
  const r = await fetch(`${API_BASE}/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSecretKey()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name: `AFOSI Monthly Donation - ${currency} ${amountKES}`,
      amount: toSubunit(amountKES),
      interval: 'monthly',
      currency,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.data?.plan_code) throw new Error(json.message || 'Could not create a monthly plan.');
  return json.data.plan_code;
}

// Paystack signs webhook deliveries with x-paystack-signature: a hex HMAC
// SHA-512 of the *raw* request body, keyed with your secret key (not a
// shared static hash like Flutterwave used — this one has to be computed).
// server.js captures the raw body via express.json()'s verify() option
// specifically so this function has bytes to hash, not the re-serialized
// parsed object (which can differ byte-for-byte from what Paystack sent).
function verifyWebhookSignature(rawBody, headerSignature) {
  const secret = getSecretKey();
  if (!secret || !headerSignature || !rawBody) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(headerSignature), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { configured, getPublicKey, verifyTransaction, createPlan, verifyWebhookSignature, toSubunit };
