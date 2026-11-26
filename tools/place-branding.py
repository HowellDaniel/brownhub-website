#!/usr/bin/env python3
"""Place the Mina's Touch and Kyridel brand work into the catalog, the gallery,
the home rail and the two services rows that were still drawn as SVG mocks."""
import json, pathlib, re

ROOT = pathlib.Path("/Users/brownhub/Documents/Qoder/2026-09-16/5bb3bd1c")

# slug, display name, base/hi pixel boxes, shots (file, base w/h, alt), category, description
ITEMS = [
    {
        "slug": "minas-touch",
        "name": "Mina's Touch Beauty Branding",
        "cat": "print",
        "desc": "Brand identity for a skincare house — the mark, its red and gold palette, and the labels carried across bottle, tube, jar and carton.",
        "shots": [
            ("minas-touch", 760, 570, 1600, 1200, "wide", "Skincare range branded with one mark"),
            ("minas-touch-2", 610, 760, 1284, 1600, "tall", "Amber bottles and cream jar carrying the same mark"),
            ("minas-touch-3", 760, 445, 1600, 937, "wide", "The mark applied to bag, shirt, mug, frame, card and notepad"),
            ("minas-touch-4", 510, 760, 1074, 1600, "tall", "Serum bottle and carton in the brand colours"),
        ],
    },
    {
        "slug": "kyriddel",
        "name": "Kyridel Beauty Branding",
        "cat": "print",
        "desc": "Beauty essentials dressed from a single mark — a fine-line monogram, warm neutrals, and the serum bottle and its carton carrying both.",
        "shots": [
            ("kyriddel", 510, 760, 1074, 1600, "tall", "Serum bottle and carton carrying a fine-line monogram"),
            ("kyriddel-2", 760, 445, 1600, 937, "wide", "The monogram applied to bag, shirt, mug, frame, card and notepad"),
        ],
    },
]
CATLABEL = "Flyers &amp; printing"
LABEL = "Flyers & printing"


def amp(s):
    """gallery.html writes its apostrophes as entities; catalog.html does not."""
    return s.replace("&", "&amp;").replace("'", "&#x27;")


def plain(s):
    return s.replace("&", "&amp;")


def q(s):
    return s.replace(" ", "%20").replace("'", "%27").replace(",", "%2C")


def card(it):
    first = it["shots"][0]
    f, w, h, mw, mh, art, alt = first
    imgs = ", ".join("images/catalog/%s.jpg" % s[0] for s in it["shots"])
    name = plain(it["name"])
    return (
        '          <article class="product-card" tabindex="0" id="item-%s" role="button" '
        'aria-label="View details: %s" data-name="%s" data-cat="%s" data-catlabel="%s" '
        'data-img="images/catalog/%s.jpg" data-imgs="%s" data-desc="%s">\n'
        '            <div class="media" data-art="%s" style="--art-w:%d;--art-h:%d;--art-max-w:%d;--art-max-h:%d">'
        '<picture><source type="image/avif" srcset="images/catalog/%s.avif %dw, images/catalog/hi/%s.avif %dw" '
        'sizes="(max-width:719px) 182px, %dpx">'
        '<img src="images/catalog/%s.jpg" alt="%s" loading="lazy" decoding="async" '
        'srcset="images/catalog/%s.jpg %dw, images/catalog/hi/%s.jpg %dw" sizes="(max-width:719px) 182px, %dpx"></picture></div>\n'
        '            <div class="product-card__body">\n'
        "              <h3>%s</h3>\n"
        '              <span class="card__link">View details →</span>\n'
        "            </div>\n"
        "          </article>"
    ) % (it["slug"], name, name, it["cat"], CATLABEL, f, imgs, plain(it["desc"]),
         art, w, h, mw, mh, f, w, f, mw, w, f, plain(alt), f, w, f, mw, w, name)


def rail(it):
    f, w, h, mw, mh, art, alt = it["shots"][0]
    name = plain(it["name"])
    return (
        '          <a class="product-card flow__card" href="catalog.html?q=%s">\n'
        '            <div class="media" data-art="%s" style="--art-w:%d;--art-h:%d;--art-max-w:%d;--art-max-h:%d">'
        '<picture><source type="image/avif" srcset="images/catalog/%s.avif %dw, images/catalog/hi/%s.avif %dw" '
        'sizes="(max-width:719px) 341px, %dpx">'
        '<img data-src="images/catalog/%s.jpg" alt="%s" loading="lazy" decoding="async" '
        'data-srcset="images/catalog/%s.jpg %dw, images/catalog/hi/%s.jpg %dw" sizes="(max-width:719px) 341px, %dpx"></picture></div>\n'
        '            <div class="product-card__body"><h3>%s</h3><span class="card__link">View details &rarr;</span></div>\n'
        "          </a>"
    ) % (q(it["name"]), art, w, h, mw, mh, f, w, f, mw, w, f, plain(alt), f, w, f, mw, w, name)


def gal_item(it):
    n = len(it["shots"])
    cells = []
    for i, (f, w, h, _mw, _mh, _art, _alt) in enumerate(it["shots"], 1):
        cells.append(
            (
                '            <li class="gal-cell"><a class="gal-link" href="catalog.html?q=%s">'
                '<picture><source type="image/avif" srcset="images/catalog/%s.avif">'
                '<img src="images/catalog/%s.jpg" alt="%s, %s design and print by BrownHub Studio, Accra — photo %d of %d" '
                'width="%d" height="%d" loading="lazy" decoding="async"></picture></a></li>'
            ) % (q(it["name"]), f, f, amp(it["name"]), CATLABEL, i, n, w, h)
        )
    return (
        '      <div class="gal-item" id="item-%s">\n'
        '        <h3><a href="catalog.html?q=%s">%s</a></h3>\n'
        '        <ul class="gal-grid">\n%s\n'
        "        </ul>\n"
        "      </div>"
    ) % (it["slug"], q(it["name"]), amp(it["name"]), "\n".join(cells))


def edit(path, old, new, count=1):
    p = ROOT / path
    src = p.read_text(encoding="utf8")
    assert src.count(old) == count, "%s: anchor found %d times, expected %d" % (path, src.count(old), count)
    p.write_text(src.replace(old, new, count), encoding="utf8")
    print("edited", path)


# ── catalog.html: two cards at the foot of the grid ───────────────────────────
anchor = "        </div>\n        <!-- the second bought placement"
edit("catalog.html", anchor, "\n".join(card(i) for i in ITEMS) + "\n" + anchor)

# ── gallery.html: two items at the foot of the donor wall ─────────────────────
src = (ROOT / "gallery.html").read_text(encoding="utf8")
tail = 'src="images/catalog/gold-perspex-7.jpg"'
assert src.count(tail) == 1
cut = src.index("      </div>\n", src.index("</ul>\n", src.index(tail))) + len("      </div>\n")
src = src[:cut] + "\n".join(gal_item(i) for i in ITEMS) + "\n" + src[cut:]
(ROOT / "gallery.html").write_text(src, encoding="utf8")
print("edited gallery.html")

# ── index.html: two cards at the foot of the rail, inside .flow__items ────────
anchor = ('<div class="product-card__body"><h3>Wedding Invitation Cards</h3>'
          '<span class="card__link">View details &rarr;</span></div>\n          </a>\n')
edit("index.html", anchor, anchor + "\n".join(rail(i) for i in ITEMS) + "\n")

# ── services.html: photograph the two rows that were still mocks ──────────────
# Targeted by row id: the luggage row reuses the same "visual--logo" mock class.
src = (ROOT / "services.html").read_text(encoding="utf8")
for row_id, shot in (("logo-brand", "minas-touch-3"), ("packaging", "minas-touch")):
    assert src.count('id="%s"' % row_id) == 1, row_id
    start = src.index('<div class="service-row__visual"', src.index('id="%s"' % row_id))
    end = src.index("</div></div>", start) + len("</div></div>")
    repl = ('<div class="service-row__visual" aria-hidden="true"><picture>'
            '<source type="image/avif" srcset="images/catalog/%s.avif">'
            '<img class="service-shot" src="images/catalog/%s.jpg" alt="" loading="lazy" decoding="async">'
            "</picture></div>") % (shot, shot)
    src = src[:start] + repl + src[end:]
    print("services:", row_id, "->", shot)
(ROOT / "services.html").write_text(src, encoding="utf8")

# ── js/catalog.js: the hi-tier list, kept in code-unit order ─────────────────
src = (ROOT / "js/catalog.js").read_text(encoding="utf8")
m = re.search(r"(  var HI = \{\n)(.*?)(\n  \};)", src, re.S)
keys = set(re.findall(r'^\s*"([^"]+)": 1,?$', m.group(2), re.M))
for it in ITEMS:
    for s_ in it["shots"]:
        keys.add(s_[0] + ".jpg")
ordered = sorted(keys)
body = "".join('    "%s": 1,\n' % k for k in ordered[:-1]) + '    "%s": 1' % ordered[-1]
src = src[:m.start(2)] + body + src[m.end(2):]
(ROOT / "js/catalog.js").write_text(src, encoding="utf8")
print("js/catalog.js: HI now", len(keys), "entries")

# ── js/search.js: two command-palette rows beside their catalog neighbours ────
anchor = ('{ g: "Catalog", t: "Wedding Invitation Cards", h: "catalog.html?q=Wedding%20Invitation%20Cards", '
          'k: "wedding invitation card invite marriage ceremony printed card gold" },')
rows = "\n".join(
    '    { g: "Catalog", t: "%s", h: "catalog.html?q=%s", k: "%s" },'
    % (it["name"], q(it["name"]),
       ("mina's touch beauty branding skincare cosmetics serum lotion cream carton label packaging range"
        if it["slug"] == "minas-touch" else
        "kyridel beauty branding essentials monogram serum carton label packaging skincare"))
    for it in ITEMS)
edit("js/search.js", anchor, anchor + "\n" + rows)

# ── the count the assistant export and the published metric both have to agree to
p = ROOT / "tests/catalog-data.test.mjs"
src = p.read_text(encoding="utf8")
assert src.count("assert.equal(data.items.length, 33);") == 1
p.write_text(src.replace("data.items.length, 33", "data.items.length, 35"), encoding="utf8")
print("tests/catalog-data.test.mjs: 33 -> 35")

p = ROOT / "data/metrics.json"
src = p.read_text(encoding="utf8")
assert src.count('{ "value": 29, "label": "Catalog items"') == 1
p.write_text(src.replace('{ "value": 29, "label": "Catalog items"', '{ "value": 35, "label": "Catalog items"'),
             encoding="utf8")
print("data/metrics.json: 29 -> 35")
