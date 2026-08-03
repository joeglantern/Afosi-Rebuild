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

## Donations (Pesapal — M-Pesa + card)

Same service, three extra routes: `POST /donate/initiate`, `GET /donate/status`,
`GET /donate/ipn`. The Pesapal consumer key/secret live only in `server/.env`;
the browser only ever receives a Pesapal-hosted `redirect_url`.

1. Create a Pesapal merchant account and grab your **consumer key + secret**
   (sandbox first): https://developer.pesapal.com/
2. Add them to `server/.env`:
   ```
   PESAPAL_CONSUMER_KEY=...
   PESAPAL_CONSUMER_SECRET=...
   PESAPAL_ENV=sandbox   # switch to "live" when you're ready to take real payments
   ```
3. Restart the service (`pm2 restart afosi-chat`). On first donation attempt it
   auto-registers the IPN url and logs an id, e.g.:
   ```
   [pesapal] Registered IPN url. Set this in server/.env to skip re-registering on every restart: PESAPAL_IPN_ID=xxxxxxxx-xxxx-...
   ```
   Paste that into `PESAPAL_IPN_ID` in `.env` and restart again — otherwise it
   just re-registers (harmless, but noisy) every time the process restarts.
4. Add the nginx route on `api.afosi.org` (same server block as `/chat`):
   ```nginx
   location /donate {
       proxy_pass http://127.0.0.1:8790;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
   then `sudo nginx -t && sudo systemctl reload nginx`.
5. Test with `curl -s https://api.afosi.org/donate/health` — should return
   `{"ok":true,"configured":true,"env":"sandbox"}`. Then run a real donation on
   `/donate.html` using Pesapal's sandbox test cards / test M-Pesa flow before
   flipping `PESAPAL_ENV` to `live`.

Donations are appended to `server/donations.log` (gitignored, JSON lines) as a
simple audit trail — Pesapal's own dashboard remains the source of truth for
actual settlement.

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
