#!/usr/bin/env bash
#
# Creates the quiz service's own Postgres role and database, then writes
# quiz-server/.env. Run once on the VPS as root:
#
#   sudo bash /var/www/afosi-rebuild/deploy/setup-quiz-db.sh
#
# What it touches: one new role (afosi_quiz) and one new database (afosi_quiz).
# It never connects to, reads or alters any other database on the cluster. If
# the database already exists it is dumped to a backup file before anything
# else happens, and re-running is safe.

set -euo pipefail

ROLE=afosi_quiz
DBNAME=afosi_quiz
APP_DIR=/var/www/afosi-rebuild
ENV_FILE="$APP_DIR/quiz-server/.env"
BACKUP_DIR=/var/backups/afosi-quiz

command -v psql >/dev/null || { echo "psql not found" >&2; exit 1; }
[ -d "$APP_DIR/quiz-server" ] || { echo "$APP_DIR/quiz-server not found, git pull first" >&2; exit 1; }

as_pg() { su - postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$1\""; }

echo "== existing databases left alone =="
as_pg "SELECT datname FROM pg_database WHERE datistemplate = false" | sed 's/^/   /'

db_exists=$(as_pg "SELECT 1 FROM pg_database WHERE datname = '$DBNAME'" || true)
role_exists=$(as_pg "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'" || true)

# Back up first if there is anything to lose.
if [ "$db_exists" = "1" ]; then
    mkdir -p "$BACKUP_DIR"
    stamp=$(date +%Y%m%d-%H%M%S)
    out="$BACKUP_DIR/$DBNAME-$stamp.sql.gz"
    echo "== $DBNAME already exists, backing it up first =="
    su - postgres -c "pg_dump '$DBNAME'" | gzip > "$out"
    chmod 600 "$out"
    echo "   backup: $out ($(du -h "$out" | cut -f1))"
fi

if [ "$role_exists" = "1" ]; then
    echo "== role $ROLE already exists, rotating its password =="
else
    echo "== creating role $ROLE =="
fi

PASSWORD=$(openssl rand -hex 24)
# Password passed through a here-doc rather than the command line so it never
# shows up in the process list.
su - postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $ROLE WITH PASSWORD '$PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
SQL

if [ "$db_exists" != "1" ]; then
    echo "== creating database $DBNAME owned by $ROLE =="
    su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $DBNAME OWNER $ROLE\""
fi

# Make sure the role owns its own schema and nothing more.
su - postgres -c "psql -v ON_ERROR_STOP=1 -d $DBNAME" <<SQL
GRANT ALL ON SCHEMA public TO $ROLE;
ALTER SCHEMA public OWNER TO $ROLE;
REVOKE ALL ON DATABASE $DBNAME FROM PUBLIC;
GRANT CONNECT ON DATABASE $DBNAME TO $ROLE;
SQL

echo "== writing $ENV_FILE =="
RESULTS_KEY=$(openssl rand -hex 24)
if [ -f "$ENV_FILE" ] && grep -q '^QUIZ_RESULTS_KEY=.\+' "$ENV_FILE"; then
    RESULTS_KEY=$(grep '^QUIZ_RESULTS_KEY=' "$ENV_FILE" | cut -d= -f2-)
    echo "   keeping the existing QUIZ_RESULTS_KEY"
fi

umask 077
cat > "$ENV_FILE" <<ENV
PORT=8791
DATABASE_URL=postgresql://$ROLE:$PASSWORD@127.0.0.1:5432/$DBNAME
QUIZ_ORIGINS=https://afosi.org,https://www.afosi.org
QUIZ_RESULTS_KEY=$RESULTS_KEY
ENV
chown liban:liban "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo
echo "Done. The presenter's results address is:"
echo "  https://afosi.org/quiz/results?key=$RESULTS_KEY"
echo
echo "Next, as liban (no sudo):"
echo "  cd $APP_DIR/quiz-server && npm install && node migrate.js"
