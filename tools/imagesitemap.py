#!/usr/bin/env python3
"""Rebuild the <image:image> entries of sitemap.xml from what each page shows.

Why this exists: the sitemap used to name one collection — the 166 gallery
photos — and only the smaller copy of each. Google Images reads this file to
decide which pictures of BrownHub's to index, so every picture that is not
named here has to be found by crawling instead, which on a domain this young it
slowly does. The home page, catalog and the four rendered website studies on
engineering.html were never named at all.

Rules the generator holds to:

  * Only a picture with real alt text is declared. An empty alt is the markup's
    own way of saying "this is decoration", and the plates and concept tiles are
    exactly that — declaring them would put atmosphere where the work should be.
  * The largest copy a page offers is the one declared. A srcset candidate of
    1080w beats the 608w fallback, and Google's size filter rewards the bigger
    file; the smaller copy is still what a phone downloads.
  * The image belongs to the page that shows it. Each <url> block keeps its own
    pictures, so a picture on three pages is declared on three pages.
  * Nothing is invented here. Title and caption come from the alt text a human
    wrote; a picture with no alt is skipped rather than described. The one
    exception is the BRAND table — the logo, the app icon and the two brand
    cards, whose alt in the header is the link's label and has to stay short.
    Those wordings were written by reading each file, not from the filename.

Usage:  python3 tools/imagesitemap.py [--dry-run]
"""
import html.parser
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.brownhub283.com"

# A loc in the sitemap, and the file on disk that answers it.
SKIP_SRC = re.compile(r"(^data:|\.svg$|images/logo\.|images/favicon|images/qr-)", re.I)
MAX_PER_PAGE = 1000

# The four marks the studio is known by, named here by hand rather than mined.
#
# The nav logo's alt is "BrownHub" and that is correct: in the header the picture
# is the link's label, and a screen reader should say the brand, not describe a
# shape. So the crawler gets its description from this table instead of from the
# markup, and the two do not have to compromise each other. Each wording below
# was read off the file itself.
BRAND = {
    "index.html": [
        ("images/logo.png",
         "BrownHub logo",
         "The BrownHub logo: a red lowercase b and a gold capital H locked together above "
         "the wordmark BROWNHUB, which is gold except for its final red B, with the studio's "
         "tagline ...intellectual designs beneath it."),
        ("icons/icon-512.png",
         "BrownHub Studio app icon",
         "The BrownHub mark as the installed app carries it: the red b and gold H, the "
         "BROWNHUB wordmark and the tagline ...intellectual designs, set inside a white "
         "circle on a warm cream field."),
        ("images/og-image.jpg",
         "BrownHub Studio — creative graphic design studio in Accra",
         "The studio's brand card: its logo beside the words We turn ideas into powerful "
         "visuals, the services Logos, Brand identity, Social media, Print and Packaging, the "
         "Accra contact numbers, and four real jobs — an event flyer, a memorial banner, an "
         "open book spread and a crystal award plaque."),
    ],
    "catalog.html": [
        ("images/og-catalog.jpg",
         "BrownHub Studio catalog — design, print and merchandise in Accra",
         "The catalog's brand card: the BrownHub logo in a white circle beside the words "
         "BrownHub Studio, and beneath them Catalog, Accra, design, print and merchandise "
         "over the studio's own red and gold."),
    ],
}


class ImgCollector(html.parser.HTMLParser):
    """Every <img> on a page, with the attributes a crawler can use."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.imgs = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        a = dict(attrs)
        # Most of the site's lazy pictures have no src at all: js/perf.js reads
        # data-src once the picture is near the viewport. A crawler that never
        # runs that script sees only these two attributes, and so does this file.
        self.imgs.append({
            "src": (a.get("src") or a.get("data-src") or "").strip(),
            "srcset": (a.get("srcset") or a.get("data-srcset") or "").strip(),
            "alt": (a.get("alt") or "").strip(),
        })


def absolute(path):
    p = re.sub(r"^\.?/", "", path)
    p = p.split("#")[0].split("?")[0]          # a cache-buster is not another picture
    # A page one directory down reaches the same picture as "../images/...".
    # The sitemap has to name the one address that picture actually answers at.
    segs = []
    for seg in p.split("/"):
        if seg == "..":
            if segs:
                segs.pop()
        elif seg not in ("", "."):
            segs.append(seg)
    return SITE + "/" + "/".join(segs)


def on_disk(loc):
    """True when the declared address is really a picture in this repository.

    A srcset is markup, not a promise: a page can still name a hi/ tier that was
    never sampled, and then the largest candidate this script prefers is a 404.
    Putting that address in the sitemap would ask Google to index a picture that
    answers with the offline page — worse than not declaring it at all.
    """
    rel = loc[len(SITE):].lstrip("/")
    return (ROOT / rel).is_file()


def best_url(img):
    """The largest candidate the page offers that actually exists."""
    cands = []
    for part in img["srcset"].split(","):
        bits = part.strip().split()
        if len(bits) == 2 and bits[1].endswith("w"):
            try:
                cands.append((int(bits[1][:-1]), bits[0]))
            except ValueError:
                continue
    cands.sort(reverse=True)
    cands.append((0, img["src"]))
    for _, path in cands:
        loc = absolute(path)
        if on_disk(loc):
            return loc
    return None


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def title_of(alt):
    """The first clause of the alt — the picture's name, not its whole caption."""
    head = re.split(r"\s+[—-]\s+|,\s+", alt)[0].strip()
    if len(head) > 160:
        head = head[:160].rsplit(" ", 1)[0]
    return head


def collect(page_file):
    text = (ROOT / page_file).read_text(encoding="utf-8")
    p = ImgCollector()
    p.feed(text)
    seen, out = set(), []
    for img in p.imgs:
        alt = img["alt"]
        url = img["src"]
        if not alt or not url or SKIP_SRC.search(url):
            continue
        loc = best_url(img)
        if not loc or "/images/" not in loc:
            continue
        if loc in seen:
            continue
        seen.add(loc)
        out.append((loc, title_of(alt), alt))
    for rel, title, caption in BRAND.get(page_file, []):
        loc = absolute(rel)
        if loc in seen:
            continue
        if not on_disk(loc):
            sys.stderr.write("  ~ %s is named as brand art but is not on disk — skipped\n" % rel)
            continue
        seen.add(loc)
        out.append((loc, title, caption))
    return out[:MAX_PER_PAGE]


def blocks(entries, pad):
    if not entries:
        return ""
    out = []
    for loc, title, caption in entries:
        if len(caption) > 300:
            caption = caption[:300].rsplit(" ", 1)[0]
        out.append(
            pad + "<image:image>\n" +
            pad + "  <image:loc>" + esc(loc) + "</image:loc>\n" +
            pad + "  <image:title>" + esc(title) + "</image:title>\n" +
            pad + "  <image:caption>" + esc(caption) + "</image:caption>\n" +
            pad + "</image:image>"
        )
    return "\n".join(out) + "\n"


def main():
    dry = "--dry-run" in sys.argv
    sm = ROOT / "sitemap.xml"
    text = sm.read_text(encoding="utf-8")

    total_before = text.count("<image:loc>")
    hi_before = len(re.findall(r"<image:loc>[^<]*/hi/", text))

    def fill(m):
        block = m.group(0)
        loc = re.search(r"<loc>(.*?)</loc>", block).group(1)
        path = loc.replace(SITE, "") or "/"
        page = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        if page.endswith("/"):
            page += "index.html"
        f = ROOT / page
        if not f.exists():
            sys.stderr.write("  ! %s is in the sitemap but not on disk — left alone\n" % page)
            return block
        entries = collect(page)
        # Drop anything this generator wrote last time, keep the page's own lines.
        block = re.sub(r"[ \t]*<image:image>.*?</image:image>\n", "", block, flags=re.S)
        block = re.sub(r"\n[ \t]*\n", "\n", block)
        pad = "    "
        insert = blocks(entries, pad)
        i = block.rindex("</url>")
        return block[:i].rstrip() + "\n" + insert + block[i:]

    text = re.sub(r"<url>.*?</url>", fill, text, flags=re.S)
    total_after = text.count("<image:loc>")
    hi_after = len(re.findall(r"<image:loc>[^<]*/hi/", text))

    if dry:
        sys.stdout.write("dry run: %d -> %d entries, hi tier %d -> %d\n"
                         % (total_before, total_after, hi_before, hi_after))
        return 0
    sm.write_text(text, encoding="utf-8")
    print("sitemap.xml: %d -> %d image entries (%d now the largest copy)"
          % (total_before, total_after, hi_after))
    return 0


if __name__ == "__main__":
    sys.exit(main())
