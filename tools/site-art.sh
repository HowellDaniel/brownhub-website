#!/bin/bash
# Fit any source picture into a reserved art slot, crop-to-fill, and write the
# exact file the site already references — so new artwork is a drop, not an edit.
#
#   tools/site-art.sh collection banners ~/Downloads/ai-flyer.png
#   tools/site-art.sh concept    concept-1 ~/Downloads/ai-poster.png
#   tools/site-art.sh og         ~/Downloads/ai-social.png
#
# Slots are the served sizes. Larger costs data on a Ghanaian plan and smaller
# gets upscaled, so this resamples to cover, crops the centre, and reports bytes.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  collection) DIR=images/collection; TW=800; TH=450; Q=72 ;;
  concept)    DIR=images/concept;    TW=800; TH=800; Q=72 ;;
  og)         DIR=images; TW=1200; TH=630; Q=78; NAME=og-catalog; SRC="${2:-}"; FILL=2 ;;
  *) echo "usage: tools/site-art.sh <collection|concept|og> <name|path> [source-image]" >&2; exit 2 ;;
esac
if [ "${FILL:-}" != 2 ]; then NAME="${2:-}"; SRC="${3:-}"; fi
[ -n "$NAME" ] && [ -n "$SRC" ] && [ -f "$SRC" ] || { echo "no such source: ${SRC:-<none>}" >&2; exit 2; }

OUT="$DIR/$NAME.jpg"
TMP=$(mktemp -d /tmp/bh-artXXXX)
trap 'rm -rf "$TMP"' EXIT

# Cover first: scale so the *shorter* relative side reaches the target, then the
# centre crop trims the overflow. A 1:1 source into 16:9 keeps full height.
SW=$(python3 - "$SRC" "$TW" "$TH" <<'PY'
import re, subprocess, sys
src, tw, th = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
g = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", src],
                   capture_output=True, text=True).stdout
w, h = (int(re.search(r"pixel" + n + r":\s*(\d+)", g).group(1)) for n in ("Width", "Height"))
print(max(1, round(w * max(tw / w, th / h))))
PY
)

sips -s format jpeg -s formatOptions "$Q" "$SRC" --out "$TMP/base.jpg" >/dev/null
sips --resampleWidth "$SW" "$TMP/base.jpg" --out "$TMP/scaled.jpg" >/dev/null
sips --cropToHeightWidth "$TH" "$TW" "$TMP/scaled.jpg" --out "$OUT" >/dev/null

echo "wrote $OUT  $(sips -g pixelWidth -g pixelHeight "$OUT" | awk '/pixel/{printf "%sx", $2}' | sed 's/x$//')  $(stat -f%z "$OUT") bytes"
