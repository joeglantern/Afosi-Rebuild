// Minimal Pesapal API 3.0 client for the donation flow.
// Docs: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference
//
// Flow: RequestToken (bearer, 5 min) -> RegisterIPN (once, cache the id) ->
// SubmitOrderRequest (returns a hosted redirect_url) -> customer pays on
// Pesapal's page (M-Pesa / card) -> Pesapal redirects the browser to
// callback_url AND calls the IPN url server-to-server, both carrying
// OrderTrackingId/OrderMerchantReference only (never the payment status,
// by design) -> we call GetTransactionStatus to find out what happened.
//
// process.env is read lazily inside these functions (never cached into
// module-level consts at import time) — dotenv.config() in server.js runs
// after this module's static import is evaluated, so anything read at the
// top level here would see an empty environment.

function getEnv() {
  return (process.env.PESAPAL_ENV || 'sandbox').toLowerCase();
}
function getBase() {
  return getEnv() === 'live' ? 'https://pay.pesapal.com/v3' : 'https://cybqa.pesapal.com/pesapalv3';
}

let ipnId = null;
let ipnIdInitialized = false;
let tokenCache = { token: null, exp: 0 };

function configured() {
  return Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET);
}

async function postJSON(url, body, token) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json.error) {
    throw new Error((json.error && (json.error.message || json.error)) || json.message || `Pesapal request failed (${r.status})`);
  }
  return json;
}

async function getToken() {
  if (!configured()) throw new Error('Pesapal is not configured (missing consumer key/secret).');
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const json = await postJSON(`${getBase()}/api/Auth/RequestToken`, {
    consumer_key: process.env.PESAPAL_CONSUMER_KEY,
    consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
  });
  if (!json.token) throw new Error('Pesapal auth did not return a token.');
  // Token is valid 5 minutes; refresh a minute early to be safe.
  tokenCache = { token: json.token, exp: Date.now() + 4 * 60 * 1000 };
  return json.token;
}

async function ensureIpnId(ipnUrl) {
  if (!ipnIdInitialized) {
    ipnId = process.env.PESAPAL_IPN_ID || null;
    ipnIdInitialized = true;
  }
  if (ipnId) return ipnId;
  const token = await getToken();
  const json = await postJSON(
    `${getBase()}/api/URLSetup/RegisterIPN`,
    { url: ipnUrl, ipn_notification_type: 'GET' },
    token
  );
  if (!json.ipn_id) throw new Error('IPN registration did not return an id.');
  ipnId = json.ipn_id;
  console.log(`[pesapal] Registered IPN url. Set this in server/.env to skip re-registering on every restart: PESAPAL_IPN_ID=${ipnId}`);
  return ipnId;
}

// { reference, amount, currency, description, callbackUrl, cancellationUrl, billing, subscription, ipnUrl }
async function submitOrder(opts) {
  const token = await getToken();
  const notification_id = await ensureIpnId(opts.ipnUrl);
  const body = {
    id: opts.reference,
    currency: opts.currency,
    amount: opts.amount,
    description: opts.description,
    callback_url: opts.callbackUrl,
    cancellation_url: opts.cancellationUrl,
    notification_id,
    billing_address: opts.billing,
  };
  if (opts.subscription) {
    body.account_number = opts.reference;
    body.subscription_details = opts.subscription;
  }
  const json = await postJSON(`${getBase()}/api/Transactions/SubmitOrderRequest`, body, token);
  if (!json.redirect_url) throw new Error('Pesapal did not return a payment redirect url.');
  return json; // { order_tracking_id, merchant_reference, redirect_url }
}

async function getStatus(orderTrackingId) {
  const token = await getToken();
  const r = await fetch(`${getBase()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `Status check failed (${r.status})`);
  return json;
}

export { configured, submitOrder, getStatus, getEnv as getPesapalEnv };
