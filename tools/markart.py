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
"""
import re
import subprocess
import sys

PAGES = ["index.html", "catalog.html", "services.html", "engineering.html"]
CUTOFF = 0.95  # below this the piece is portrait, at or above it landscape

FRAME = re.compile(
    r'<div class="media"[^>]*><img (?P<pre>[^>]*?)(?P<lazy>data-)?src="(?P<path>[^"]+)"')

_cache = {}


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
            return ('<div class="media" data-art="%s" style="--art-w:%d;--art-h:%d"><img %s'
                    % (kind, w, h, m.group(0)[m.start("pre") - m.start():]))

        out = FRAME.sub(sub, src)
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
