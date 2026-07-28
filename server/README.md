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
