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

## Opportunity applications (built-in application form)

The website's built-in application form (`/apply.html`, driven by `src/apply.js`)
submits here — `POST /applications/upload` (stage one document) then
`POST /applications` (finalize, JSON) — instead of relying on the legacy
`api.afosi.org/apply` route. Unlike gallery/news/project images, application
documents (CVs, certificates, insurance proof) are **private**: they're
written to this server's own disk under `server/uploads/applications/`
(gitignored), never to the public Supabase Storage buckets, and are only ever
served back out through the admin-only routes below.

Route summary:
- `POST /applications/upload` — public, one file per call (max 10 MB; PDF/PNG/JPG/DOC/DOCX), returns a staging reference.
- `POST /applications` — public, finalizes a submission; moves staged files into their permanent folder, records metadata, emails HR (if Resend is configured).
- `GET /applications?type=consulting&opportunity=<slug>` — **admin-only**, list/filter/categorize.
- `GET /applications/:id` — **admin-only**, one submission's full detail.
- `GET /applications/:id/files/:fileKey` — **admin-only**, downloads one document.
- `PATCH /applications/:id/reviewed` — **admin-only**, marks a submission reviewed.

Admin-only routes are protected by the **same JWT the ADMIN dashboard's own
login issues** (`ADMIN/api/auth.js`) — this service verifies that token
rather than having its own separate login. That only works if `JWT_SECRET`
here is set to the *exact same value* as `JWT_SECRET` in the ADMIN
dashboard's Vercel project settings. Set both, then restart:
```bash
sudo nano .env   # JWT_SECRET=<same long random string as ADMIN's Vercel env>
pm2 restart afosi-chat
```

Add the nginx route on `api.afosi.org` (same server block as `/chat`/`/donate`/`/img`):
```nginx
location /applications {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 12m;  # a bit over the 10MB per-file cap
}
```
then `sudo nginx -t && sudo systemctl reload nginx`.

Also set `ADMIN_ORIGINS` in `.env` to the ADMIN dashboard's real deployed
URL(s) — the admin panel calls these routes cross-origin (from
`admin.afosi.org` to `api.afosi.org`), so its origin must be allowed.

Email notifications (HR notification + applicant confirmation) are optional —
set `RESEND_API_KEY` and `RESEND_FROM` to enable them; without a key,
submissions still save and remain fully visible/downloadable in the admin
dashboard, they just don't trigger an email.
