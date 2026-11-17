#!/usr/bin/env python3
"""Put the thirty-five print clips where a crawler that runs no script can learn they exist.

Why this exists: the clips are real work — the studio's own output coming off the press — and
until now the only place their addresses were written down was a `data-imgs` attribute that
js/catalog.js turns into a viewer after the page has run. Google does not run scripts. It saw
four cards holding a still each, and no video at all, so there was nothing to offer in Google
Video, no clip to play when someone searches the studio's name, and no way for a visitor to
find the print work except by clicking through the catalog.

This file writes the three rails that fix that, and writes them from what the page already
says rather than from anything invented here:

  * `sitemap-video.xml` — one <url> for catalog.html holding thirty-five <video:video>
    entries, which is how Google's own example of a page carrying several videos is shaped.
    The videos share a page, so they share its loc; a separate loc per clip would only be
    thirty-five near-identical URLs asking to be read as duplicates.
  * a `VideoObject` node per clip inside JSON-LD on catalog.html, which is what Google reads
    on the page itself, beside the sitemap it reaches from robots.txt.
  * the `Sitemap:` line in robots.txt that hands the file over, without waiting to be found.

Nothing is described that the site does not already claim. The four cards share one
description, so the site offers no per-clip subject line, and none is made up: each clip is
named by the card it belongs to and its place in that group. The length comes from
tools/clip-crops.json, which was read back out of the shipped files; the poster is the hi-tier
copy of the still the card already paints; the date comes from the commit that first put the
file in the repository.

Re-running replaces what this file wrote last time — the block on catalog.html sits between
sentinel comments so nothing of the page's own markup is touched.

Usage:  python3 tools/videoseo.py [--dry-run]
"""
import datetime as dt
import html
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.brownhub283.com"
PAGE = "catalog.html"
PAGE_URL = SITE + "/" + PAGE
VIDEO_SITEMAP = ROOT / "sitemap-video.xml"
ROBOTS = ROOT / "robots.txt"
PUBLISHER_ID = SITE + "/#publisher"

BEGIN = "<!-- BEGIN tools/videoseo.py: the print clips, written for a crawler -->"
END = "<!-- END tools/videoseo.py -->"

CARD_RE = re.compile(r'<article class="product-card"[^>]*>')
MP4_RE = re.compile(r"\S+\.mp4")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")

# Google reads these as a hint and ignores them when they disagree with the page, so they are
# only ever set from something the page already says.
MAX_TITLE = 100


def attr(tag, key):
    m = re.search(key + r'="([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else ""


def cards():
    """Each print-sample card, in the order the page shows it, with the clips it offers."""
    text = (ROOT / PAGE).read_text(encoding="utf-8")
    out = []
    for m in CARD_RE.finditer(text):
        tag = m.group(0)
        listed = re.search(r'data-imgs="([^"]*)"', tag)
        if not listed or ".mp4" not in listed.group(1):
            continue
        clips = MP4_RE.findall(listed.group(1))
        out.append({
            "name": attr(tag, "data-name"),
            "desc": attr(tag, "data-desc"),
            "cat": attr(tag, "data-catlabel"),
            "clips": clips,
        })
    if not out:
        sys.exit("%s offers no clips — the cards this generator reads have changed shape" % PAGE)
    return out


def crop_table():
    rows = json.loads((ROOT / "tools" / "clip-crops.json").read_text(encoding="utf-8"))["clips"]
    return {r["clip"]: r for r in rows}


def first_added(paths):
    """The author date of the commit that put each file in the repository.

    One git call for all of them: this is history, not a per-file question, and walking the
    log once keeps the earliest mention of each path.
    """
    found = {}
    res = subprocess.run(["git", "log", "--diff-filter=A", "--name-only", "--format=%aI",
                          "--", *paths], cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write("  ~ git said: %s — falling back to the files' own dates\n" % res.stderr.strip())
        return found
    stamp = None
    for line in res.stdout.splitlines():
        line = line.strip()
        if DATE_RE.match(line):
            stamp = line
        elif line and stamp and line not in found:
            found[line] = stamp
    return found


def published(path, added):
    """A W3C datetime with an offset, which is the only shape Google accepts here."""
    raw = added.get(path)
    if not raw:
        # Untracked (a clip resampled on this machine and not yet committed). Its own mtime is
        # the only honest date, so say so on stderr rather than quietly inventing one.
        mtime = (ROOT / path).stat().st_mtime
        sys.stderr.write("  ~ %s is not in git history — using its file date\n" % path)
        raw = dt.datetime.fromtimestamp(mtime, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    return raw[:-1] + "+00:00" if raw.endswith("Z") else raw


def poster(clip):
    """The still the card paints, at the biggest copy that is really on disk."""
    stem = "images/catalog/hi/" + clip[len("video/"):-len(".mp4")] + ".jpg"
    if (ROOT / stem).is_file():
        return stem
    flat = "images/catalog/" + clip[len("video/"):-len(".mp4")] + ".jpg"
    if (ROOT / flat).is_file():
        return flat
    sys.exit("%s has no poster under images/catalog/ — refusing to declare a video with no picture"
             % clip)


def iso_duration(seconds):
    """ISO 8601 seconds, the form schema.org wants: PT26.1S, PT6S."""
    return "PT%sS" % ("%g" % round(float(seconds), 2))


def mp4_dims(path):
    """The frame size the shipped file actually declares, read out of its video track's tkhd.

    clip-crops.json holds the crop rectangle chosen from the source, not a promise about the
    encoded stream — clipfit may have rounded it to satisfy the codec. Google asks for the
    video's real pixel size, so the file itself answers.
    """
    data = path.read_bytes()

    def boxes(lo, hi):
        out, i = [], lo
        while i + 8 <= hi:
            size = int.from_bytes(data[i:i + 4], "big")
            kind = data[i + 4:i + 8].decode("latin-1")
            body, after = i + 8, i + size
            if size == 1:
                body, after = i + 16, i + int.from_bytes(data[i + 8:i + 16], "big")
            if size < 8 or after > hi:
                break
            out.append((kind, body, after))
            i = after
        return out

    def find(container, name):
        for kind, body, after in boxes(*container):
            if kind == name:
                return (body, after)
            deep = find((body, after), name)
            if deep:
                return deep
        return None

    moov = next(((b, a) for k, b, a in boxes(0, len(data)) if k == "moov"), None)
    if not moov:
        sys.exit("%s has no moov box — its size cannot be declared" % path)
    # A clip carries its sound as its own track, and only the picture track declares a frame
    # size; the audio tkhd is there too and says 0x0. Ask the one whose handler is "vide".
    video = None
    for kind, body, after in boxes(*moov):
        if kind != "trak":
            continue
        hdlr = find((body, after), "hdlr")
        if hdlr and data[hdlr[0] + 8:hdlr[0] + 12] == b"vide":
            video = (body, after)
            break
    if not video:
        sys.exit("%s has no video track — its size cannot be declared" % path)
    tkhd = find(video, "tkhd")
    if not tkhd:
        sys.exit("%s has no tkhd box — its size cannot be declared" % path)
    body = data[tkhd[0]:tkhd[1]]
    version = body[0]
    # Width and height are the box's last two fields, 16.16 fixed. Everything before them is
    # 12 bytes longer when version 1 spreads the three timestamps to 64 bits.
    off = 76 if version == 0 else 88
    if len(body) < off + 8:
        sys.exit("%s has a truncated tkhd" % path)
    w = int.from_bytes(body[off:off + 4], "big") / 65536
    h = int.from_bytes(body[off + 4:off + 8], "big") / 65536
    if not (w and h):
        sys.exit("%s declares a zero frame size" % path)
    return int(w), int(h)


def mp4_seconds(path):
    """The length the shipped file declares, from mvhd — an independent read of what
    clip-crops.json says it cut, so a plan that drifted from the media cannot be published."""
    data = path.read_bytes()
    i = data.find(b"mvhd")
    if i < 0:
        sys.exit("%s has no mvhd box — its length cannot be checked" % path)
    body = data[i + 4:]
    version = body[0]
    if version == 0:
        timescale = int.from_bytes(body[12:16], "big")
        seconds = int.from_bytes(body[16:20], "big") / timescale
    else:
        timescale = int.from_bytes(body[20:24], "big")
        seconds = int.from_bytes(body[24:32], "big") / timescale
    return round(seconds, 2)


def build():
    crops = crop_table()
    page = cards()
    added = first_added(["video", "images/catalog"])
    entries, missing = [], []
    for card in page:
        n = len(card["clips"])
        for i, clip in enumerate(card["clips"], 1):
            row = crops.get(clip)
            if not row:
                missing.append(clip)
                continue
            art = poster(clip)
            real = mp4_seconds(ROOT / clip)
            if abs(real - row["dur"]) > 1:
                sys.exit("%s runs %.2fs in the file but %.2fs in tools/clip-crops.json"
                         % (clip, real, row["dur"]))
            width, height = mp4_dims(ROOT / clip)
            title = "%s · clip %d of %d" % (card["name"], i, n)
            desc = ("%s This is clip %d of %d in that set, %s seconds of the studio's own "
                    "print work. It plays in the viewer that opens when a visitor taps the card."
                    % (card["desc"], i, n, ("%g" % round(row["dur"], 1))))
            entries.append({
                "clip": clip,
                "art": art,
                "cat": card["cat"],
                "dur": real,
                "w": width,
                "h": height,
                "date": published(clip, added),
                "art_date": published(art, added),
                "title": title[:MAX_TITLE],
                "desc": desc,
            })
    if missing:
        sys.exit("not in tools/clip-crops.json, so their real length is unknown: %s" % ", ".join(missing))
    absent = [e["clip"] for e in entries if not (ROOT / e["clip"]).is_file()]
    if absent:
        sys.exit("declared by the page but not on disk: %s" % ", ".join(absent))
    return entries


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


def sitemap(entries):
    head = """<?xml version="1.0" encoding="UTF-8"?>
<!-- The thirty-five print clips, declared for a crawler that never runs a script. Written by
     tools/videoseo.py from catalog.html and tools/clip-crops.json; do not hand-edit it,
     re-run the generator. No <lastmod> here on purpose: the date that belongs to a clip is
     publication_date, and the page's own lastmod already lives in sitemap.xml, where one
     number has to answer for it. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>%s</loc>
""" % PAGE_URL
    body = []
    for e in entries:
        body.append(
            "    <video:video>\n"
            "      <video:content_loc>" + esc(SITE + "/" + e["clip"]) + "</video:content_loc>\n"
            "      <video:thumbnail_loc>" + esc(SITE + "/" + e["art"]) + "</video:thumbnail_loc>\n"
            "      <video:title>" + esc(e["title"]) + "</video:title>\n"
            "      <video:description>" + esc(e["desc"]) + "</video:description>\n"
            "      <video:category>" + esc(e["cat"]) + "</video:category>\n"
            "      <video:family_friendly>yes</video:family_friendly>\n"
            "      <video:duration>" + str(int(round(e["dur"]))) + "</video:duration>\n"
            "      <video:publication_date>" + esc(e["date"]) + "</video:publication_date>\n"
            "      <video:uploader info=\"" + esc(SITE + "/about.html")
            + "\">BrownHub Studio</video:uploader>\n"
            "    </video:video>"
        )
    return head + "\n".join(body) + "\n  </url>\n</urlset>\n"


def jsonld(entries):
    graph = [{
        "@type": "Organization",
        "@id": PUBLISHER_ID,
        "name": "BrownHub Studio",
        "url": SITE + "/",
    }]
    for e in entries:
        graph.append({
            "@type": "VideoObject",
            "@id": SITE + "/" + e["clip"],
            "url": PAGE_URL,
            "name": e["title"],
            "description": e["desc"],
            "thumbnailUrl": SITE + "/" + e["art"],
            "uploadDate": e["date"],
            "duration": iso_duration(e["dur"]),
            "contentUrl": SITE + "/" + e["clip"],
            "width": e["w"],
            "height": e["h"],
            "publisher": {"@id": PUBLISHER_ID},
            "requiresSubscription": False,
        })
    doc = {"@context": "https://schema.org", "@graph": graph}
    return json.dumps(doc, ensure_ascii=False, indent=1)


def patch_page(entries, dry):
    text = (ROOT / PAGE).read_text(encoding="utf-8")
    block = (BEGIN + "\n  <script type=\"application/ld+json\">\n"
             + jsonld(entries) + "\n  </script>\n  " + END)
    if BEGIN in text and END in text:
        pre, rest = text.split(BEGIN, 1)
        _, post = rest.split(END, 1)
        new = pre + block + post
    else:
        i = text.rindex("</head>")
        pad = text[:i].rstrip("\n")
        new = pad + "\n  " + block + "\n" + text[i:]
    n = new.count('"@type": "VideoObject"')
    if n != len(entries):
        sys.exit("would put %d VideoObject nodes on the page, expected %d" % (n, len(entries)))
    if dry:
        sys.stdout.write("dry run: %s would carry %d VideoObject nodes (%d bytes of JSON-LD)\n"
                         % (PAGE, n, len(jsonld(entries))))
        return
    (ROOT / PAGE).write_text(new, encoding="utf-8")
    print("%s: %d VideoObject nodes" % (PAGE, n))


def patch_robots(dry):
    text = ROBOTS.read_text(encoding="utf-8")
    video = "Sitemap: %s/sitemap-video.xml" % SITE
    if video in text:
        print("robots.txt: already hands over the video sitemap")
        return
    anchor = "Sitemap: %s/sitemap.xml\n" % SITE
    if anchor not in text:
        sys.exit("robots.txt does not declare sitemap.xml, so there is nothing to write beside")
    new = text.replace(anchor, anchor + video + "\n", 1)
    if dry:
        sys.stdout.write("dry run: robots.txt would gain the sitemap-video.xml line\n")
        return
    ROBOTS.write_text(new, encoding="utf-8")
    print("robots.txt: the video sitemap is now declared beside the page sitemap")


def main():
    dry = "--dry-run" in sys.argv
    entries = build()
    xml = sitemap(entries)
    if not dry:
        VIDEO_SITEMAP.write_text(xml, encoding="utf-8")
    patch_page(entries, dry)
    patch_robots(dry)
    print("%s: %d clips, %d bytes%s" % ("sitemap-video.xml", len(entries), len(xml.encode()),
                                        " (dry run — not written)" if dry else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
