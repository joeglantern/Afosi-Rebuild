#!/usr/bin/env bash
#
# Adds one location block to the api.afosi.org server block so
# https://api.afosi.org/quiz/* reaches the quiz service on 127.0.0.1:8791.
#
#   sudo bash /var/www/afosi-rebuild/deploy/apply-quiz-api.sh
#   sudo bash /var/www/afosi-rebuild/deploy/apply-quiz-api.sh remove
#
# It edits only api.afosi.org, adds only a "location /quiz" block, backs the
# file up first, runs nginx -t, reloads (never restarts), and rolls back on
# its own if nginx rejects the result. No other server block, certificate,
# port or service is touched.

set -euo pipefail

CONF=/etc/nginx/sites-available/api.afosi.org
MODE="${1:-add}"
MARK_START="# ── AFOSI QUIZ (added by deploy/apply-quiz-api.sh) ───────────────────────"
MARK_END="# ── END AFOSI QUIZ ───────────────────────────────────────────────────────"

[ -r "$CONF" ] || { echo "cannot read $CONF (run with sudo)" >&2; exit 1; }

BACKUP="${CONF}.bak-quiz-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP"
echo "backed up -> $BACKUP"

python3 - "$CONF" "$MODE" <<'PY'
import re, sys

path, mode = sys.argv[1], sys.argv[2]
src = open(path).read()

START = "# ── AFOSI QUIZ (added by deploy/apply-quiz-api.sh) ───────────────────────"
END = "# ── END AFOSI QUIZ ───────────────────────────────────────────────────────"

# Strip any block a previous run added, so this can never stack duplicates.
src = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", src, flags=re.S)

if mode == "remove":
    open(path, "w").write(src)
    print("quiz location removed")
    raise SystemExit

BLOCK = f"""{START}
    # Pretest and post-test for the talks. Its own pm2 process (afosi-quiz)
    # on its own port, with its own Postgres database.
    location /quiz {{
        proxy_pass http://127.0.0.1:8791;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }}
{END}
"""

# Insert just before the catch-all "location /" of the api.afosi.org server
# block, so the more specific prefix is matched first and the legacy backend
# on :8743 keeps everything else.
m = re.search(r"\n(\s*)location / \{", src)
if not m:
    raise SystemExit("could not find the catch-all location in api.afosi.org; file left unchanged")

src = src[:m.start()] + "\n" + BLOCK + src[m.start():]
open(path, "w").write(src)
print("quiz location added")
PY

if nginx -t; then
    systemctl reload nginx
    echo
    echo "OK, nginx reloaded."
    echo "Check:  curl -s https://api.afosi.org/quiz/api/health"
else
    echo "nginx rejected the config, rolling back" >&2
    cp -a "$BACKUP" "$CONF"
    nginx -t && systemctl reload nginx
    exit 1
fi
