#!/usr/bin/env bash
#
# Creates the content API's own Postgres role and database and writes
# cms-server/.env. Run once on the VPS as root:
#
#   sudo bash /var/www/afosi-rebuild/deploy/setup-cms-db.sh
#
# Touches: one new role (afosi_cms) and one new database (afosi_cms). It never
# connects to, reads or alters any other database on the cluster. If the
# database already exists it is dumped to a backup first. Safe to re-run.
#
# BETTER_AUTH_SECRET is generated once and then KEPT on every re-run. It
# encrypts the JWT signing keys and signs every session; changing it signs
# every admin out and breaks admin tokens for the applications service until
# the old key is cleared (see cms-server/README.md, "Rotating the secret").

set -euo pipefail

ROLE=afosi_cms
DBNAME=afosi_cms
APP_DIR=/var/www/afosi-rebuild
ENV_FILE="$APP_DIR/cms-server/.env"
UPLOAD_DIR="$APP_DIR/cms-server/data/uploads"
BACKUP_DIR=/var/backups/afosi-cms

command -v psql >/dev/null || { echo "psql not found" >&2; exit 1; }
[ -d "$APP_DIR/cms-server" ] || { echo "$APP_DIR/cms-server not found, git pull first" >&2; exit 1; }

as_pg() { su - postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }

echo "== existing databases left alone =="
as_pg "SELECT datname FROM pg_database WHERE datistemplate = false" | sed 's/^/   /'

db_exists=$(as_pg "SELECT 1 FROM pg_database WHERE datname = '$DBNAME'" || true)
role_exists=$(as_pg "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'" || true)

if [ "$db_exists" = "1" ]; then
    mkdir -p "$BACKUP_DIR"
    out="$BACKUP_DIR/$DBNAME-$(date +%Y%m%d-%H%M%S).sql.gz"
    echo "== $DBNAME already exists, backing it up first =="
    su - postgres -c "pg_dump '$DBNAME'" | gzip > "$out"
    chmod 600 "$out"
    echo "   backup: $out ($(du -h "$out" | cut -f1))"
fi

# Keep the database password stable across re-runs when the .env already
# has one, so re-running never breaks a running service.
existing() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
DB_PASSWORD=""
if [ -n "$(existing DATABASE_URL)" ]; then
    DB_PASSWORD=$(existing DATABASE_URL | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
fi
[ -n "$DB_PASSWORD" ] || DB_PASSWORD=$(openssl rand -hex 24)

echo "== role $ROLE: $([ "$role_exists" = "1" ] && echo "exists, setting password" || echo "creating") =="
# Password goes through a here-doc, never the command line, so it does not
# appear in the process list.
su - postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $ROLE WITH PASSWORD '$DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
SQL

if [ "$db_exists" != "1" ]; then
    echo "== creating database $DBNAME owned by $ROLE =="
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $DBNAME OWNER $ROLE\""
fi

su - postgres -c "psql -v ON_ERROR_STOP=1 -d $DBNAME" <<SQL
ALTER SCHEMA public OWNER TO $ROLE;
GRANT ALL ON SCHEMA public TO $ROLE;
REVOKE ALL ON DATABASE $DBNAME FROM PUBLIC;
GRANT CONNECT ON DATABASE $DBNAME TO $ROLE;
SQL

AUTH_SECRET=$(existing BETTER_AUTH_SECRET)
if [ -n "$AUTH_SECRET" ]; then
    echo "== keeping the existing BETTER_AUTH_SECRET =="
else
    AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
    echo "== generated a new BETTER_AUTH_SECRET =="
fi

echo "== writing $ENV_FILE =="
umask 077
cat > "$ENV_FILE" <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=8792
DATABASE_URL=postgresql://$ROLE:$DB_PASSWORD@127.0.0.1:5432/$DBNAME
BETTER_AUTH_SECRET=$AUTH_SECRET
BETTER_AUTH_URL=https://admin.afosi.org
TRUSTED_ORIGINS=https://admin.afosi.org
CORS_ORIGINS=https://afosi.org,https://www.afosi.org,https://admin.afosi.org
UPLOAD_DIR=$UPLOAD_DIR
PUBLIC_UPLOAD_BASE=https://api.afosi.org/uploads
MAX_UPLOAD_MB=100
ENV
chown liban:liban "$ENV_FILE"
chmod 600 "$ENV_FILE"

mkdir -p "$UPLOAD_DIR"
chown -R liban:liban "$APP_DIR/cms-server/data"

echo
echo "Done. Next, as liban (no sudo):"
echo "  cd $APP_DIR/cms-server && npm ci --omit=dev && npm run migrate"
