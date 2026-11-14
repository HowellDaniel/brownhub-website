#!/usr/bin/env python3
"""Encode an AVIF copy beside every picture the gallery wall shows.

Why: a phone on a throttled 4G link spends its whole visit waiting for the gallery's
JPEGs. The 30 collection pages carry 1277 KB of tile bytes per page and the pipe carries
about 180 KB/s, so the first picture below the fold lands after 7-8 s. Re-encoding the
same JPEGs at quality 62 buys back under 4% — the shipped files already sit at the JPEG
floor — so the only lever with a real number left is the codec. At quality 58 AVIF
delivers 45% of the bytes at the same pixel dimensions, and the two encodes are a wash
in the eye: mean per-channel error 2.0-2.9 of 255 and mean chroma (max-min RGB)
unchanged to within 0.2, so nothing drifts grey.

The JPEG stays the fallback and the sitemap entry stays `.jpg`, so an engine without
AVIF and a crawler without JS both keep what they have today. Nothing is resized: the
wall keeps painting the same pixels, it just pays for them in a better codec.

Usage:
    python3 tools/avifrail.py             encode what is missing, then wrap the donor
    python3 tools/avifrail.py --force     re-encode every tile
    python3 tools/avifrail.py --dry-run   report, write nothing
Then, to publish the markup into the collection pages:  python3 tools/galcollections.py

The second half is the tiered rail, and it is the bigger number: a card or a band plate
offers a phone two resolutions, and the honest `sizes` clause makes a dpr-3 pocket demand
more pixels than the base copy carries, so it buys the `hi/` JPEG. catalog.html paid 205 KB
for `hi/pull-up-design-2.jpg` to paint a box 182 CSS px wide. Re-encoding that copy buys
the same pixels for 44% of the bytes, and the `hi/` tier stays in the srcset — the AVIF is
the same candidates at the same widths, never a fourth resolution. A `<video poster>` stays
outside the markup walk — a bare URL cannot carry a `<picture>` — but the home hero's poster
IS railed by hand, because it was the last picture on the page still paying JPEG rates:
    sips -s format avif -s formatOptions 58 images/web/reel-poster.jpg --out images/web/reel-poster.avif
What is cut by hand goes stale in silence, so tests/hero-poster-codec.test.mjs refuses a twin
younger than its AVIF; re-run the command above whenever the JPEG changes.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "images" / "catalog"
QUALITY = "58"

TILE_SRC = re.compile(r'<img src="(?:\.\./)?images/catalog/([\w.-]+)\.jpg"[^>]*>')
CELL = re.compile(r'<li class="gal-cell">.*?</li>', re.S)

# The same picture at two resolutions, in a directory the rail encodes.
TIER_IMG = re.compile(
    r'<img\b[^>]*\bsrc="(images/(?:catalog|home|brand)/[^"]+\.jpg)"'
    r'[^>]*\bsrcset="([^"]*/hi/[^"]+)"[^>]*>'
)
TIER_SIZES = re.compile(r'\ssizes="([^"]*)"')
ALREADY = re.compile(r'<source type="image/avif"[^>]*>\s*$')

# A still with one copy: the same file a tiered card on the same page already asks for.
SINGLE_IMG = re.compile(
    r'<img\b(?![^>]*\bsrcset=)[^>]*\bsrc="(images/(?:catalog|home|brand)/[^"]+\.jpg)"[^>]*>'
)
# js/catalog.js rotates a product's photos by writing `img.src` at runtime. A pinned
# <source> would win over that write and keep showing the first picture, so a markup
# attribute the script owns stays out of the rail.
JS_OWNED = re.compile(r'\bdata-src=')


def html_pages():
    for base in (ROOT, ROOT / "gallery", ROOT / "blog"):
        if base.is_dir():
            for page in sorted(base.glob("*.html")):
                yield page


def tiered_jpegs():
    """Every JPEG path a tiered srcset offers, base copy and hi copy alike."""
    out = set()
    for page in html_pages():
        for m in TIER_IMG.finditer(page.read_text(errors="replace")):
            for cand in m.group(2).split(","):
                url = cand.strip().split()[0]
                if url.endswith(".jpg"):
                    out.add(url)
    return sorted(out)

def tiles():
    """Every base JPEG the gallery wall references, from the donor and the pages."""
    found = set()
    for page in [ROOT / "gallery.html", *sorted((ROOT / "gallery").glob("*.html"))]:
        if not page.is_file():
            continue
        text = page.read_text()
        for m in TILE_SRC.finditer(text):
            found.add(m.group(1))
    return sorted(found)

def kb(path):
    return path.stat().st_size // 1024

def encode(args):
    made = skipped = 0
    before = after = 0
    for stem in tiles():
        jpg = ROOT / "images" / "catalog" / f"{stem}.jpg"
        avif = ROOT / "images" / "catalog" / f"{stem}.avif"
        if not jpg.is_file():
            print(f"  no source for {stem}")
            continue
        if avif.is_file() and "--force" not in args:
            skipped += 1
            before += kb(jpg)
            after += kb(avif)
            continue
        if "--dry-run" in args:
            made += 1
            continue
        subprocess.run(
            ["sips", "-s", "format", "avif", "-s", "formatOptions", QUALITY,
             str(jpg), "--out", str(avif)],
            capture_output=True, text=True, check=True,
        )
        made += 1
        before += kb(jpg)
        after += kb(avif)
    verb = "would encode" if "--dry-run" in args else "encoded"
    print(f"{verb} {made}, already present {skipped}")
    if before:
        print(f"{before} KB of JPEG now carries {after} KB of AVIF "
              f"({100 * after / before:.0f}% of the bytes)")

def wrap(dry):
    """Give every donor gallery cell a <picture> that prefers its AVIF copy.

    Only the donor is written; the 30 collection pages get the same markup from
    tools/galcollections.py, which lifts `srcset` the way it lifts `src`.
    """
    page = ROOT / "gallery.html"
    text = page.read_text()
    stats = {"wrapped": 0, "already": 0, "no avif": 0, "no tile": 0}

    def cell(match):
        block = match.group(0)
        m = TILE_SRC.search(block)
        if not m:
            stats["no tile"] += 1
            return block
        img, stem = m.group(0), m.group(1)
        source = f'<source type="image/avif" srcset="images/catalog/{stem}.avif">'
        if source in block:
            stats["already"] += 1
        elif not (CATALOG / f"{stem}.avif").is_file():
            stats["no avif"] += 1
        else:
            stats["wrapped"] += 1
            return block.replace(img, f"<picture>{source}{img}</picture>", 1)
        return block

    out = CELL.sub(cell, text)
    if not dry and out != text:
        page.write_text(out)
    print(f"gallery.html: {stats['wrapped']} cells "
          f"{'would wrap,' if dry or out == text else 'wrapped,'} "
          f"{stats['already']} already wrapped, "
          f"{stats['no avif']} without an AVIF, {stats['no tile']} with no tile")


def encode_tiers(args):
    """Give every JPEG a tiered srcset names its own AVIF copy, hi included."""
    made = have = 0
    before = after = 0
    for rel in tiered_jpegs():
        jpg = ROOT / rel
        avif = jpg.with_suffix(".avif")
        if not jpg.is_file():
            print(f"  no source for {rel}")
            continue
        before += kb(jpg)
        if avif.is_file():
            have += 1
            after += kb(avif)
            continue
        made += 1
        if "--dry-run" not in args:
            subprocess.run(
                ["sips", "-s", "format", "avif", "-s", "formatOptions", QUALITY,
                 str(jpg), "--out", str(avif)],
                capture_output=True, text=True, check=True,
            )
            after += kb(avif)
    verb = "would encode" if "--dry-run" in args else "encoded"
    print(f"tiers: {verb} {made}, already present {have}")
    if before and after:
        print(f"tiers: {before} KB of JPEG now carries {after} KB of AVIF "
              f"({100 * after / before:.0f}% of the bytes)")


def avif_set(cands):
    """The same candidates, same width descriptors, only the container changed."""
    out = []
    for cand in (c.strip() for c in cands.split(",") if c.strip()):
        bits = cand.split()
        out.append(" ".join([bits[0][:-4] + ".avif"] + bits[1:]))
    return ", ".join(out)


def wrap_tiers(dry):
    """Put each tiered <img> inside a <picture> that prefers its AVIF copies."""
    wrapped = skipped = missing = 0
    for page in html_pages():
        text = page.read_text()
        out, last, changed = [], 0, False
        for m in TIER_IMG.finditer(text):
            tag = m.group(0)
            head = text[max(0, m.start() - 300):m.start()]
            if ALREADY.search(head):
                skipped += 1
                continue
            need = [c.strip().split()[0][:-4] + ".avif" for c in m.group(2).split(",") if c.strip()]
            if not all((ROOT / u).is_file() for u in need):
                missing += 1
                continue
            sizes = TIER_SIZES.search(tag)
            sattr = f' sizes="{sizes.group(1)}"' if sizes else ""
            source = f'<source type="image/avif" srcset="{avif_set(m.group(2))}"{sattr}>'
            out.extend([text[last:m.start()], "<picture>", source, tag, "</picture>"])
            last = m.end()
            changed = True
            wrapped += 1
        if changed and not dry:
            page.write_text("".join(out) + text[last:])
        elif changed:
            print(f"  would wrap {page.relative_to(ROOT)}")
    print(f"tiers: {wrapped} pictures {'would wrap' if dry else 'wrapped'}, "
          f"{skipped} already wrapped, {missing} without a full AVIF set")


def encode_singles(args):
    """Give every single-copy still an AVIF, the same way the wall's tiles have one."""
    made = have = 0
    before = after = 0
    for rel in singles():
        jpg = ROOT / rel
        avif = jpg.with_suffix(".avif")
        if not jpg.is_file():
            print(f"  no source for {rel}")
            continue
        before += kb(jpg)
        if avif.is_file():
            have += 1
            after += kb(avif)
            continue
        made += 1
        if "--dry-run" not in args:
            subprocess.run(
                ["sips", "-s", "format", "avif", "-s", "formatOptions", QUALITY,
                 str(jpg), "--out", str(avif)],
                capture_output=True, text=True, check=True,
            )
            after += kb(avif)
    verb = "would encode" if "--dry-run" in args else "encoded"
    print(f"singles: {verb} {made}, already present {have}")
    if before and after:
        print(f"singles: {before} KB of JPEG now carries {after} KB of AVIF "
              f"({100 * after / before:.0f}% of the bytes)")


def singles():
    """Every single-copy JPEG the pages paint, in a directory the rail encodes."""
    out = set()
    for page in html_pages():
        text = page.read_text(errors="replace")
        for m in SINGLE_IMG.finditer(text):
            if JS_OWNED.search(m.group(0)):
                continue
            out.add(m.group(1))
    return sorted(out)


def wrap_singles(dry):
    """Wrap a single-copy still so the page stops paying for a JPEG its neighbour skips.

    Home's pinned story painted `images/catalog/flyer.jpg` while a card on the same page
    painted `hi/flyer.avif`: two requests for one scene where the site used to share one
    cached file. `sizes` is deliberately absent — with one candidate there is nothing to
    choose between, and a missing clause cannot over-ask.
    """
    wrapped = skipped = missing = 0
    for page in html_pages():
        text = page.read_text()
        out, last, changed = [], 0, False
        for m in SINGLE_IMG.finditer(text):
            tag = m.group(0)
            head = text[max(0, m.start() - 300):m.start()]
            if ALREADY.search(head) or JS_OWNED.search(tag):
                skipped += 1
                continue
            avif = m.group(1)[:-4] + ".avif"
            if not (ROOT / avif).is_file():
                missing += 1
                continue
            out.extend([text[last:m.start()], "<picture>",
                        f'<source type="image/avif" srcset="{avif}">', tag, "</picture>"])
            last = m.end()
            changed = True
            wrapped += 1
        if changed and not dry:
            page.write_text("".join(out) + text[last:])
        elif changed:
            print(f"  would wrap {page.relative_to(ROOT)}")
    print(f"singles: {wrapped} pictures {'would wrap' if dry else 'wrapped'}, "
          f"{skipped} already wrapped or JS-owned, {missing} without an AVIF")


# A preload is the one place a wrong codec is invisible: the browser fetches what the link
# names, whatever the picture decides to paint. Once a plate prefers its AVIF, a preload of
# the JPEG copy asks for the bytes twice — the dead-bytes defect the wall lost.
PRELOAD = re.compile(r'<link\b[^>]*\brel="preload"[^>]*\bas="image"[^>]*>')
WRAP_PAIR = re.compile(
    r'<source type="image/avif" srcset="([^"]*)"(?: sizes="([^"]*)")?>\s*<img\b[^>]*\bsrc="([^"]+\.jpg)"'
)


def sync_preloads(dry):
    """Point each picture preload at the copy its own <picture> will paint."""
    retargeted = 0
    for page in html_pages():
        text = page.read_text()
        painted = {jpeg: (srcset, sizes or "")
                   for srcset, sizes, jpeg in WRAP_PAIR.findall(text)}
        if not painted:
            continue

        def retag(match):
            nonlocal retargeted
            tag = match.group(0)
            href = re.search(r'\bhref="([^"]*)"', tag)
            target = (href.group(1) if href else "").split("?")[0].split("#")[0]
            entry = painted.get(target)
            if not entry:
                return tag
            srcset, sizes = entry
            if re.search(r'\bimagesrcset="([^"]*)"', tag):
                current = re.search(r'\bimagesrcset="([^"]*)"', tag).group(1)
                if current == srcset:
                    return tag
            rebuilt = re.sub(r'\s(href|imagesrcset|imagesizes)="[^"]*"', "", tag)
            attrs = f' imagesrcset="{srcset}"'
            if sizes:
                attrs += f' imagesizes="{sizes}"'
            retargeted += 1
            return rebuilt.replace("<link", f"<link{attrs}", 1)

        out = PRELOAD.sub(retag, text)
        if out != text:
            if not dry:
                page.write_text(out)
            else:
                print(f"  would retarget a preload in {page.relative_to(ROOT)}")
    verb = "would retarget" if dry else "retargeted"
    print(f"preloads: {verb} {retargeted} picture preload(s) to the AVIF their picture paints")


args = sys.argv[1:]
dry = "--dry-run" in args
encode(args)
wrap(dry)
encode_tiers(args)
wrap_tiers(dry)
encode_singles(args)
wrap_singles(dry)
sync_preloads(dry)
