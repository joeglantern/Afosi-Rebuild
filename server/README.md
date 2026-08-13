# AFOSI chat service

Isolated backend for the website assistant. Holds the OpenAI key **server-side only**,
moderates + rate-limits every user message, and answers from a fixed AFOSI knowledge
base plus live news/opportunities from the public API.

- Listens on `127.0.0.1:8790` (behind nginx).
- Public route: `https://api.afosi.org/chat` → this service.
- Never commits secrets: the key lives in `server/.env` (gitignored).

## First-time deploy (on the VPS)

```bash
cd /var/www/afosi-rebuild && sudo git pull

# 1. Install deps for the service
cd server && sudo npm install

# 2. Create the env file with a FRESH (rotated) OpenAI key
sudo cp .env.example .env
sudo nano .env         # set OPENAI_API_KEY=sk-... (the rotated key)

# 3. Start it under pm2 (own process; does not touch other apps)
pm2 start server.js --name afosi-chat
pm2 save

# 4. Health check
curl -s http://127.0.0.1:8790/health      # -> {"ok":true,...}
```

Then add the nginx route on `api.afosi.org` (see project chat deploy notes) and reload nginx.

## Redeploy after changes

```bash
cd /var/www/afosi-rebuild && sudo git pull
cd server && sudo npm install && pm2 restart afosi-chat
```

## Environment

See `.env.example`. Key vars: `OPENAI_API_KEY` (required), `OPENAI_MODEL`
(default `gpt-4o-mini`), `PORT` (default `8790`), `ALLOWED_ORIGINS`.

## Safeguards

- OpenAI moderation on every user message; flagged input is refused, never sent to the chat model.
- Per-IP rate limit: 20 messages / 10 minutes.
- Input length caps + capped `max_tokens` to bound cost.
- Prompt-injection guardrails in the system prompt; answers restricted to AFOSI topics.

## Donations (Paystack — M-Pesa + card + bank transfer)

Same service, four extra routes: `GET /donate/config`, `POST /donate/initiate`,
`POST /donate/verify`, `POST /donate/webhook`. The Paystack secret key lives
only in `server/.env`; the browser only ever receives the **public** key
(safe to expose — that's what it's for) plus a server-generated `reference`
and authoritative amount/currency. Checkout itself happens inline, in a popup
Paystack's own script renders on top of `/donate.html` — no redirect away
from the site, no card data ever touching this backend.

Every payment is verified server-side (`GET /transaction/verify/:reference`)
before being marked paid, both right after checkout (`/donate/verify`, called
by the frontend the moment Paystack's popup fires `onSuccess`) and again
asynchronously via webhook — the client-side popup callback is never trusted
on its own. Both paths are idempotent on `reference` (`server/donations-store.js`),
so a donation can never be double-credited.

1. Create a Paystack account and grab your **public + secret key** (test mode
   first): https://dashboard.paystack.com/#/settings/developers
2. Add them to `server/.env`:
   ```
   PAYSTACK_PUBLIC_KEY=pk_test_...
   PAYSTACK_SECRET_KEY=sk_test_...
   ```
3. In the Paystack dashboard go to **Settings > API Keys & Webhooks**, set the
   webhook URL to `https://api.afosi.org/donate/webhook`. Unlike Flutterwave,
   there's no separate secret to copy — the webhook is signed with the same
   secret key already in `server/.env`.
4. Restart the service (`pm2 restart afosi-chat`).
5. No new nginx route needed — `/donate/verify` and `/donate/webhook` are
   subpaths of the existing `location /donate` block (same server block as
   `/chat`/`/img`), which already proxies everything under `/donate` to this
   service.
6. Test with `curl -s https://api.afosi.org/donate/health` — should return
   `{"ok":true,"configured":true}`. Then run a real donation on
   `/donate.html` using Paystack's test cards / test mobile money flow before
   switching the keys above to their **live** (`pk_live_`/`sk_live_`)
   equivalents.

Recurring (monthly) donations use a Paystack "plan" — one is created
automatically per distinct amount and cached in `server/donations-store.json`
so repeat donors at the same amount reuse it instead of spawning a new plan
every time. Paystack subscriptions only auto-charge a saved **card** —
there's no mobile-money equivalent — so the frontend restricts the monthly
option to card payments.

Donations are appended to `server/donations.log` (gitignored, JSON lines) as a
simple audit trail — Paystack's own dashboard remains the source of truth
for actual settlement.

## Image proxy (gallery/news photos)

Gallery and news photos are uploaded through the AFOSI admin dashboard
straight to Supabase Storage at their original size (some 10-20MB+). We don't
control that backend, so `server/imgproxy.js` fetches the original once,
resizes + recompresses it to WebP with `sharp`, and caches the result to
`server/img-cache/` (gitignored) — every request after the first for a given
image/width is served straight from disk.

Route: `GET /img?url=<supabase-image-url>&w=<width>`. Add the nginx route on
`api.afosi.org` (same server block as `/chat`/`/donate`):
```nginx
location /img {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
then `sudo nginx -t && sudo systemctl reload nginx`.

`IMG_ALLOWED_HOSTS` in `.env` restricts which hostnames it will fetch from —
only needs changing if AFOSI moves to a different Supabase project.
