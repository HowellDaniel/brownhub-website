#!/usr/bin/env python3
"""Advertise the native tier inside each card frame's own srcset.

stageSrc() in js/catalog.js already swaps the modal stage onto images/catalog/hi/,
but a card's cover and the pinned shelf read the HTML srcset, so a picture that now
owns a 1600-pixel copy still asks for the 760 one. Only a frame whose hi copy is
genuinely wider gets the candidate added, and the descriptor is the file's real
pixel width — the browser then picks it when the desk branch's demand (sizes at
dpr2) exceeds the base, and a phone naming 190px keeps the light file.

Run tools/markart.py afterwards: --art-max-w/--art-max-h is read off this srcset.

A frame parked by js/flow.js holds its address in `data-src`, so its choices have to travel in
`data-srcset` — an `<img>` with a srcset and no src is still a source, and the whole rail would
download at parse. `fill()` hands the list over with the address, and `sizes` is inert on a parked
frame, so tools/sizetier.py can write the clause while the frame waits.
"""
import os, re, subprocess, sys

ROOT = "/Users/brownhub/Documents/Qoder/2026-09-16/5bb3bd1c"
PAGES = ("index.html", "catalog.html")
FRAME = re.compile(r'(<div class="media"[^>]*>\s*<img (?:data-)?src="images/catalog/([^"]+\.jpg)"[^>]*?)>')


def width(path):
    o = subprocess.run(["sips", "-g", "pixelWidth", path], capture_output=True, text=True).stdout
    for line in o.strip().split("\n")[1:]:
        return int(line.split(": ")[1])
    return 0


def main():
    dry = "--write" not in sys.argv
    total = 0
    for page in PAGES:
        src = open(os.path.join(ROOT, page)).read()
        added = []

        def sub(m):
            whole, base = m.group(1), m.group(2)
            hi_rel = "images/catalog/hi/" + base
            hi_abs = os.path.join(ROOT, hi_rel)
            if not os.path.exists(hi_abs):
                return m.group(0)
            bw = width(os.path.join(ROOT, "images/catalog", base))
            hw = width(hi_abs)
            if hw <= bw:
                return m.group(0)
            if "catalog/hi/" + base in whole:
                return m.group(0)
            entry = "images/catalog/hi/%s %dw" % (base, hw)
            parked = "data-src=" in whole
            setname = "data-srcset" if parked else "srcset"
            if "srcset=" in whole:
                new = re.sub(r'(?:data-)?srcset="([^"]*)"',
                             lambda s: '%s="%s, %s"' % (setname, s.group(1), entry), whole, count=1)
            else:
                new = whole + ' %s="images/catalog/%s %dw, %s"' % (setname, base, bw, entry)
            added.append(base)
            return new + ">"

        out = FRAME.sub(sub, src)
        for b in added:
            print("  %s: %s" % (page, b))
        if out != src and not dry:
            open(os.path.join(ROOT, page), "w").write(out)
        total += len(added)
        print(page, "srcset entries", "to add" if dry else "added", ":", len(added))
    print("total:", total)


if __name__ == "__main__":
    main()
