#!/usr/bin/env python3
"""The page shell the studio journal is written into.

Every page on this site carries its own copy of the head, the nav bar and the footer —
that is how it has always been built, and twelve documents now repeat the same content
policy and the same `?v=` script ledger. A journal that copies them a thirteenth time
by hand would simply be a second place to forget to update the CSP. So this module reads
the shell out of privacy.html at build time: whatever the site ships today is what every
post page ships, character for character, with the relative paths lifted by one directory
and the page's own title, description and canonical URL put in their places.

    python3 tools/blog_template.py    print what the module found, to check the slicing
"""
import datetime
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.brownhub283.com/"
# The document the shell is taken from: the site's plainest page. No hero clip, no
# pinned band, no catalog driver — just head, nav, prose column and footer.
DONOR = "privacy.html"
DONOR_URL = SITE + DONOR
MARK = "@@MAIN@@"


def _donor():
    with open(os.path.join(ROOT, DONOR), encoding="utf-8") as fh:
        src = fh.read()
    if DONOR_URL not in src:
        raise ValueError("%s has no canonical URL to write over" % DONOR)
    head = src[: src.index("</head>") + len("</head>")]
    header = src[src.index("<body"): src.index("</header>") + len("</header>")]
    footer = src[src.index('<footer class="site-footer">'):]
    title = re.search(r"<title>(.*?)</title>", src).group(1)
    desc = re.search(r'<meta name="description" content="(.*?)"', src).group(1)
    return head, header, footer, title, desc


HEAD, HEADER, FOOTER, DONOR_TITLE, DONOR_DESC = _donor()

# Only a path written relative to the page needs lifting. Absolute URLs, root-absolute
# paths, fragments and mail/tel targets already resolve from any directory.
RELATIVE = re.compile(r'(?:href|src)="(?!https?://|/|#|mailto:|tel:|data:|blob:)([^"]+)"')


def lift(html, root):
    return RELATIVE.sub(lambda m: m.group(0).replace(m.group(1), root + m.group(1), 1), html)


def date_label(iso):
    d = datetime.date.fromisoformat(iso)
    return "%d %s %d" % (d.day, d.strftime("%B"), d.year)


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def shell(page, title, desc, type_="website", published=None):
    """Head, nav and footer carrying this page's own identity, with MARK where the main goes."""
    url = SITE + page
    root = "../" if page.startswith("blog/") else ""
    head = (HEAD.replace(DONOR_URL, url)
            .replace(DONOR_TITLE, esc(title))
            # The donor's description sits in three attributes and one element, all of them
            # double-quoted, so the replacement has to arrive escaped the same way.
            .replace(esc(DONOR_DESC) if esc(DONOR_DESC) in HEAD else DONOR_DESC, esc(desc)))
    head = head.replace('<meta property="og:type" content="website">',
                        '<meta property="og:type" content="%s">' % type_)
    if type_ == "article":
        head = head.replace("</head>",
                            '  <meta property="article:published_time" content="%s">\n'
                            '  <meta property="article:section" content="BrownHub journal">\n'
                            % published + "</head>")
    head = head.replace('<link rel="stylesheet"',
                        '  <link rel="alternate" type="application/rss+xml"'
                        ' title="BrownHub Journal" href="/feed.xml">\n  <link rel="stylesheet"')
    body = HEADER.replace('<body data-nav="privacy">', '<body data-nav="journal">')
    # Every page this module writes is the journal, so its own nav tab lights — the same
    # way About lights on about.html. Done before the paths are lifted, so it is written
    # once here rather than in each page's main.
    body = body.replace('<a href="blog/" class="nav__link">Blog</a>',
                        '<a href="blog/" class="nav__link nav__link--active" '
                        'aria-current="page">Blog</a>')
    if root:
        head, body, FOOTER_ = lift(head, root), lift(body, root), lift(FOOTER, root)
    else:
        FOOTER_ = FOOTER
    return head + "\n" + body + "\n  " + MARK + "\n\n" + FOOTER_ + "\n"


def jsonld(text):
    return '  <script type="application/ld+json">\n%s\n  </script>\n' % text


def ld_post(post):
    page = SITE + "blog/" + post["slug"] + ".html"
    return json.dumps({
        "@type": "BlogPosting",
        "@id": page + "#article",
        "headline": post["title"],
        "description": post["desc"],
        "datePublished": post["date"],
        "dateModified": post["date"],
        "wordCount": post["words"],
        "inLanguage": "en",
        "keywords": ", ".join(post["tags"]),
        "mainEntityOfPage": {"@type": "WebPage", "@id": page},
        "author": {"@type": "Organization", "name": "BrownHub", "url": SITE},
        "publisher": {"@type": "Organization", "name": "BrownHub",
                      "logo": {"@type": "ImageObject", "url": SITE + "images/logo.png"}},
        "image": SITE + "images/og-image.jpg",
        "url": page,
    }, ensure_ascii=False, indent=1)


def heading_list(body_html):
    """(level, id, text) for every h2/h3 in an already-rendered post, for the contents rail."""
    return [(int(lvl), hid, re.sub(r"<[^>]+>", "", txt).strip())
            for lvl, hid, txt in re.findall(r'<h([23]) id="([^"]+)"[^>]*>(.*?)</h\1>',
                                            body_html, re.S)]


def tags_html(tags):
    # A tag names the subject of the note, and the note itself is English, so the chips
    # are marked out of the translation walk rather than given invented vocabulary.
    return "".join('<span class="chip chip--plain" data-i18n-off>%s</span>' % esc(t)
                   for t in tags)


def byline(post):
    """The line under a headline. Each word that has a dictionary entry stands alone in a
    <span>; the date, the number and the separators are opted out, so a translation never
    has to carry a whole sentence to move one word inside it."""
    return ('<span>Published</span> <time datetime="%s" data-i18n-off>%s</time>'
            ' · <span data-i18n-off>%d</span> <span>min read</span>'
            % (post["date"], date_label(post["date"]), post["read"]))


def card(post, root):
    """One note on a shelf. The whole card is the link, so there is nothing to miss."""
    return ('      <article class="card jcard">\n'
            '        <a class="jcard__hit" href="%sblog/%s.html">\n'
            '          <h3>%s</h3>\n'
            '          <p class="jcard__meta"><time datetime="%s" data-i18n-off>%s</time>'
            ' · <span data-i18n-off>%d</span> <span>min read</span></p>\n'
            '          <p class="jcard__desc">%s</p>\n'
            '          <p class="jcard__tags" data-i18n-off>%s</p>\n'
            '        </a>\n      </article>\n'
            % (root, post["slug"], esc(post["title"]), post["date"],
               date_label(post["date"]), post["read"], esc(post["desc"]),
               tags_html(post["tags"])))


def index_page(posts):
    # The index lives inside blog/, so every path it writes is one directory deep: the
    # cards reach their posts by coming back up and going down again, which is how the
    # address reads /blog/print-ready.html rather than /blog/blog/print-ready.html.
    cards = "".join(card(p, "../") for p in posts)
    main = """<main>
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow">Journal</p>
        <h1>What the studio has worked out</h1>
        <p>Notes on getting design right: what a file needs before it goes to a printer,
        how a brief stops a job, what carrying forty languages costs, and how long a logo
        really takes. Written by whoever did the work.</p>
        <p class="jlead" data-i18n-off>%d notes · last one %s</p>
      </div>
    </section>

    <section class="section journal" id="journal-all" aria-label="All journal notes">
      <div class="container">
        <div class="cards cards--2 jgrid">
%s        </div>
      </div>
    </section>

    <section class="section section--alt jask" id="journal-ask">
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
  </main>""" % (len(posts), date_label(posts[0]["date"]), cards)

    graph = ('{\n "@context": "https://schema.org",\n "@graph": [\n'
             '  {\n   "@type": "CollectionPage",\n   "@id": "%sblog/",\n'
             '   "url": "%sblog/",\n   "name": "BrownHub Journal",\n'
             '   "description": "Notes on design, print and the web from BrownHub in Accra.",\n'
             '   "isPartOf": {"@type": "WebSite", "@id": "%s", "name": "BrownHub", "url": "%s"},\n'
             '   "hasPart": [\n%s\n   ]\n  }\n ]\n}\n'
             % (SITE, SITE, SITE, SITE,
                ",\n".join("   " + ld_post(p).replace("\n", "\n   ") for p in posts)))
    out = shell("blog/",
                "BrownHub Journal — notes on design, print and websites from Accra",
                "Notes from a design studio in Accra: what a print-ready file is, how to "
                "brief a flyer, how long a logo really takes, and what carrying forty "
                "languages costs.").replace(MARK, main)
    return out.replace("</head>", jsonld(graph) + "</head>")


def moved_page():
    """blog.html is the address the site already printed: the footer of every page, the
    search index, the mega panel, the sitemap and the feed. It cannot simply 404, so it
    answers with a redirect instead and hands its place to /blog/, where the index now
    lives.

    The move is a meta refresh rather than a script: the site's content policy allows only
    its own files to run, so an inline redirect would be blocked before it started."""
    main = """<main>
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow">Journal</p>
        <h1>The studio journal has a shorter address</h1>
        <p>It is at <a href="/blog/">brownhub283.com/blog</a>. This page moves you there;
        if it does not, use that link.</p>
      </div>
    </section>
  </main>"""
    out = shell("blog.html",
                "BrownHub Journal — notes on design, print and websites from Accra",
                "Notes from a design studio in Accra: what a print-ready file is, how to "
                "brief a flyer, how long a logo really takes, and what carrying forty "
                "languages costs.").replace(MARK, main)
    # One index for the same notes: the canonical names /blog/ and this page asks to be
    # left out of the results, while `follow` lets its links keep passing weight to them.
    out = out.replace('<link rel="canonical" href="%sblog.html">' % SITE,
                      '<link rel="canonical" href="%sblog/">' % SITE)
    out = out.replace('<meta property="og:url" content="%sblog.html">' % SITE,
                      '<meta property="og:url" content="%sblog/">' % SITE)
    return out.replace("</head>",
                       '  <meta http-equiv="refresh" content="0;url=/blog/">\n'
                       '  <meta name="robots" content="noindex,follow">\n'
                       "</head>")


def post_page(post, posts):
    others = [p for p in posts if p["slug"] != post["slug"]][:3]
    rail = ""
    heads = heading_list(post["body"])
    if heads:
        rail = ('      <nav class="legal__nav" aria-label="On this page">\n'
                '        <h2>On this page</h2>\n        <ul>\n'
                + "".join('          <li%s><a href="#%s">%s</a></li>\n'
                          % (' class="jtoc__sub"' if lvl == 3 else "", hid, esc(txt))
                          for lvl, hid, txt in heads)
                + "        </ul>\n      </nav>\n")
    more = "".join(card(p, "../") for p in others)
    main = """<main>
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow"><a href="./">Journal</a></p>
        <h1>%s</h1>
        <p>%s</p>
        <p class="jlead">%s · %s</p>
      </div>
    </section>

    <div class="container legal-wrap jbody">
%s      <article class="legal journal__post">
%s
      </article>
    </div>

    <section class="section section--alt" id="journal-more" aria-label="More from the journal">
      <div class="container">
        <div class="section__head section__head--split">
          <h2>More from the journal</h2>
          <a href="./" class="card__link">All notes →</a>
        </div>
        <div class="cards cards--2 jgrid">
%s        </div>
      </div>
    </section>
  </main>""" % (esc(post["title"]), esc(post["desc"]), byline(post),
                tags_html(post["tags"]),
                rail, indent(post["body"]), more)

    out = shell("blog/" + post["slug"] + ".html", post["title"] + " — BrownHub Journal",
                post["desc"], type_="article", published=post["date"]).replace(MARK, main)
    return out.replace("</head>", jsonld(ld_post(post)) + "</head>")


def indent(text):
    return "\n".join("        " + ln if ln.strip() else ln for ln in text.splitlines())


def feed_page(posts):
    """feed.xml — RSS 2.0, so a reader can follow the studio without visiting it."""
    items = "".join('    <item>\n      <title>%s</title>\n      <link>%sblog/%s.html</link>\n'
                    '      <guid isPermaLink="true">%sblog/%s.html</guid>\n'
                    '      <pubDate>%s</pubDate>\n      <description>%s</description>\n%s'
                    '    </item>\n'
                    % (esc(p["title"]), SITE, p["slug"], SITE, p["slug"],
                       datetime.datetime.fromisoformat(p["date"] + "T09:00+00:00")
                       .strftime("%a, %d %b %Y %H:%M:%S +0000"), esc(p["desc"]),
                       "".join("      <category>%s</category>\n" % esc(t) for t in p["tags"]))
                    for p in posts)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n'
            '    <title>BrownHub Journal</title>\n    <link>%sblog/</link>\n'
            '    <description>Notes on design, print and the web from BrownHub, a graphic '
            'design and website studio in Accra, Ghana.</description>\n'
            '    <language>en</language>\n    <lastBuildDate>%s</lastBuildDate>\n'
            '    <atom:link href="%sfeed.xml" rel="self" type="application/rss+xml"/>\n'
            '%s  </channel>\n</rss>\n'
            % (SITE,
               datetime.datetime.fromisoformat(posts[0]["date"] + "T09:00+00:00")
               .strftime("%a, %d %b %Y %H:%M:%S +0000"), SITE, items))


if __name__ == "__main__":
    print("donor %s · head %d · header %d · footer %d" % (DONOR, len(HEAD), len(HEADER), len(FOOTER)))
    print("lifted:", re.findall(RELATIVE, lift(HEADER, "../"))[:6])
    print("root-absolute kept:", re.findall(r'href="(/[^"]+)"', lift(HEAD, "../")))
