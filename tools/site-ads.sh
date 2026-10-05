#!/bin/zsh
# tools/site-ads.sh — rebuild the display-ad creative kit.
#
# These are the files the owner uploads to Google Ads and Meta Ads so BrownHub
# appears on other people's websites around the world. Nothing here is served by
# the site and nothing here is a new URL: the repo keeps one unserved folder, the
# same way it keeps the four layout studies.
#
# Every word on every creative is already published on brownhub283.com — the hero
# line, the service names, GH₵300 as the lowest priced service in js/store.js, the
# WhatsApp line, the domain. No figure is invented for an ad.
#
# Sizes are the networks' own standards. Google takes a static image per size at
# that exact pixel dimension and caps the file at 150 KB; Meta wants the larger
# square, landscape and story cuts. Each creative is therefore shot at 2x for
# crisp type and downsampled to the exact target, and the byte count is printed so
# an over-weight file is obvious rather than a rejection at upload.
#
#   tools/site-ads.sh              writes ads/*.png into the repo
#   tools/site-ads.sh /tmp/ads     writes them somewhere else to look at
set -u
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-ads}
TMP=$(mktemp -d /tmp/bhads.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# key:network:width:height:scale — scale is the device pixel ratio the shot is
# taken at. The file lands as <network>-<w>x<h>.png because both consoles ask for
# a size by name, and a folder of files that read like the form they fill is the
# difference between uploading the right set and guessing.
FORMATS=(
  "mr:google:300:250:2"
  "lr:google:336:280:2"
  "lb:google:728:90:2"
  "bb:google:970:250:2"
  "mb:google:320:50:2"
  "hp:google:300:600:2"
  "ws:google:160:600:2"
  "sq:meta:1080:1080:1"
  "fd:meta:1200:628:1"
  "st:meta:1080:1920:1"
)

cat > "$TMP/ad.tpl" <<'TPL'
<!doctype html><html data-f="__FMT__"><head><meta charset="utf-8"><style>
@font-face{font-family:"Hanken";src:file://__REPO__/fonts/hanken-grotesk-latin.woff2;format("woff2");font-weight:400 800;font-display:block}
@font-face{font-family:"Hanken";src:file://__REPO__/fonts/hanken-grotesk-italic-latin.woff2;format("woff2");font-weight:400 800;font-style:italic;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:__W__px;height:__H__px;overflow:hidden}
body{font-family:"Hanken",-apple-system,"Helvetica Neue",sans-serif;background:#1b0b0c;color:#fffbf7;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}

/* The site's own picture: warm ink, a red aura off to one side, gold for the
   eyebrow and a red pill for the action. Same order of information as the hero. */
.ad{position:relative;width:100%;height:100%;display:flex;flex-direction:column;
  padding:var(--pad);gap:var(--gap);overflow:hidden;
  background:radial-gradient(120% 130% at var(--aura), rgba(222,42,47,.62) 0%, rgba(222,42,47,0) 58%),
             radial-gradient(90% 110% at 108% -12%, rgba(177,125,65,.34) 0%, rgba(177,125,65,0) 60%),
             #1b0b0c}
.ad:after{content:"";position:absolute;inset:0;border:var(--edge) solid rgba(233,214,198,.16);
  border-radius:var(--radius);pointer-events:none}

.brand{display:flex;align-items:center;gap:var(--brandgap);flex:none}
.badge{width:var(--badge);height:var(--badge);flex:none;border-radius:22%;background:#fff;
  background-image:url("file://__REPO__/images/logo.png");background-size:cover;background-position:center}
.wordmark{font-size:var(--word);font-weight:800;letter-spacing:-.02em;line-height:1;color:#fffbf7}
.wordmark i{font-style:normal;color:#f4545a}

.head{font-size:var(--head);line-height:1.06;font-weight:800;letter-spacing:-.028em;flex:none}
.head em{font-style:normal;color:#f4545a}
/* The 50px and 90px rails cannot hold a whole sentence, so those two cuts swap in
   the shortest true line the studio has: its published lowest price. */
.head .tight{display:none}
html[data-flagged] body{outline:6px solid #00e05a;outline-offset:-6px}

.eyebrow{font-size:var(--eyebrow);font-weight:700;letter-spacing:.11em;text-transform:uppercase;
  color:#d8a86a;flex:none}
.list{font-size:var(--list);line-height:var(--listlh);color:#c3a79f;flex:none}
.price{font-size:var(--price);font-weight:800;letter-spacing:-.02em;color:#fffbf7;flex:none}
.price s{text-decoration:none;color:#b17d41;font-weight:700}

.foot{margin-top:auto;display:flex;align-items:center;gap:var(--footgap);flex:none}
/* inline-block, not flex: the label is a span plus a text node and a flex container
   drops the space between them, which reads as "Chat onWhatsApp" at large sizes. */
.cta{display:inline-block;background:#de2a2f;color:#fff;
  font-weight:800;font-size:var(--cta);line-height:1.15;padding:var(--ctapad);border-radius:999px;
  box-shadow:0 .5em 1.4em -.5em rgba(222,42,47,.7);white-space:nowrap}
.tel{font-size:var(--tel);color:#c3a79f;font-weight:600;white-space:nowrap}
.url{font-size:var(--url);font-weight:800;letter-spacing:.01em;color:#fffbf7;white-space:nowrap}
.url b{color:#f4545a}
/* No QR code in any of these, deliberately. Every one of these frames is on a
   screen the viewer is already holding: a click does what a scan would do, and a
   code printed on a monitor is an obstacle rather than an invitation. The scan card
   stays where it belongs — on the site's own footer, and in print. */

/* ---------- 300x250 medium rectangle: the one that runs most often ---------- */
html[data-f="mr"]{--pad:15px;--gap:5px;--edge:1px;--radius:0;--aura:88% -14%;--brandgap:8px;--badge:24px;
  --word:14px;--head:26px;--eyebrow:8px;--list:10.5px;--listlh:1.4;--price:13px;--footgap:9px;
  --cta:12px;--ctapad:8px 14px;--tel:10px;--url:10.5px}
html[data-f="mr"] .eyebrow{margin-top:2px}
/* The foot is three nowrap items and 300px is not wide enough for all of them, so
   the row wraps and the URL takes the second line. Nothing is clipped. */
html[data-f="mr"] .foot{flex-wrap:wrap;row-gap:6px}

/* ---------- 336x280 large rectangle: same shape, one more line of room ---------- */
html[data-f="lr"]{--pad:16px;--gap:6px;--edge:1px;--radius:0;--aura:88% -14%;--brandgap:9px;--badge:28px;
  --word:16.5px;--head:31px;--eyebrow:9px;--list:12px;--listlh:1.5;--price:14.5px;--footgap:10px;
  --cta:13.5px;--ctapad:10px 17px;--tel:11px;--url:12px}
html[data-f="lr"] .foot{flex-wrap:wrap;row-gap:6px}

/* ---------- 728x90 leaderboard: one line, so the sentence has to be short ---------- */
html[data-f="lb"]{--pad:0 20px;--gap:0;--edge:1px;--radius:0;--aura:82% -60%;--brandgap:8px;--badge:30px;
  --word:16px;--head:21px;--eyebrow:9px;--list:12px;--listlh:1;--price:14px;--footgap:14px;
  --cta:13px;--ctapad:10px 16px;--tel:11px;--url:12px}
html[data-f="lb"] .ad{flex-direction:row;align-items:center;justify-content:space-between}
html[data-f="lb"] .head{margin-left:14px}
html[data-f="lb"] .list,html[data-f="lb"] .url,html[data-f="lb"] .price,html[data-f="lb"] .eyebrow,
html[data-f="lb"] .tel{display:none}
html[data-f="lb"] .foot{margin-top:0;align-items:center}
html[data-f="lb"] .brand:after{content:"";width:1px;height:26px;background:rgba(233,214,198,.2);margin-left:12px}

/* ---------- 970x250 billboard: the wide one gets the full sentence back ---------- */
html[data-f="bb"]{--pad:24px 32px;--gap:7px;--edge:1px;--radius:0;--aura:86% -22%;--brandgap:11px;--badge:34px;
  --word:19px;--head:34px;--eyebrow:10.5px;--list:14px;--listlh:1.5;--price:17px;--footgap:14px;
  --cta:15px;--ctapad:12px 20px;--tel:12.5px;--url:14px}
html[data-f="bb"] .ad{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto auto 1fr auto;
  align-items:start}
html[data-f="bb"] .brand{grid-column:1}
html[data-f="bb"] .eyebrow{grid-column:1;margin-top:0}
html[data-f="bb"] .head{grid-column:1;max-width:19ch}
html[data-f="bb"] .list{grid-column:1}
html[data-f="bb"] .price{grid-column:1}
html[data-f="bb"] .foot{grid-column:2;grid-row:1/6;flex-direction:column;align-items:flex-end;justify-content:flex-end;
  gap:12px;margin-top:0}

/* ---------- 320x50 mobile banner: brand, four words, a button ---------- */
html[data-f="mb"]{--pad:0 12px;--gap:0;--edge:1px;--radius:0;--aura:78% -140%;--brandgap:7px;--badge:22px;
  --word:14px;--head:15px;--eyebrow:8px;--list:11px;--listlh:1;--price:12px;--footgap:9px;
  --cta:11.5px;--ctapad:7px 12px;--tel:10px;--url:11px}
html[data-f="mb"] .ad{flex-direction:row;align-items:center;justify-content:space-between}
html[data-f="mb"] .wordmark,html[data-f="mb"] .list,html[data-f="mb"] .price,
html[data-f="mb"] .url,html[data-f="mb"] .eyebrow,html[data-f="mb"] .tel,html[data-f="mb"] .verb{display:none}
html[data-f="mb"] .head .wide{display:none}
html[data-f="mb"] .head .tight{display:inline}
html[data-f="mb"] .head{font-size:15px;line-height:1.15}
html[data-f="mb"] .foot{margin-top:0}

/* ---------- 300x600 half page ---------- */
/* The tall rails have far more frame than the sentence needs, so instead of a hole
   in the middle they spread their rows to the height: the same five lines, one at
   the top of each fifth. */
html[data-f="hp"]{--pad:24px;--gap:14px;--edge:1px;--radius:0;--aura:80% -10%;--brandgap:10px;--badge:32px;
  --word:18px;--head:40px;--eyebrow:10px;--list:14px;--listlh:1.55;--price:17px;--footgap:10px;
  --cta:15px;--ctapad:12px 16px;--tel:12px;--url:14px}
html[data-f="hp"] .ad{justify-content:space-between}
html[data-f="hp"] .cta{width:100%}
/* The foot carries margin-top:auto in the base so it sits under the sentence in the
   short frames; here it would eat all the free space and leave one hole in the
   middle. Zeroing it lets space-between do the spreading instead. */
html[data-f="hp"] .foot{margin-top:0;flex-wrap:wrap;justify-content:space-between;row-gap:8px}
html[data-f="hp"] .url,html[data-f="hp"] .tel{width:100%}

/* ---------- 160x600 wide skyscraper: narrow, so the headline breaks early ---------- */
html[data-f="ws"]{--pad:16px;--gap:12px;--edge:1px;--radius:0;--aura:86% -10%;--brandgap:7px;--badge:24px;
  --word:13px;--head:27px;--eyebrow:8px;--list:12px;--listlh:1.5;--price:13.5px;--footgap:8px;
  --cta:12.5px;--ctapad:11px 12px;--tel:10.5px;--url:11.5px}
html[data-f="ws"] .ad{justify-content:space-between}
html[data-f="ws"] .cta{width:100%;white-space:normal;text-align:center}
html[data-f="ws"] .wordmark,html[data-f="ws"] .eyebrow{display:none}
html[data-f="ws"] .foot{margin-top:0;flex-wrap:wrap;row-gap:7px}
html[data-f="ws"] .tel,html[data-f="ws"] .url{width:100%}

/* ---------- 1080x1080 Meta square: the same rectangle, blown up ---------- */
html[data-f="sq"]{--pad:72px;--gap:30px;--edge:2px;--radius:34px;--aura:88% -16%;--brandgap:22px;--badge:72px;
  --word:44px;--head:100px;--eyebrow:22px;--list:34px;--listlh:1.5;--price:44px;--footgap:24px;
  --cta:32px;--ctapad:28px 46px;--tel:25px;--url:29px}
/* A square blown up from a rectangle keeps the rectangle's proportions and ends up
   with a band of nothing across its middle, so the type is scaled to the frame
   rather than the frame being padded around the type. */
html[data-f="sq"] .ad{justify-content:space-between}
html[data-f="sq"] .foot{margin-top:0;flex-wrap:wrap;row-gap:26px}

/* ---------- 1200x628 Meta landscape feed ---------- */
html[data-f="fd"]{--pad:56px 64px;--gap:16px;--edge:2px;--radius:34px;--aura:92% -30%;--brandgap:18px;--badge:56px;
  --word:34px;--head:72px;--eyebrow:17px;--list:26px;--listlh:1.5;--price:34px;--footgap:20px;
  --cta:27px;--ctapad:22px 36px;--tel:22px;--url:26px}
html[data-f="fd"] .head{max-width:22ch}
html[data-f="fd"] .foot{margin-top:34px}

/* ---------- 1080x1920 Meta story ---------- */
/* A story is watched in the middle of the screen and the networks lay their own
   buttons over the bottom of it, so the whole stack is centred and kept clear of
   the last fifth of the frame. */
html[data-f="st"]{--pad:76px 76px 300px;--gap:26px;--edge:3px;--radius:44px;--aura:76% -6%;--brandgap:24px;
  --badge:76px;--word:48px;--head:112px;--eyebrow:24px;--list:36px;--listlh:1.5;--price:48px;--footgap:28px;
  --cta:36px;--ctapad:32px 48px;--tel:29px;--url:34px}
html[data-f="st"] .ad{justify-content:center}
html[data-f="st"] .head{margin-top:14px}
html[data-f="st"] .cta{width:100%}
html[data-f="st"] .foot{flex-direction:column;align-items:stretch;gap:22px;margin-top:64px}
html[data-f="st"] .url,html[data-f="st"] .tel{text-align:center}
</style></head><body><div class="ad">
  <div class="brand"><span class="badge"></span><span class="wordmark">Brown<i>Hub</i></span></div>
  <div class="eyebrow">Accra graphic design studio</div>
  <div class="head"><span class="wide">We turn ideas into <em>powerful</em> visuals.</span><span class="tight">Designs from GH&#8373;300</span></div>
  <div class="list">Logos &amp; brand identity · Flyers, posters &amp; print · Packaging · Social media · Websites</div>
  <div class="price">Designs from GH&#8373;300</div>
  <div class="foot">
    <span class="cta"><span class="verb">Chat on </span>WhatsApp</span>
    <span class="tel">+233 50 295 4541</span>
    <span class="url">www.brown<b>hub</b>283.com</span>
  </div>
</div>
<script>
/* A clipped creative is rejected at upload, and a crop is easy to miss when ten
   frames are being looked through. So the page marks itself: anything that runs
   past the frame paints a green border and writes its own class into data-clip,
   which tools/site-ads.sh reads back out of --dump-dom and prints beside the
   file size. A clean frame says clip=none.
   Two things that look obvious here are wrong, and both were measured:
   --dump-dom ignores --window-size (the probe runs in a 500px-wide viewport), so
   the frame is read off <body>, which the template pins to the exact pixel size;
   and at 'load' the webfont may still be swapping, which changes every line count,
   so the check waits for document.fonts. */
function probe(){var d=document.documentElement,bad=[],
  f=document.body.getBoundingClientRect();
  [].forEach.call(document.querySelectorAll('.ad *'),function(el){
    if(getComputedStyle(el).display==='none')return;
    var b=el.getBoundingClientRect();
    if(!b.width&&!b.height)return;
    if(b.right>f.width+.5||b.bottom>f.height+.5||b.left<f.left-.5||b.top<f.top-.5)
      bad.push(el.className||el.tagName);
  });
  var ad=document.querySelector('.ad');
  if(ad.scrollHeight>f.height+.5||ad.scrollWidth>f.width+.5)bad.push('block');
  d.setAttribute('data-clip',bad.length?bad.join(','):'none');
  if(bad.length)d.setAttribute('data-flagged','1');
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(probe);
addEventListener('load',function(){setTimeout(probe,50)});
</script>
</body></html>
TPL

mkdir -p "$OUT"
: > "$TMP/index.txt"

for spec in "${FORMATS[@]}"; do
  key=${spec%%:*}; rest=${spec#*:}; net=${rest%%:*}; rest=${rest#*:}; w=${rest%%:*}
  rest=${rest#*:}; h=${rest%%:*}; s=${rest##*:}
  name="$net-${w}x${h}"
  page="$TMP/$key.html"
  sed -e "s|__FMT__|$key|g" -e "s|__W__|$w|g" -e "s|__H__|$h|g" -e "s|__REPO__|$REPO|g" "$TMP/ad.tpl" > "$page"
  rm -rf "$TMP/p-$key"
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
    --allow-file-access-from-files --user-data-dir="$TMP/p-$key" \
    --window-size=$w,$h --force-device-scale-factor=$s --virtual-time-budget=6000 \
    --screenshot="$TMP/$key.png" "file://$page" >/dev/null 2>&1 &
  pid=$!
  n=0
  while [ ! -s "$TMP/$key.png" ] && [ $n -lt 40 ]; do sleep 0.5; n=$((n+1)); done
  kill -9 $pid 2>/dev/null; pkill -9 -f "p-$key" 2>/dev/null
  [ -s "$TMP/$key.png" ] || { echo "FAIL $key: chrome produced nothing"; exit 1; }
  if [ "$s" != "1" ]; then
    sips -z $h $w "$TMP/$key.png" --out "$OUT/$name.png" >/dev/null
  else
    cp "$TMP/$key.png" "$OUT/$name.png"
  fi
  bytes=$(stat -f%z "$OUT/$name.png")
  dims=$(sips -g pixelWidth -g pixelHeight "$OUT/$name.png" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{printf "%dx%d", w, h}')
  # Second pass over the same page: read back what the in-page probe found. Chrome
  # is asked politely to leave once the dump has landed, because it does not always
  # exit by itself and a hung reader would stall the whole kit.
  rm -rf "$TMP/c-$key"
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars \
    --allow-file-access-from-files --user-data-dir="$TMP/c-$key" \
    --window-size=$w,$h --force-device-scale-factor=$s --virtual-time-budget=5000 \
    --dump-dom "file://$page" > "$TMP/$key.dom" 2>/dev/null &
  cpid=$!
  n=0
  while [ $n -lt 16 ] && ! grep -q 'data-clip=' "$TMP/$key.dom" 2>/dev/null; do sleep 0.5; n=$((n+1)); done
  kill -9 $cpid 2>/dev/null; pkill -9 -f "c-$key" 2>/dev/null
  clip=$(grep -o 'data-clip="[^"]*"' "$TMP/$key.dom" 2>/dev/null | tail -1 | sed 's/data-clip="//;s/"$//')
  rm -f "$TMP/$key.dom"; rm -rf "$TMP/c-$key"
  [ -n "$clip" ] || clip="unreadable"
  flag=""
  [ "$dims" != "${w}x${h}" ] && flag="  <-- not the exact pixel size the network asked for"
  [ "$net" = "google" ] && [ "$bytes" -gt 153600 ] && flag="$flag  <-- over Google's 150 KB image cap"
  [ "$clip" != "none" ] && flag="$flag  <-- CLIPPED"
  printf '%s  %-22s %8s bytes  clip=%s%s\n' "$net" "$name.png" "$bytes" "$clip" "$flag" >> "$TMP/index.txt"
done

cat "$TMP/index.txt"
echo "-> $OUT"
n_bad=$(grep -vc "clip=none" "$TMP/index.txt")
[ "$n_bad" -eq 0 ] || { echo "! $n_bad frame(s) need a layout fix"; exit 1; }
grep -q "  <--" "$TMP/index.txt" && { echo "! the kit is not upload-ready"; exit 1; }
exit 0
