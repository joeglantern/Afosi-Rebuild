#!/usr/bin/env bash
#
# Adds a Content-Security-Policy and turns off nginx version disclosure on
# afosi.org. Run on the VPS as root:
#
#   sudo bash /var/www/afosi-rebuild/deploy/apply-security-headers.sh report
#   sudo bash /var/www/afosi-rebuild/deploy/apply-security-headers.sh enforce
#   sudo bash /var/www/afosi-rebuild/deploy/apply-security-headers.sh off
#
# "report" installs the policy as Content-Security-Policy-Report-Only: the
# browser reports what WOULD have been blocked but blocks nothing, so the site
# cannot break. Click through the site with devtools open, confirm the console
# is quiet, then re-run with "enforce". "off" removes it again.
#
# Safe to re-run: it strips any policy it previously added before adding the
# new one, backs the file up first, and rolls back automatically if nginx
# rejects the result.

set -euo pipefail

CONF=/etc/nginx/sites-available/afosi.org
MODE="${1:-report}"

case "$MODE" in
  report)  HEADER="Content-Security-Policy-Report-Only" ;;
  enforce) HEADER="Content-Security-Policy" ;;
  off)     HEADER="" ;;
  *) echo "usage: $0 [report|enforce|off]" >&2; exit 2 ;;
esac

[ -r "$CONF" ] || { echo "cannot read $CONF (run with sudo)" >&2; exit 1; }

# What the site actually loads, verified against the built output:
#   script  - Paystack checkout (donate), the terp chat widget on Google storage
#   style   - Google Fonts stylesheet; 'unsafe-inline' is required because the
#             whole site is built with inline style="" attributes. Inline STYLE
#             is a far smaller risk than inline SCRIPT, which is not allowed
#             here: the build contains no inline <script> at all.
#   img     - the api.afosi.org resize proxy, Supabase storage behind it
#   connect - the CMS/chat/donate API, Paystack's API, the chat widget backend
#   frame   - Paystack's checkout iframe, and the three partner sites embedded
#             as live previews on the homepage
export CSP="default-src 'self'; \
script-src 'self' https://js.paystack.co https://storage.googleapis.com; \
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
font-src 'self' https://fonts.gstatic.com; \
img-src 'self' data: blob: https://api.afosi.org https://*.supabase.co; \
connect-src 'self' https://api.afosi.org https://api.paystack.co https://terp-backend-tkqwl2jv7a-uc.a.run.app; \
frame-src https://checkout.paystack.com https://kiongozi.org https://afosihub.com https://www.kenyayouthclimatehub.org; \
frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"

BACKUP="${CONF}.bak-csp-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP"
echo "backed up -> $BACKUP"

export HEADER
python3 - "$CONF" <<'PY'
import os, re, sys

path = sys.argv[1]
header = os.environ["HEADER"]
csp = " ".join(os.environ["CSP"].split())

lines = open(path).read().splitlines(True)

# Drop anything a previous run of this script added, and the hand-written
# commented-out draft that predates it, so re-running cannot stack duplicates.
keep = [
    ln for ln in lines
    if "Content-Security-Policy" not in ln and "server_tokens" not in ln
]

anchor = next(
    (i for i, ln in enumerate(keep) if "Permissions-Policy" in ln),
    None,
)
if anchor is None:
    anchor = next(
        (i for i, ln in enumerate(keep) if re.match(r"\s*root\s", ln)),
        None,
    )
if anchor is None:
    sys.exit("could not find a place to insert the headers; file left unchanged")

block = ["    server_tokens off;\n"]
if header:
    block.append(f'    add_header {header} "{csp}" always;\n')

keep[anchor + 1 : anchor + 1] = block
open(path, "w").write("".join(keep))
print(f"inserted {'server_tokens off + ' + header if header else 'server_tokens off (CSP removed)'}")
PY

if nginx -t; then
    systemctl reload nginx
    echo
    echo "OK - nginx reloaded."
    [ -n "$HEADER" ] && echo "Header in use: $HEADER"
    echo "Verify with:  curl -sI https://afosi.org/ | grep -i -e content-security -e server"
else
    echo "nginx rejected the config - rolling back" >&2
    cp -a "$BACKUP" "$CONF"
    nginx -t && systemctl reload nginx
    exit 1
fi
