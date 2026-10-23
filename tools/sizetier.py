#!/usr/bin/env python3
"""Write a measured `sizes` clause on every catalog frame that owns a srcset.

A srcset without `sizes` is read by the engine as `100vw`. On a 390x844 dpr3 phone
that is a demand for a 1170-pixel picture, so every card in a 182-pixel box walked
past its own base file and fetched the hi tier: a scroll of catalog.html cost 4.59 MB
instead of 1.99 MB, for pixels the phone's own glass cannot show. The desk pays for
sharpness; the phone should not pay for a whole-screen-wide image it never paints.

The widths come from the engines themselves — each frame's real painted box at
390x844 dpr3 and 1440x900 dpr2, measured through CDP and dumped to JSON. The phone
branch names that box, so the engine takes the base whenever the base covers
box x 3 and only reaches for the hi where the box genuinely needs it. The desk
branch names the file's own pixel width, which at dpr2 is a demand no base can
meet, so the desk keeps taking the hi tier it was given in the last pass.

Re-measured in both engines after --write: catalog.html on the phone drops from 12 hi
copies to 1 (2135 KB against 1992 all-base, +7%), the desk keeps 24 of 26 at fill 1.04
and above, and neither page overflows. index.html on the phone still reaches for six
hi copies across a full scroll because three bands paint the picture 341-396 CSS px
wide -- a demand of 1023-1188 device px that no base file of 430-608 can meet -- and
at rest, before any scroll, the phone asks for zero of them (three catalog frames,
all base, 243 KB). The rows that still read under 1.0 fill are the file ceiling, not a
selection miss: pull-up-design-2 has 724 pixels and flyer 864 in the widest copy the
harvest ever found.

  tools/sizetier.py [--write] [--meas DIR]   DIR holds box_{desk,phone}_{page}.json
"""
import json, math, os, re, subprocess, sys

ROOT = "/Users/brownhub/Documents/Qoder/2026-09-16/5bb3bd1c"
PAGES = ("catalog", "index")
PHONE_MAX = 719
# A parked frame carries its picture in data-src until js/flow.js hands it over; `sizes`
# is inert on its own, so it can be written while the frame is still parked.
IMG = re.compile(r'<img [^>]*?\b(?:data-)?src="images/catalog/([^"]+\.jpg)"[^>]*?>')
TAG = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>')
VOID = {"img", "br", "hr", "input", "meta", "link", "source", "use", "path", "circle", "rect", "area", "col", "embed", "track", "wbr"}


def width(path):
    o = subprocess.run(["sips", "-g", "pixelWidth", path], capture_output=True, text=True).stdout
    for line in o.strip().split("\n")[1:]:
        return int(line.split(": ")[1])
    return 0


def bands(html):
    """byte offset -> nearest enclosing element id, walked once over the source."""
    out, stack = {}, []
    for m in TAG.finditer(html):
        closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if closing:
            for i in range(len(stack) - 1, -1, -1):
                if stack[i][0] == name:
                    del stack[i]
                    break
        elif name not in VOID and not attrs.rstrip().endswith("/"):
            idm = re.search(r'\bid="([^"]+)"', attrs)
            stack.append((name, idm.group(1) if idm else None, m.start()))
        cur = next((b for (_, b, _) in reversed(stack) if b), "")
        out[m.start()] = cur
    return out


def band_at(pos, starts, lookup):
    lo, hi = 0, len(starts) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if starts[mid] <= pos:
            lo = mid
        else:
            hi = mid - 1
    return lookup[starts[lo]]


def bkey(band):
    # the engine probe records the nearest enclosing id clipped to 22 characters
    return band[:22]


def measured(meas, page):
    d = json.load(open(os.path.join(meas, "box_desk_%s.json" % page)))
    p = json.load(open(os.path.join(meas, "box_phone_%s.json" % page)))
    desk, phone = {}, {}
    for rows, into in ((d, desk), (p, phone)):
        for r in rows:
            k = (bkey(r["band"]), r["k"])
            into[k] = max(into.get(k, 0), r["w"])
    return desk, phone


def main():
    dry = "--write" not in sys.argv
    meas = "/tmp/hj"
    if "--meas" in sys.argv:
        meas = sys.argv[sys.argv.index("--meas") + 1]
    report = {"written": [], "unchanged": [], "unmeasured": []}
    for page in PAGES:
        path = os.path.join(ROOT, page + ".html")
        src = open(path).read()
        desk, phone = measured(meas, page)
        lookup = bands(src)
        starts = sorted(lookup)
        edits = []

        for m in IMG.finditer(src):
            base = m.group(1)
            tag = m.group(0)
            if "srcset=" not in tag:
                continue
            band = band_at(m.start(), starts, lookup)
            key = (bkey(band), base)
            pw, dw = phone.get(key, 0), desk.get(key, 0)
            if not pw or not dw:
                report["unmeasured"].append("%s: %s/%s" % (page, band or "-", base))
                continue
            bw = width(os.path.join(ROOT, "images/catalog", base))
            # The desk branch is a demand: naming the file's own width means the
            # engine can only satisfy it with the hi tier, at dpr2.
            desk_px = int(math.ceil(max(dw, bw)))
            want = 'sizes="(max-width:%dpx) %dpx, %dpx"' % (PHONE_MAX, int(math.ceil(pw)), desk_px)
            if re.search(r'\bsizes="[^"]*"', tag):
                new = re.sub(r'\bsizes="[^"]*"', want, tag, count=1)
            else:
                # keep srcset last-but-one so the attribute order stays readable
                new = tag.replace(">", " " + want + ">", 1)
            if new != tag:
                edits.append((m.start(), m.end(), new, base, band, want))

        for start, end, new, base, band, want in reversed(edits):
            src = src[:start] + new + src[end:]
        report["written"] += [(page, b, w) for _, _, _, b, _, w in edits]
        for k in desk:
            if not any(e[4] == k[0] and e[5] == k[1] for e in edits):
                pass
        if out_changed(src, path) and not dry:
            open(path, "w").write(src)
    print("\n".join("%-14s %-18s %s" % (p, (b or "-")[:18], w) for p, b, w in report["written"]))
    print("\nrewritten:", len(report["written"]))
    print("frames with a srcset the engines never painted:", len(report["unmeasured"]))
    for u in report["unmeasured"][:20]:
        print("  ", u)
    if dry:
        print("\ndry run: nothing written")


def out_changed(new, path):
    return open(path).read() != new


if __name__ == "__main__":
    main()
