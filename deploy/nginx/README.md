# Deploying the nginx + auth fixes

Apply these in order. Step 1 must come before step 2: adding the
`/applications` route while `JWT_SECRET` is unset would expose the admin
routes that list applications and download applicants' documents.

All commands are safe to re-run.

## 1. Set the shared admin secret on the VPS

`server/applications.js` and the ADMIN dashboard must verify the *same*
signing key. Nothing is currently set, so generate one:

```sh
cd /var/www/afosi-rebuild/server && grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
```

Then print it once so you can paste the identical value into the ADMIN
project's environment variables (Vercel: Settings -> Environment Variables):

```sh
grep '^JWT_SECRET=' /var/www/afosi-rebuild/server/.env
```

While you are in there, the applications service also expects these. Without
them submissions still save and are downloadable from the dashboard, but no
notification email is sent:

```sh
cd /var/www/afosi-rebuild/server && \
  grep -q '^HR_EMAIL=' .env || echo 'HR_EMAIL=careers@afosi.org' >> .env; \
  grep -q '^ADMIN_ORIGINS=' .env || echo 'ADMIN_ORIGINS=https://admin.afosi.org' >> .env; \
  grep -q '^ADMIN_DASHBOARD_URL=' .env || echo 'ADMIN_DASHBOARD_URL=https://admin.afosi.org' >> .env
```

`RESEND_API_KEY` and `RESEND_FROM` need a real key from
https://resend.com/api-keys and a verified sending domain, so add those by
hand when you have them.

Restart so the service picks the new values up:

```sh
pm2 restart afosi-chat
```

## 2. Route /applications to the right backend

Check the diff first, then back up and apply:

```sh
diff /etc/nginx/sites-available/api.afosi.org /var/www/afosi-rebuild/deploy/nginx/api.afosi.org.conf
```

```sh
sudo cp -n /etc/nginx/sites-available/api.afosi.org /etc/nginx/sites-available/api.afosi.org.bak && \
sudo cp /var/www/afosi-rebuild/deploy/nginx/api.afosi.org.conf /etc/nginx/sites-available/api.afosi.org && \
sudo nginx -t && sudo systemctl reload nginx
```

Verify. Before the change this returned `Route not found`; after it, an
unauthenticated GET should be rejected by the service itself:

```sh
curl -s https://api.afosi.org/applications
```

Expected: `{"success":false,"message":"No token provided"}`

## 3. Add the security headers

```sh
diff /etc/nginx/sites-available/afosi.org /var/www/afosi-rebuild/deploy/nginx/afosi.org.conf
```

```sh
sudo cp -n /etc/nginx/sites-available/afosi.org /etc/nginx/sites-available/afosi.org.bak && \
sudo cp /var/www/afosi-rebuild/deploy/nginx/afosi.org.conf /etc/nginx/sites-available/afosi.org && \
sudo nginx -t && sudo systemctl reload nginx
```

Verify:

```sh
curl -sI https://afosi.org | grep -i 'strict-transport\|x-content-type\|x-frame\|referrer'
```

## 4. Before deploying the ADMIN dashboard

`ADMIN/api/*` now requires a valid admin token for every write, and for the
`/api/news/admin/*` reads. Set `JWT_SECRET` in the ADMIN project's environment
to the exact value from step 1 first. If it is missing, those endpoints return
`500 Server auth is not configured` rather than falling open.

Note that `ADMIN/src/services/api.ts` uploads images straight to Supabase
Storage using a hardcoded anon key. That key is public by design, so the
protection has to come from the bucket's storage policies. Confirm in the
Supabase dashboard that anonymous writes to `afosi-images` are not allowed,
otherwise anyone reading the JS bundle can upload into that bucket.
