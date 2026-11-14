#!/usr/bin/env python3
"""Write fonts/coverage.json — what the shipped font subsets actually contain.

Why: css/style.css tells the browser which characters each subset is responsible for
with `unicode-range`, and the browser believes it. A range wider than the file's glyph
table costs the phone a download and then paints the glyph from the system face anyway,
which is how the site came to buy 19.4KB of latin-ext on every page that prints a price:
the range claims U+20AD-20C0, which contains the cedi sign, and neither Hanken Grotesk
nor its subset has a cedi glyph. tests/font-coverage.test.mjs checks that promise against
the reality this file records.

fontTools is not a dependency of the site and does not join the user's environment for
it. Use a throwaway venv:

    python3 -m venv /tmp/ftv && /tmp/ftv/bin/pip -q install fonttools brotli
    /tmp/ftv/bin/python3 tools/fontcoverage.py
"""
import json
import os
import sys

try:
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is missing — see this file's docstring for the throwaway venv")

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = {}

for name in sorted(f for f in os.listdir(os.path.join(root, "fonts")) if f.endswith(".woff2")):
    cmap = TTFont(os.path.join(root, "fonts", name)).getBestCmap()
    # Collapse the codepoint list into inclusive ranges so the manifest stays a few KB.
    ranges, start, prev = [], None, None
    for cp in sorted(cmap):
        if start is not None and cp == prev + 1:
            prev = cp
            continue
        if start is not None:
            ranges.append([f"U+{start:04X}", f"U+{prev:04X}"])
        start, prev = cp, cp
    if start is not None:
        ranges.append([f"U+{start:04X}", f"U+{prev:04X}"])
    out[name] = ranges

path = os.path.join(root, "fonts", "coverage.json")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

total = sum(len(r) for r in out.values())
print(f"fonts/coverage.json: {len(out)} faces, {total} ranges")
for name, ranges in out.items():
    print(f"  {name}: {len(ranges):3} ranges, {len(json.dumps(ranges))} bytes of manifest")
