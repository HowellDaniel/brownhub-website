#!/usr/bin/env python3
"""Stamp every media frame with the pixel size of the picture it holds.

Blink cannot ask an <img> what shape it is from CSS, and reading naturalWidth at
runtime is unreliable — for a srcset frame it reports the file divided by the
density that picked it, and for a lazy frame it reports a provisional number — so
the real size is stamped once from the file itself and the stylesheet does the rest.

Two numbers, not a ratio, because the stylesheet has to do two different sums with
them: `aspect-ratio: var(--art-w) / var(--art-h)` cuts a box to the picture's own
shape, and `calc(var(--art-w) * 1px / 3 + 20px)` caps that box at the width the
phone's own copy of the file fills at three device pixels per point. A ratio can be
multiplied but cannot be taken apart, and a bare number cannot be added to a length —
the number is multiplied by 1px first, or the whole declaration is discarded and the
box sizes itself to the picture again.

`data-art` says which way the piece leans: "tall" under 0.95, "wide" at or over it.
A tall piece in a wide box loses its headline, its dates and its call to action to
`object-fit:cover`; a wide piece in a wider-than-its-file box loses its edges and is
asked for pixels it does not have. Both get a mat cut to themselves in the
one-picture stage, and the mat is arithmetic off a number the pinned driver already
owns — never the img's own pixels, because the driver measures the row once, before a
lazy file arrives, and a mat that waits for the decode made the whole desktop story
cancel itself at random.

Idempotent: it matches frames it stamped before, in either spelling (`--art-r:W/H`
from the first pass, `--art-w/--art-h` from this one), and rewrites them.

`.pstory__visual` is stamped too. It is not a `.media` frame — the process story's
picture is a panel the stage stretches to fill its column — but it carries the same
liability: at 1440x900 on a two-pixel engine the panel is 741 CSS px wide and the
flyer inside it holds 608 pixels, so `cover` was asked to invent two thirds of what
it painted. Only the file's own width can answer that, so the panel's file gets
stamped like every other picture.

`--art-max-w/--art-max-h` is stamped only when the frame's own srcset offers a wider copy
than its `src`, and it is the number the desk shelf reads to decide how big its mat may
get. Omitted when the base tier is already the largest thing on disk. They are named under
the `--art-` prefix on purpose: `--max-w` is already the site's container token
(`:root{--max-w:1140px}`), and a frame that inherits it while the CSS expects a bare
number makes every `calc()` that reads it invalid — which drops the whole mat width and
leaves a picture sizing itself to its file's intrinsic pixels.

FRAME matches both the plain and the already-stamped spelling and rebuilds only the
opening tag, so a frame's other attributes survive a second pass.
"""
import re
import subprocess
import sys

PAGES = ["index.html", "catalog.html", "services.html", "engineering.html"]
CUTOFF = 0.95  # below this the piece is portrait, at or above it landscape

FRAME = re.compile(
    r'(?P<open><(?P<tag>div|span) class="(?P<cls>media|pstory__visual)"(?P<attrs>[^>]*)>)'
    r'<img (?P<pre>[^>]*?)(?P<lazy>data-)?src="(?P<path>[^"]+)"')
STAMPED = re.compile(r'\s*(?:data-art|style)="[^"]*"')
SRCSET = re.compile(r'(?:data-)?srcset="(?P<set>[^"]+)"')
DESK = re.compile(r'(?P<open>class="(?:media|pstory__visual)"[^>]*--art-w:(?P<w>\d+)[^>]*--art-max-w:(?P<maxw>\d+)[^>]*>)'
                  r'<img (?P<img>[^>]*?)sizes="(?P<sz>[^"]*)"')

_cache = {}


def largest(path, tail):
    """The widest copy this frame can actually be served, read off its own srcset.

    The base tier is what a phone asks for; the shelf's desk view caps its mat by the
    largest candidate instead, because a 430-pixel flyer painted 283 CSS px wide on a
    two-pixel engine is only honest when a 724-pixel copy of the same artwork exists —
    and it does, for most of the set, sitting unused by the desktop since the phone pass
    decided not to pay for it there. Returns the base size when no candidate is wider.
    """
    best = dims(path)
    m = SRCSET.search(tail or "")
    if not m:
        return best
    for part in m.group("set").split(","):
        f = part.strip().split()
        if len(f) != 2 or not f[1].endswith("w"):
            continue
        cand = f[0].lstrip("./")
        d = dims(cand)
        if d and best and (d[0] > best[0]):
            best = d
    return best


def dims(rel):
    """The file's own pixel size. Read with the macOS image tool: no PIL here."""
    if rel not in _cache:
        out = None
        try:
            txt = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", rel],
                                 capture_output=True, text=True, timeout=20).stdout
            px = [int(l.split()[-1]) for l in txt.splitlines()
                  if l.strip().startswith(("pixelWidth", "pixelHeight"))]
            if len(px) == 2:
                out = (px[0], px[1])
        except Exception:
            out = None
        _cache[rel] = out
    return _cache[rel]


def widen_desk(text):
    """Move each two-tier frame's desk `sizes` branch onto the copy the shelf now paints.

    Every branch of a `sizes` clause names a box, and Blink multiplies it by the engine's
    own density before it picks the smallest candidate at least that wide — falling back to
    the largest one it has when nothing reaches. The desk branch these frames shipped with
    was the base tier's own width divided by two (215 for the 430-pixel flyer), so a
    two-pixel Mac asked for 430 device pixels, got 430, and the 724-pixel copy of the same
    artwork stayed on disk while the stylesheet grew the mat to reach it.

    The base tier's full width is the number that answers both densities at once, and it is
    the largest one that still does: any branch at or under it lands a one-pixel engine on
    the small copy, which is what that engine can actually paint, and any branch above half
    of the wide copy drags the two-pixel engine onto the big one. Naming the widest copy
    divided by two sits inside that window for most of the set and steps out of it for the
    frames whose two tiers are more than a factor of two apart — a 570-pixel file with a
    1200-pixel copy puts the branch at 600, over its own base tier, and a one-pixel desk
    then downloads 1200 pixels for a mat 368 CSS px wide. The pocket branch is the phone's
    own mat and never moves: the phone was deliberately handed back the small copy.
    """
    def sub(m):
        parts = m.group("sz").split(",")
        if len(parts) < 2 or not re.match(r"^\d+px$", parts[-1].strip()):
            return m.group(0)
        parts[-1] = " %spx" % m.group("w")
        return (m.group("open") + "<img " + m.group("img")
                + 'sizes="' + ",".join(parts) + '"')

    return DESK.sub(sub, text)


def main():
    total = {"tall": 0, "wide": 0, "unknown": 0}
    for page in PAGES:
        try:
            src = open(page).read()
        except OSError:
            continue
        counts = {"tall": 0, "wide": 0, "unknown": 0}

        def sub(m):
            path = m.group("path")
            if path.startswith(("http", "data:", "//")):
                return m.group(0)
            d = dims(path)
            if d is None:
                counts["unknown"] += 1
                return m.group(0)
            w, h = d
            kind = "tall" if (w / h) < CUTOFF else "wide"
            counts[kind] += 1
            keep = STAMPED.sub("", m.group("attrs"))
            tail = m.string[m.end():m.string.find(">", m.end())]
            big = largest(path, tail)
            extra = ""
            if big and (big[0] > w):
                extra = ";--art-max-w:%d;--art-max-h:%d" % (big[0], big[1])
            open_ = ('<%s class="%s"%s data-art="%s" style="--art-w:%d;--art-h:%d%s">'
                     % (m.group("tag"), m.group("cls"), keep, kind, w, h, extra))
            return open_ + m.group(0)[m.end("open") - m.start():]

        out = widen_desk(FRAME.sub(sub, src))
        if out != src:
            open(page, "w").write(out)
        print("%s: %d tall, %d wide, %d whose file could not be read"
              % (page, counts["tall"], counts["wide"], counts["unknown"]))
        for k in total:
            total[k] += counts[k]
    print("total: %d tall, %d wide | unstamped because unreadable %d"
          % (total["tall"], total["wide"], total["unknown"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
