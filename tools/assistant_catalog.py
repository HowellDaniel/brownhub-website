#!/usr/bin/env python3
"""Generate the server-owned assistant catalog from catalog.html."""
import html
import json
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "catalog.html"
OUT = ROOT / "data" / "assistant-catalog.json"
CARD = re.compile(r'<article class="product-card"[^>]*>')
ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def as_image(path):
    """Name the still cut from one of the studio's own clips.

    The assistant answers with pictures it can attach, and a .mp4 is not one. Every clip
    the catalog carries was cut together with a poster of the same slug, so a shot list
    reaches the assistant as the frames a visitor would have seen pressed play for.
    """
    if path.lower().endswith(".mp4"):
        return "images/catalog/%s.jpg" % path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return path


def items():
    source = SOURCE.read_text(encoding="utf-8")
    result = []
    seen = set()
    for number, match in enumerate(CARD.finditer(source), 1):
        attrs = {key: html.unescape(value) for key, value in ATTR.findall(match.group(0))}
        name = attrs.get("data-name", "").strip()
        description = attrs.get("data-desc", "").strip()
        raw_images = attrs.get("data-imgs", "").strip() or attrs.get("data-img", "")
        images = []
        for path in raw_images.split(","):
            shot = as_image(path.strip())
            if shot and shot not in images:
                images.append(shot)
        missing = [label for label, value in (("name", name),
                                              ("description", description),
                                              ("images", images)) if not value]
        if missing:
            raise SystemExit("catalog card %d is missing %s" % (number, ", ".join(missing)))
        item_id = slugify(name)
        if item_id in seen:
            raise SystemExit("duplicate assistant catalog id: %s" % item_id)
        seen.add(item_id)
        result.append({
            "id": item_id,
            "name": name,
            "category": attrs.get("data-cat", ""),
            "categoryLabel": attrs.get("data-catlabel", ""),
            "description": description,
            "images": images,
            "url": "catalog.html?q=" + urllib.parse.quote(name, safe="!'()*-._~"),
        })
    return result


def main():
    check = "--check" in sys.argv
    payload = json.dumps({"version": 1, "items": items()}, ensure_ascii=False, indent=2) + "\n"
    if check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != payload:
            raise SystemExit("assistant catalog is stale; run tools/assistant_catalog.py")
    else:
        OUT.write_text(payload, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
