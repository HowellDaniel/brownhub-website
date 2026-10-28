#!/bin/sh
# Rotate a Supabase Edge Function secret without the value ever reaching a shell
# history line, an argv vector, a log or this terminal.
#
#   printf '%s' 'new-key' | tools/rotate-secret.sh GEMINI_API_KEY
#   tools/rotate-secret.sh ARKESEL_API_KEY < /path/to/file/holding/the/key
#
# The owner regenerates the key in the vendor's own dashboard; this only moves the
# replacement into Supabase. Read-only listing: tools/rotate-secret.sh --check
#
# The dashboard bearer comes from the environment (SUPABASE_ACCESS_TOKEN) or a
# 0600 file (BH_TOKEN_FILE) that the owner or the browser recipe produced. It is
# never printed, and neither is the value.

set -eu

REF="${SUPABASE_PROJECT_REF:-rmvyrfqyxgupwuzxadyx}"
API="https://api.supabase.com/v1/projects/$REF/secrets"

case "${1:-}" in
  --check) NAME="" ;;
  "") echo "usage: rotate-secret.sh <SECRET_NAME> | --check   (value on stdin or with < file)" >&2; exit 2 ;;
  *) NAME="$1" ;;
esac

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  :
elif [ -n "${BH_TOKEN_FILE:-}" ] && [ -r "$BH_TOKEN_FILE" ]; then
  SUPABASE_ACCESS_TOKEN=$(cat "$BH_TOKEN_FILE")
else
  echo "no dashboard token: set SUPABASE_ACCESS_TOKEN or BH_TOKEN_FILE" >&2
  echo "(the runbook pulls it from the logged-in dashboard tab without ever printing it)" >&2
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

auth="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

readable() {
  # A rejected call answers with an error object, not the list of secrets, so the
  # reader takes either shape and never touches a value field.
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit("supabase answered something that is not JSON — the bearer is probably stale")
if isinstance(data, dict):
    sys.exit(data.get("message") or data.get("error") or "unexpected answer")
for s in data:
    print(s["name"])
'
}

if [ -z "$NAME" ]; then
  # Names only. GET answers a masked 64-char string per secret, so nothing on this
  # path can leak a value even by accident.
  curl -s -H "$auth" "$API" | readable || { echo "--check: no list read" >&2; exit 4; }
  exit 0
fi

# Values with quotes, backslashes or newlines still have to serialize correctly,
# so JSON is built by a parser and not by string interpolation. The body lives in
# a 0600 file that curl reads from disk; it is never a command-line argument.
body=$(umask 077; mktemp "${TMPDIR:-/tmp}/bhsec.XXXXXX")
out="$body.out"
trap 'rm -f "$body" "$out"' EXIT INT TERM
NAME="$NAME" body="$body" python3 -c '
import json, os, sys
value = sys.stdin.buffer.read().decode("utf-8").strip()
if not value:
    sys.exit("empty value on stdin — nothing was sent")
with open(os.environ["body"], "w") as fh:
    json.dump([{"name": os.environ["NAME"], "value": value}], fh)
'

code=$(curl -s -o "$out" -w '%{http_code}' -X POST -H "$auth" \
  -H 'Content-Type: application/json' --data @"$body" "$API")

listed() { curl -s -H "$auth" "$API" | readable; }

# Supabase answers GET on this path with a 64-char MASK for every value, so the
# list proves the name exists and nothing more. A write takes effect on the next
# cold start of the functions that read it, which takes seconds; the honest proof
# that a rotation worked is always the function behaving with the new key.

case "$code" in
  200 | 201 | 204)
    # Confirm behaviourally: the name is listed after the write. A masked value
    # proves nothing, so the value itself is deliberately not compared.
    if listed | grep -qx "$NAME"; then
      echo "$NAME written to $REF (HTTP $code, name confirmed present)"
    else
      echo "$NAME: HTTP $code but the name is not in the list — read it back before trusting it" >&2
      exit 3
    fi ;;
  401 | 403)
    echo "HTTP $code — the dashboard bearer is stale or lacks this project; reload the dashboard tab and re-pull it" >&2
    exit 4 ;;
  *)
    head -c 300 "$out" >&2; echo " <- HTTP $code" >&2
    exit 5 ;;
esac
