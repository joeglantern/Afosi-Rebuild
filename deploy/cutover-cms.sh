#!/usr/bin/env bash
# Switch afosi.org's content off Supabase onto cms-server (:8792).
#
#   sudo bash /var/www/afosi-rebuild/deploy/cutover-cms.sh            apply
#   sudo bash /var/www/afosi-rebuild/deploy/cutover-cms.sh rollback   undo
#
# api.afosi.org:   /api/ and /uploads/ go to cms-server. Everything else
#                  (chat, img, donate, applications, quiz) is unchanged, and
#                  "location /" still goes to the old backend on :8743.
# admin.afosi.org: serves the Better Auth dashboard (ADMIN/dist from this
#                  repo) and sends its /api/ to cms-server.
#
# Both files are backed up first. If nginx -t fails, the backups go straight
# back and nothing is reloaded. Safe to re-run.

set -euo pipefail

API=/etc/nginx/sites-available/api.afosi.org
ADM=/etc/nginx/sites-available/admin.afosi.org
NEW_ADMIN_ROOT=/var/www/afosi-rebuild/ADMIN/dist
OLD_ADMIN_ROOT=/var/www/AFOSI_NGO/ADMIN/dist
MARK='# ── AFOSI CMS (deploy/cutover-cms.sh)'

[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }

reload() {
  if nginx -t 2>/tmp/cutover-nginx.log; then
    systemctl reload nginx
  else
    cat /tmp/cutover-nginx.log
    return 1
  fi
}

if [[ "${1:-apply}" == rollback ]]; then
  for f in "$API" "$ADM"; do
    b=$(ls -1t "$f".bak-cms-* 2>/dev/null | head -1 || true)
    [[ -n "$b" ]] || { echo "no backup for $f"; exit 1; }
    cp "$b" "$f"
    echo "restored $f from $b"
  done
  reload
  echo "rolled back: content is served by the old backend again"
  exit 0
fi

# ── preflight ────────────────────────────────────────────────────────────────
curl -fsS http://127.0.0.1:8792/api/health >/dev/null || { echo "cms-server is not answering on :8792; not changing anything"; exit 1; }
[[ -f "$NEW_ADMIN_ROOT/index.html" ]] || { echo "$NEW_ADMIN_ROOT is not built; not changing anything"; exit 1; }

stamp=$(date +%Y%m%d-%H%M%S)
cp "$API" "$API.bak-cms-$stamp"
cp "$ADM" "$ADM.bak-cms-$stamp"
echo "backups: $API.bak-cms-$stamp, $ADM.bak-cms-$stamp"

restore() {
  cp "$API.bak-cms-$stamp" "$API"
  cp "$ADM.bak-cms-$stamp" "$ADM"
  echo "nginx config test failed: both files restored, nothing reloaded"
  exit 1
}

# ── edit ─────────────────────────────────────────────────────────────────────
python3 - "$API" "$ADM" "$MARK" "$NEW_ADMIN_ROOT" "$OLD_ADMIN_ROOT" <<'PY' || restore
import sys
api, adm, mark, new_root, old_root = sys.argv[1:]

def once(text, old, what):
    n = text.count(old)
    if n != 1:
        sys.exit(f"{what}: expected exactly one match, found {n}; not changing anything")

block = f"""    {mark} ──────────────────────────────
    # Content API and uploaded files: cms-server on :8792, local Postgres.
    location /api/ {{
        proxy_pass http://127.0.0.1:8792;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 110M;
        proxy_read_timeout 300s;
    }}
    location /uploads/ {{
        proxy_pass http://127.0.0.1:8792;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }}
    # ── END AFOSI CMS ─────────────────────────────────────────────────────

"""

t = open(api).read()
if mark in t:
    print("api.afosi.org: already switched")
else:
    anchor = "    location / {\n        proxy_pass http://localhost:8743;"
    once(t, anchor, "api.afosi.org 'location /'")
    open(api, "w").write(t.replace(anchor, block + anchor))
    print("api.afosi.org: /api/ and /uploads/ -> :8792")

t = open(adm).read()
if f"root {new_root};" in t and "proxy_pass http://127.0.0.1:8792/api/;" in t:
    print("admin.afosi.org: already switched")
else:
    once(t, f"root {old_root};", "admin.afosi.org root")
    once(t, "proxy_pass http://localhost:8743/api/;", "admin.afosi.org /api/")
    t = t.replace(f"root {old_root};", f"root {new_root};")
    t = t.replace("proxy_pass http://localhost:8743/api/;", "proxy_pass http://127.0.0.1:8792/api/;")
    open(adm, "w").write(t)
    print("admin.afosi.org: new dashboard, /api/ -> :8792")
PY

reload || restore

# ── verify ───────────────────────────────────────────────────────────────────
sleep 1
check() { printf '  %-52s %s\n' "$1" "$(curl -s -o /dev/null -w '%{http_code}' "$1")"; }
echo "after the switch (expect 200s):"
check "https://api.afosi.org/api/news?limit=1"
check "https://api.afosi.org/api/gallery?limit=1"
check "https://api.afosi.org/api/projects"
check "https://api.afosi.org/api/opportunities"
check "https://admin.afosi.org/"
check "https://admin.afosi.org/api/health"
echo "undo with: sudo bash $0 rollback"
