# afosi-cms

The content API for afosi.org (news, projects, opportunities, gallery,
uploads) on the VPS's own Postgres, with **Better Auth** for the admin
dashboard. It replaces the Supabase-backed backend that runs on `:8743`
(`/var/www/AFOSI_NGO/backend`, owned by `onsomu`).

The public site and the dashboard see the same API: same paths, same response
shapes, same messages. What changed is underneath, and the security model.

## Status

| Done | Not yet |
|---|---|
| Service, schema, Better Auth, tests | Import the data from Supabase (blocked: the project is restricted, every read returns 402) |
| Dashboard (`ADMIN/`) converted to Better Auth | Cut over nginx to this service |
| Applications service accepts Better Auth tokens | Retire `ADMIN/api/` (old Vercel functions) and the Supabase project |

Until cutover, the old backend keeps serving the site. Nothing here is
reachable from outside: the service listens on `127.0.0.1:8792` only.

## Layout

```
src/
  server.js        boot; refuses to start on an unmigrated database
  app.js           express app, routes, security headers, rate limits
  auth.js          Better Auth configuration
  config.js        environment, validated; fails closed
  db.js            pool + content migration runner
  http.js          requireAdmin, origin guard, helpers
  storage.js       uploads on disk, type checked by content
  routes/          news, projects, opportunities, gallery, upload
migrations/        content tables (numbered SQL, never edited once applied)
scripts/
  migrate.js       content + auth tables;  --dry-run prints the SQL
  create-admin.js  the only way to make an account (sign-up is off)
test/              end-to-end tests against a real Postgres
```

## First-time setup on the VPS

```sh
# 1. database, role and .env (root, once)
sudo bash /var/www/afosi-rebuild/deploy/setup-cms-db.sh

# 2. as liban
cd /var/www/afosi-rebuild/cms-server
npm ci --omit=dev
npm run migrate                 # add --dry-run first to see the SQL
node scripts/create-admin.js --email you@afosi.org --name "Your Name"
pm2 start src/server.js --name afosi-cms --time && pm2 save

curl -s http://127.0.0.1:8792/api/health
```

## Auth

- **Better Auth 1.7.7**, pinned exactly: it is security code.
- Sessions are httpOnly cookies on `admin.afosi.org`, stored in Postgres,
  24 hours, refreshed hourly while in use. The old system kept a 24 hour JWT
  in localStorage, where any script on the page could read it.
- **Sign-up is disabled.** Accounts come from `create-admin.js`, or from the
  Supabase import.
- Only users with role `admin` (Better Auth admin plugin) may change content.
  Every write requires it. The old backend left gallery, opportunities and
  upload writes open to anyone.
- **Passwords:** new ones are scrypt. Accounts imported from the old
  `admin_users` table keep their bcrypt hash, which still works; it is
  rewritten as scrypt on that person's first sign-in. Nobody needs a reset.
- **Origin checks:** Better Auth only enforces its own origin check when
  `NODE_ENV=production` (verified against 1.7.7: in any other mode a sign-in
  from an untrusted origin succeeds). `src/http.js` adds the same check in
  front of every write, in every environment.
- **Rate limits:** 5 sign-ins a minute per address, counts stored in Postgres
  so a restart does not reset them.
- **Other services:** the JWT plugin issues short-lived tokens at
  `/api/auth/token` and publishes public keys at `/api/auth/jwks`. The
  applications service (`../server/admin-auth.js`) verifies against those, so
  it can check an admin without holding any shared secret.

## Rotating the secret

`BETTER_AUTH_SECRET` signs sessions **and encrypts the JWT signing key**
stored in the `jwks` table. If it changes:

- every admin is signed out (expected), and
- `/api/auth/token` fails with `Failed to decrypt private key`, so the
  dashboard's Applications tab stops working.

Sign-in and the rest of the dashboard keep working: the JWT plugin is set not
to sign a token onto every session, precisely so this failure stays contained
(found in testing, see the comment in `src/auth.js`). To recover, delete the
old key; a new one is created on the next request:

```sh
psql "$(grep ^DATABASE_URL= .env | cut -d= -f2-)" -c 'DELETE FROM jwks'
```

`deploy/setup-cms-db.sh` never regenerates an existing secret.

## Uploads

Files go to `UPLOAD_DIR`, served at `PUBLIC_UPLOAD_BASE`, in folders named
after the old buckets (`afosi-images`, `afosi-news`, `afosi-projects`), so
migrating old URLs is a prefix swap:

```
https://pmigmljjnyucethipdtk.supabase.co/storage/v1/object/public/<bucket>/<path>
-> https://api.afosi.org/uploads/<bucket>/<path>
```

A file's type is decided by its bytes, not its name: JPEG, PNG, GIF, WebP and
PDF only. An HTML file renamed `.png` is refused.

## Tests

```sh
docker run -d --name afosi-cms-test -e POSTGRES_USER=afosi_cms \
  -e POSTGRES_PASSWORD=localtestonly -e POSTGRES_DB=afosi_cms \
  -p 127.0.0.1:55432:5432 postgres:16
TEST_DATABASE_URL=postgresql://afosi_cms:localtestonly@127.0.0.1:55432/afosi_cms npm test
```

The suite wipes the database it is given, so it refuses any URL that does
not look disposable.

## Known noise

On start Better Auth may log `Field lastRequest in table rateLimit has a
different type in the database. Expected number but got int8`. Its own
migration creates that column as `bigint` and its own checker then disagrees.
Harmless: rate limiting is covered by the tests.
