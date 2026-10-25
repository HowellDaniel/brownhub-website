#!/usr/bin/env python3
"""Generate the studio journal from blog/posts/*.md.

The site has no build step and is served as committed files, so a post is written in
markdown once and turned into a real HTML page — one per post, at a stable URL, with the
same head, nav, footer, CSP and JSON-LD the rest of the site carries. Nothing is rendered
in the browser at visit time: a page that only exists after JavaScript runs is a page no
search engine and no reader on a slow phone can find.

    python3 tools/blog.py            regenerate blog/*.html, blog/, blog.html and data/posts.json
    python3 tools/blog.py --check    exit non-zero if the committed pages differ

The markdown subset is deliberately small — headings, paragraphs, emphasis, links, images,
lists and quotes — because every feature added here is a feature the four-locale sweep and
the print pipeline have to survive later. The shell itself lives in tools/blog_template.py.
"""
import datetime
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.brownhub283.com/"
POSTS_DIR = os.path.join(ROOT, "blog", "posts")
BLOG_DIR = os.path.join(ROOT, "blog")
WORDS_PER_MIN = 220


# ---------------------------------------------------------------- front matter
def split_front(text):
    """Return (meta, body). Front matter is a leading --- block of key: value lines."""
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise ValueError("post has no front matter block")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            meta[k] = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k] = v.strip('"')
    return meta, text[m.end():]


# ---------------------------------------------------------------- inline + blocks
def inline(s, root):
    """Escape first, then apply the small set of inline rules. Order matters: code spans
    are pulled out before emphasis so an underscore inside a filename survives."""
    codes = []

    def stash(m):
        codes.append(m.group(1))
        return "\x00%d\x00" % (len(codes) - 1)

    s = re.sub(r"`([^`]+)`", stash, s)
    s = html.escape(s, quote=False)
    s = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", lambda m: picture(m.group(1), m.group(2), root), s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: link(m.group(1), m.group(2), root), s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", s)
    for i, c in enumerate(codes):
        # A filename in a post is a filename, not prose: translated it stops naming the
        # file the reader is meant to send. Same rule the code showcase already follows.
        s = s.replace("\x00%d\x00" % i, '<code data-i18n-off>%s</code>'
                                 % html.escape(c, quote=False))
    return s


def href_of(u, root):
    """A scheme-relative or absolute URL passes through; anything else is a site path and
    needs the page's own prefix, because a post lives one directory deeper than index.html."""
    if re.match(r"^[a-z]+:|^//|^#", u):
        return u
    return root + u.lstrip("/")


def link(text, url, root):
    ext = re.match(r"^[a-z]+:", url)
    attrs = ' href="%s"' % html.escape(href_of(url, root), quote=True)
    if ext:
        attrs += ' target="_blank" rel="noopener"'
    return "<a%s>%s</a>" % (attrs, text)


def picture(alt, src, root):
    return ('<img src="%s" alt="%s" loading="lazy" decoding="async">'
            % (html.escape(href_of(src, root), quote=True), html.escape(alt, quote=True)))


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "s"


# Anything that begins a block ends the paragraph or list item being accumulated.
BLOCK_START = re.compile(r"^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|>|---)")


def take_list(lines, i, item_re):
    """Read a list from line i and return (items, next i).

    A bullet is allowed to run over as many source lines as it needs: a note is written
    wrapped at eighty characters, and if the continuation did not belong to its item the
    list would split into two and the numbering restarts from one mid-page."""
    items = []
    while i < len(lines) and item_re.match(lines[i]):
        buf = [item_re.sub("", lines[i])]
        i += 1
        while (i < len(lines) and lines[i].strip()
               and not item_re.match(lines[i]) and not BLOCK_START.match(lines[i])):
            buf.append(lines[i].strip())
            i += 1
        items.append(" ".join(buf))
    return items, i


def to_html(body, root):
    """Blocks: headings, lists, quotes, rules, figures and paragraphs."""
    out, lines, i = [], body.splitlines(), 0
    words = len(re.findall(r"\w+", body))
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("---") and len(ln.strip()) <= 4:
            out.append("<hr>")
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.*)$", ln)
        if m:
            # A post's own h1 is the page title in the hero, so its sections start at h2.
            # Writing `# Section` and `## Section` both land on h2 rather than skipping a level.
            lvl = min(max(len(m.group(1)), 2), 4)
            txt = m.group(2).strip()
            out.append('<h%d id="%s">%s</h%d>' % (lvl, slugify(txt), inline(txt, root), lvl))
            i += 1
            continue
        if ln.lstrip().startswith(">"):
            buf = []
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                buf.append(lines[i].lstrip()[1:].strip())
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % inline(" ".join(buf), root))
            continue
        if re.match(r"^\s*[-*]\s+", ln):
            items, i = take_list(lines, i, re.compile(r"^\s*[-*]\s+"))
            out.append("<ul>" + "".join("<li>%s</li>" % inline(x, root) for x in items) + "</ul>")
            continue
        if re.match(r"^\s*\d+\.\s+", ln):
            items, i = take_list(lines, i, re.compile(r"^\s*\d+\.\s+"))
            out.append("<ol>" + "".join("<li>%s</li>" % inline(x, root) for x in items) + "</ol>")
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not BLOCK_START.match(lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append("<p>%s</p>" % inline(" ".join(buf), root))
    return "\n".join(out), words


def read_time(words):
    return max(1, int(round(words / float(WORDS_PER_MIN))))


# ---------------------------------------------------------------- sitemap block
# The rest of the sitemap is kept by hand, because the other nine pages change when a
# person changes them. A journal changes when a post lands, and a post landing is exactly
# the moment somebody forgets to edit a second file — so the generator owns the slice of
# this file between the two markers and writes nothing outside them.
SITEMAP_HEAD = "  <!-- BEGIN JOURNAL (tools/blog.py — do not edit between the markers) -->"
SITEMAP_TAIL = "  <!-- END JOURNAL -->"


def sitemap_block(posts):
    urls = ['    <loc>%sblog/</loc>\n    <lastmod>%s</lastmod>'
            '\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>'
            % (SITE, posts[0]["date"])]
    urls += ['    <loc>%sblog/%s.html</loc>\n    <lastmod>%s</lastmod>'
             '\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>'
             % (SITE, p["slug"], p["date"]) for p in posts]
    return "\n".join([SITEMAP_HEAD] + ["  <url>\n%s\n  </url>" % u for u in urls]
                      + [SITEMAP_TAIL])


def patch_sitemap(path, posts):
    """Replace the journal slice of sitemap.xml, or add it before </urlset>."""
    src = open(path, encoding="utf-8").read()
    block = sitemap_block(posts)
    if SITEMAP_HEAD in src:
        out = re.sub(re.escape(SITEMAP_HEAD) + r".*?" + re.escape(SITEMAP_TAIL),
                     lambda _m: block, src, flags=re.S)
    else:
        out = src.replace("</urlset>", block + "\n</urlset>")
    return src, out


# ---------------------------------------------------------------- loading
def load_posts():
    posts = []
    for path in sorted(glob.glob(os.path.join(POSTS_DIR, "*.md"))):
        meta, body = split_front(open(path, encoding="utf-8").read())
        for k in ("title", "slug", "date", "desc"):
            if not meta.get(k):
                raise ValueError("%s: missing '%s'" % (os.path.basename(path), k))
        datetime.date.fromisoformat(meta["date"])
        html_body, words = to_html(body, "../")
        meta.update({
            "body": html_body,
            "words": words,
            "read": read_time(words),
            "tags": meta.get("tags") or [],
            "file": os.path.basename(path),
        })
        posts.append(meta)
    posts.sort(key=lambda p: p["date"], reverse=True)
    slugs = [p["slug"] for p in posts]
    dupes = set(s for s in slugs if slugs.count(s) > 1)
    if dupes:
        raise ValueError("duplicate slugs: %s" % ", ".join(sorted(dupes)))
    return posts


def main():
    mode = "--check" in sys.argv
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import blog_template as T

    posts = load_posts()
    if not posts:
        print("no posts in blog/posts — nothing written")
        return 1

    written = {}
    for p in posts:
        written["blog/%s.html" % p["slug"]] = T.post_page(p, posts)
    # The index is the directory, so the address a reader types and the address the nav
    # prints are the same page: /blog/. What used to be the index stays as a redirect,
    # because the footers, the search index and the feed all carried that filename.
    written["blog/index.html"] = T.index_page(posts)
    written["blog.html"] = T.moved_page()
    written["feed.xml"] = T.feed_page(posts)
    src, written["sitemap.xml"] = patch_sitemap(os.path.join(ROOT, "sitemap.xml"), posts)
    written["data/posts.json"] = json.dumps({
        "_how_to_add": "Generated by tools/blog.py from blog/posts/*.md. Edit the markdown and re-run the generator; this file is the machine-readable list the sitemap, the search index and the feed read.",
        "updated": datetime.date.today().isoformat(),
        "posts": [{
            "slug": p["slug"], "title": p["title"], "date": p["date"],
            "desc": p["desc"], "tags": p["tags"], "read": p["read"],
            "url": "blog/%s.html" % p["slug"],
        } for p in posts],
    }, ensure_ascii=False, indent=2) + "\n"

    if mode:
        stale = [f for f, c in written.items()
                 if not os.path.exists(os.path.join(ROOT, f))
                 or open(os.path.join(ROOT, f), encoding="utf-8").read() != c]
        if stale:
            print("stale: " + ", ".join(stale))
            return 1
        print("journal pages match the markdown (%d posts)" % len(posts))
        return 0

    for f, content in written.items():
        full = os.path.join(ROOT, f)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        open(full, "w", encoding="utf-8").write(content)
        print("wrote %s (%d bytes)" % (f, len(content)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
