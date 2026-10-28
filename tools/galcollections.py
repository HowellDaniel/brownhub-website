#!/usr/bin/env python3
"""Write one crawlable page per catalog collection, out of the gallery.

Why this exists: all 171 catalog pictures sit on one document, under one heading
that says "Every picture in the BrownHub catalog". Google Images weighs a picture
against the page that carries it, so 171 different jobs each answered under the
same weak subject. The catalog's own descriptions — the sentence already printed
on each product card — never appeared beside the pictures at all.

This tool splits that one page into twenty-six, one per collection, each carrying
the collection's own name in its title, its own shipped description in its hero,
and only its own pictures. Nothing new is claimed: the heading copy, the catalog
description and the closing band are words the site already publishes on
catalog.html and in the journal. The picture cells are copied character for
character from gallery.html, so a collection page shows exactly what the gallery
shows, at the same sizes.

Rules the generator holds to:

  * The gallery is both the source of the pictures and the shell donor, so every
    page ships today's CSP, nav and footer instead of a hand-written copy.
  * A path is lifted one directory (`images/...` to `../images/...`) in src,
    srcset and href. `sizes` carries no path and is left alone.
  * The address is `/gallery/<slug>.html`; the slug is already fixed in
    gallery.html as each collection's `id="item-<slug>"`.
  * The sitemap entries are rewritten whole each run, so a collection that later
    gains a picture only needs this tool and then tools/imagesitemap.py.
  * A collection with no shipped description stops the run rather than being
    given an invented one.

Usage:
    python3 tools/galcollections.py            write the pages and the sitemap
                                               block, and repoint the headings
    python3 tools/galcollections.py --dry-run  report what would be written
"""
import datetime
import html
import json
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.brownhub283.com/"
GALLERY = "gallery.html"
CATALOG = "catalog.html"
SITEMAP = "sitemap.xml"
ROBOTS = "robots.txt"
LLMS = "llms.txt"
DIR = "gallery"
TODAY = datetime.date.today().isoformat()


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def nount(n, word):
    return "%d %s%s" % (n, word, "" if n == 1 else "s")


def pict_word(n):
    return "picture" if n == 1 else "pictures"


def pictures(n):
    return nount(n, "picture")


# --- the shell, taken from the gallery itself ----------------------------------

def donor():
    src = (ROOT / GALLERY).read_text(encoding="utf-8")
    url = SITE + GALLERY
    if url not in src:
        raise ValueError("%s has no canonical URL to write over" % GALLERY)
    head = src[: src.index("</head>") + len("</head>")]
    header = src[src.index("<body"): src.index("</header>") + len("</header>")]
    footer = src[src.index('<footer class="site-footer">'):]
    title = re.search(r"<title>(.*?)</title>", src).group(1)
    desc = re.search(r'<meta name="description" content="(.*?)"', src).group(1)
    return src, head, header, footer, url, title, desc


SRC, HEAD, HEADER, FOOTER, DONOR_URL, DONOR_TITLE, DONOR_DESC = donor()

# Only a path written relative to the page needs lifting. Absolute URLs,
# root-absolute paths, fragments and mail/tel targets already resolve from below.
RELATIVE = re.compile(r'(?:href|src)="(?!https?://|/|#|mailto:|tel:|data:|blob:)([^"]+)"')


def lift(block):
    return RELATIVE.sub(lambda m: m.group(0).replace(m.group(1), "../" + m.group(1), 1), block)


# --- what each collection is, and what it is called ----------------------------

def catalog_items():
    """data-name -> the card's own shipped description, category and label."""
    src = (ROOT / CATALOG).read_text(encoding="utf-8")
    out = {}
    for tag in re.findall(r'<article class="product-card"[^>]*>', src):
        d = dict(re.findall(r'(data-name|data-cat|data-catlabel|data-desc)="([^"]*)"', tag))
        name = html.unescape(d.get("data-name", ""))
        if name:
            out[name] = {"cat": d.get("data-cat", ""),
                         "catlabel": html.unescape(d.get("data-catlabel", "")),
                         "desc": html.unescape(d.get("data-desc", ""))}
    return out


IMG = re.compile(r"<img\b[^>]*>")
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
ITEM_RE = re.compile(r'<div class="gal-item" id="item-([^"]+)">\s*<h3>'
                     r'<a href="([^"]*)">(.*?)</a></h3>\s*<ul class="gal-grid">'
                     r"(.*?)</ul>", re.S)


def collections():
    """(slug, name, query, cat, catlabel, desc, cells) in the gallery's own order.

    The name is read from the heading's own text, which is the same whether the
    heading links to the catalog card or to the collection page it now leads to.
    """
    items = catalog_items()
    out, missing = [], []
    for m in ITEM_RE.finditer(SRC):
        slug, _href, label, chunk = m.groups()
        name = html.unescape(label).strip()
        cells = [c.strip() for c in re.findall(r'<li class="gal-cell">.*?</li>', chunk, re.S)]
        info = items.get(name)
        if not info or not info["desc"]:
            missing.append(name)
            continue
        out.append({"slug": slug, "name": name, "q": urllib.parse.quote(name),
                    "cells": cells, **info})
    if missing:
        raise SystemExit("no shipped description for: %s" % ", ".join(missing))
    return out


def picture(cell):
    m = IMG.search(cell)
    return dict(ATTR.findall(m.group(0))) if m else {}


def best_copy(cell):
    """The largest copy the cell offers that really exists on disk, and its attrs."""
    img = picture(cell)
    cands = []
    for part in img.get("srcset", "").split(","):
        bits = part.strip().split()
        if len(bits) == 2 and bits[1].endswith("w"):
            try:
                cands.append((int(bits[1][:-1]), bits[0]))
            except ValueError:
                continue
    cands.sort(reverse=True)
    cands.append((0, img.get("src", "")))
    for _, path in cands:
        rel = re.sub(r"^\.\./", "", path).split("?")[0]
        if rel and (ROOT / rel).is_file():
            return rel, img
    return None, img


def prefix_cell(cell, n):
    """One gallery cell, re-pointed at a page one directory down and given an id."""
    out = cell.replace('src="images/', 'src="../images/')
    out = re.sub(r'srcset="([^"]*)"',
                 lambda m: 'srcset="%s"' % ", ".join("../" + p.strip()
                                                     for p in m.group(1).split(",")),
                 out)
    out = out.replace('href="%s?q=' % CATALOG, 'href="../%s?q=' % CATALOG)
    return out.replace('<li class="gal-cell">', '<li class="gal-cell" id="photo-%d">' % n, 1)


# --- one collection page -------------------------------------------------------

MAIN = """<main>
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow"><a href="./">Catalog pictures by collection</a></p>
        <h1>@@NAME@@ — @@NPICT@@</h1>
        <p>@@DESC@@</p>
        <p>Every picture the studio holds of @@NAME@@, on a page that names it.
        <a href="../@@CATALOG@@?q=@@Q@@">Open @@NAME@@ in the catalog</a> for the item
        itself.</p>
      </div>
    </section>

    <section class="section gal-cat" id="collection-@@CAT@@">
      <div class="container">
        <div class="section__head">
          <h2>@@CATLABEL@@</h2>
        </div>
        <div class="gal-item" id="item-@@SLUG@@">
          <h3><a href="../@@CATALOG@@?q=@@Q@@">@@NAME@@</a></h3>
          <ul class="gal-grid">
@@CELLS@@
          </ul>
        </div>
      </div>
    </section>

    <section class="section" id="other-collections">
      <div class="container">
        <div class="section__head">
          <h2>The rest of the catalog, collection by collection</h2>
          <p>Every collection in the BrownHub catalog has its own page of pictures.</p>
        </div>
        <ul class="gal-jump" aria-label="Every catalog collection">
          @@CHIPS@@
        </ul>
      </div>
    </section>

    <section class="section section--alt jask" id="collection-ask">
      <div class="container">
        <h2>Want the same answer about your own job?</h2>
        <p>Send the size, the date it is needed and whatever you already have. The studio
        reads every enquiry itself and replies the day it arrives.</p>
        <p class="jask__actions">
          <a href="../contact.html" class="btn btn--primary">Start a project</a>
          <a href="../catalog.html" class="btn btn--ghost">See the catalog</a>
        </p>
      </div>
    </section>
  </main>"""

HUB = """<main>
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow"><a href="../gallery.html">Every catalog picture on one page</a></p>
        <h1>Catalog pictures, collection by collection</h1>
        <p>@@TOTALPICT@@ of @@NAMES@@ things the studio designs and prints in Accra,
        each collection on a page of its own so the pictures sit beside the words that name
        them.</p>
      </div>
    </section>
@@SECTIONS@@
    <section class="section section--alt jask" id="collection-ask">
      <div class="container">
        <h2>Want the same answer about your own job?</h2>
        <p>Send the size, the date it is needed and whatever you already have. The studio
        reads every enquiry itself and replies the day it arrives.</p>
        <p class="jask__actions">
          <a href="../contact.html" class="btn btn--primary">Start a project</a>
          <a href="../catalog.html" class="btn btn--ghost">See the catalog</a>
        </p>
      </div>
    </section>
  </main>"""


def jsonld(text):
    return '  <script type="application/ld+json">\n%s\n  </script>\n' % text


def graph(col, url):
    entries = []
    for i, cell in enumerate(col["cells"], 1):
        rel, img = best_copy(cell)
        if not rel:
            continue
        entries.append({
            "@type": "ListItem", "position": i,
            "item": {
                "@type": "ImageObject",
                "@id": SITE + rel,
                "contentUrl": SITE + rel,
                "url": "%s#photo-%d" % (url, i),
                "caption": html.unescape(img.get("alt", "")),
                "creditText": "BrownHub Studio, Accra",
                "creator": {"@type": "Organization", "name": "BrownHub", "url": SITE},
                "inLanguage": "en",
            },
        })
    crumbs = [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
              {"@type": "ListItem", "position": 2, "name": "Catalog", "item": SITE + CATALOG},
              {"@type": "ListItem", "position": 3, "name": "Every catalog picture",
               "item": SITE + GALLERY},
              {"@type": "ListItem", "position": 4, "name": col["name"], "item": url}]
    return jsonld(json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": url,
                "url": url,
                "name": "%s — %s" % (col["name"], pictures(len(entries))),
                "description": col["desc"],
                "isPartOf": {"@type": "WebSite", "@id": SITE, "name": "BrownHub", "url": SITE},
                "image": [e["item"]["@id"] for e in entries],
                "mainEntity": {"@type": "ItemList", "name": "%s %s" % (
                                   col["name"], pict_word(len(entries))),
                               "numberOfItems": len(entries), "itemListElement": entries},
            },
            {"@type": "BreadcrumbList", "itemListElement": crumbs},
        ],
    }, ensure_ascii=False, indent=1) + "\n")


def hub_body(cols):
    """The /gallery/ page: five categories, one chip per collection, with its count."""
    parts = []
    for cat in dict.fromkeys(c["cat"] for c in cols):
        kin = [c for c in cols if c["cat"] == cat]
        chips = "</li><li>".join('<a href="%s.html">%s — %s</a>'
                                 % (c["slug"], esc(c["name"]), pictures(len(c["cells"])))
                                 for c in kin)
        parts.append("""
    <section class="section gal-cat" id="collection-@@CAT@@">
      <div class="container">
        <div class="section__head">
          <h2>@@LABEL@@</h2>
          <p>@@NCOLL@@ · @@NPICT@@</p>
        </div>
        <ul class="gal-jump" aria-label="@@LABEL@@ collections">
          <li>@@CHIPS@@</li>
        </ul>
      </div>
    </section>"""
                   .replace("@@CAT@@", cat)
                   .replace("@@LABEL@@", esc(kin[0]["catlabel"]))
                   .replace("@@NCOLL@@", nount(len(kin), "collection"))
                   .replace("@@NPICT@@", pictures(sum(len(c["cells"]) for c in kin)))
                   .replace("@@CHIPS@@", chips))
    return (HUB.replace("@@SECTIONS@@", "".join(parts))
            .replace("@@TOTALPICT@@", pictures(sum(len(c["cells"]) for c in cols)))
            .replace("@@NAMES@@", str(len(cols))))


def page(col, cols):
    url = SITE + DIR + "/" + col["slug"] + ".html"
    title = "%s %s — BrownHub design &amp; print in Accra" % (
        esc(col["name"]), pict_word(len(col["cells"])))
    desc = ("%s All %s of %s designed and printed by BrownHub in Accra, "
            "on one page." % (col["desc"], pictures(len(col["cells"])), col["name"]))

    chips = "</li><li>".join('<a href="%s.html">%s</a>' % (c["slug"], esc(c["name"]))
                             for c in cols)
    body = (MAIN.replace("@@CELLS@@",
                         "\n".join("            " + prefix_cell(c, i)
                                   for i, c in enumerate(col["cells"], 1)))
            .replace("@@CHIPS@@", "<li>" + chips + "</li>")
            .replace("@@CATLABEL@@", esc(col["catlabel"]))
            .replace("@@DESC@@", esc(col["desc"]))
            .replace("@@NPICT@@", pictures(len(col["cells"])))
            .replace("@@CAT@@", col["cat"])
            .replace("@@SLUG@@", col["slug"])
            .replace("@@Q@@", col["q"])
            .replace("@@CATALOG@@", CATALOG)
            .replace("@@NAME@@", esc(col["name"])))

    head = (HEAD.replace(DONOR_URL, url)
            .replace(DONOR_TITLE, title)
            .replace(esc(DONOR_DESC) if esc(DONOR_DESC) in HEAD else DONOR_DESC, esc(desc)))
    # The donor shares one brand card across the catalog; a collection page carries the
    # picture it actually shows, at that picture's own size.
    rel, img = best_copy(col["cells"][0])
    if rel:
        head = re.sub(r'<meta property="og:image" content="[^"]*">',
                      '<meta property="og:image" content="%s%s">' % (SITE, rel), head)
        head = re.sub(r'<meta property="og:image:width" content="[^"]*">',
                      '<meta property="og:image:width" content="%s">' % img.get("width", ""), head)
        head = re.sub(r'<meta property="og:image:height" content="[^"]*">',
                      '<meta property="og:image:height" content="%s">' % img.get("height", ""), head)
        head = re.sub(r'<meta property="og:image:alt" content="[^"]*">',
                      '<meta property="og:image:alt" content="%s">' % esc(img.get("alt", "")), head)
        head = re.sub(r'<meta name="twitter:image" content="[^"]*">',
                      '<meta name="twitter:image" content="%s%s">' % (SITE, rel), head)
    head = head.replace("</head>", graph(col, url) + "</head>")
    return url, lift(head) + "\n" + lift(HEADER) + "\n  " + body + "\n\n" + lift(FOOTER) + "\n"


def hub_page(cols):
    """gallery/index.html — the address /gallery/ and the hub every collection links from."""
    url = SITE + DIR + "/"
    title = "Catalog Pictures by Collection — BrownHub design &amp; print in Accra"
    desc = ("Every catalog collection on its own page of pictures: %d collections and %d "
            "photographs of the design and print work BrownHub makes in Accra, Ghana."
            % (len(cols), sum(len(c["cells"]) for c in cols)))
    entries = [{"@type": "ListItem", "position": i,
                "item": {"@type": "WebPage", "@id": SITE + DIR + "/" + c["slug"] + ".html",
                         "name": c["name"], "url": SITE + DIR + "/" + c["slug"] + ".html"}}
               for i, c in enumerate(cols, 1)]
    crumbs = [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
              {"@type": "ListItem", "position": 2, "name": "Catalog", "item": SITE + CATALOG},
              {"@type": "ListItem", "position": 3, "name": "Every catalog picture",
               "item": SITE + GALLERY},
              {"@type": "ListItem", "position": 4, "name": "Catalog pictures by collection",
               "item": url}]
    ld = jsonld(json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "CollectionPage", "@id": url, "url": url,
             "name": "Catalog pictures by collection", "description": desc,
             "isPartOf": {"@type": "WebSite", "@id": SITE, "name": "BrownHub", "url": SITE},
             "mainEntity": {"@type": "ItemList", "name": "BrownHub catalog collections",
                            "numberOfItems": len(entries), "itemListElement": entries}},
            {"@type": "BreadcrumbList", "itemListElement": crumbs},
        ],
    }, ensure_ascii=False, indent=1) + "\n")
    head = (HEAD.replace(DONOR_URL, url)
            .replace(DONOR_TITLE, title)
            .replace(esc(DONOR_DESC) if esc(DONOR_DESC) in HEAD else DONOR_DESC, esc(desc))
            .replace("</head>", ld + "</head>"))
    return url, lift(head) + "\n" + lift(HEADER) + "\n  " + hub_body(cols) + "\n\n" + lift(FOOTER) + "\n"


# --- the sitemap, robots and the gallery's own headings -------------------------

def sitemap_block(url):
    return ("  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n"
            "    <changefreq>yearly</changefreq>\n    <priority>0.5</priority>\n  </url>\n"
            % (url, TODAY))


def write_sitemap(urls):
    text = (ROOT / SITEMAP).read_text(encoding="utf-8")
    text = re.sub(r"  <url>\n    <loc>%s%s/[^<]*</loc>.*?</url>\n" % (SITE, DIR), "", text, flags=re.S)
    return text.replace("</urlset>", "".join(sitemap_block(u) for u in urls) + "</urlset>")


def write_robots():
    text = (ROOT / ROBOTS).read_text(encoding="utf-8")
    if "Allow: /%s/" % DIR in text:
        return text
    return text.replace("Allow: /gallery.html\n", "Allow: /gallery.html\nAllow: /%s/\n" % DIR)


def write_llms(urls, hub):
    """Point the AI crawlers at the hub, not at twenty-six loose addresses."""
    text = (ROOT / LLMS).read_text(encoding="utf-8")
    line = ("- One page of pictures per catalog collection: %s\n" % hub)
    if "/gallery/" in text:
        return text
    return text.replace("## Company details", line + "\n## Company details")


def repoint_gallery(cols):
    """The gallery's collection headings lead to their own page of pictures."""
    text = (ROOT / GALLERY).read_text(encoding="utf-8")
    moved = 0
    for col in cols:
        for frm in ('<a href="catalog.html?q=%s">' % col["q"],
                    '<a href="%s/%s.html">' % (DIR, col["slug"]),
                    '<a href="./%s.html">' % col["slug"]):
            needle = '<div class="gal-item" id="item-%s">\n        <h3>%s' % (col["slug"], frm)
            if needle in text:
                text = text.replace(needle,
                                    needle[:needle.index("<h3>") + 4]
                                    + '<a href="%s/%s.html">' % (DIR, col["slug"]), 1)
                moved += 1
                break
    return text, moved


def main():
    dry = "--dry-run" in sys.argv
    cols = collections()
    total = sum(len(c["cells"]) for c in cols)
    hub_url, hub_text = hub_page(cols)
    urls = [SITE + DIR + "/" + c["slug"] + ".html" for c in cols]
    if dry:
        print("dry run: %d collection pages + /gallery/ · %d pictures" % (len(cols), total))
        return 0
    outdir = ROOT / DIR
    outdir.mkdir(exist_ok=True)
    for col in cols:
        _url, text = page(col, cols)
        (outdir / (col["slug"] + ".html")).write_text(text, encoding="utf-8")
    (outdir / "index.html").write_text(hub_text, encoding="utf-8")
    (ROOT / SITEMAP).write_text(write_sitemap([hub_url] + urls), encoding="utf-8")
    (ROOT / ROBOTS).write_text(write_robots(), encoding="utf-8")
    (ROOT / LLMS).write_text(write_llms(urls, hub_url), encoding="utf-8")
    newtext, moved = repoint_gallery(cols)
    (ROOT / GALLERY).write_text(newtext, encoding="utf-8")
    print("%s/: %d collection pages + the hub · %d pictures · sitemap %d entries · "
          "gallery headings repointed %d" % (DIR, len(cols), total, len(urls) + 1, moved))
    return 0


if __name__ == "__main__":
    sys.exit(main())
