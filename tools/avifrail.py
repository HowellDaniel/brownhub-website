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


args = sys.argv[1:]
encode(args)
wrap("--dry-run" in args)
