/*
  The studio journal, on the home page.

  Every card here is read from data/posts.json, which tools/blog.py writes from the
  markdown in blog/posts/. Adding a note is a markdown file and one generator run; this
  page is never edited for it. The band already carries a static card pointing at the
  archive, so a visitor with scripting off, a first paint before the fetch lands, or a
  build with no notes yet all see the same sensible thing: a way into the journal.

  The JSON is a committed, reviewed file rather than user input, and every value is
  still escaped before it reaches the DOM.
*/
(() => {
  "use strict";
  const doc = document;
  const grid = doc.getElementById("journal-items");
  if (!grid) return;

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Hrefs are built relative to the page, and the page that hosts this band is the one
     at the top of the tree today. The wordmark knows where the root really is, so the
     links stay right wherever the band is carried next. */
  const logo = doc.querySelector(".nav__logo");
  const ROOT = logo ? new URL(".", new URL(logo.getAttribute("href"), doc.baseURI)).href : "";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function dateLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1] : String(iso);
  }

  function card(p) {
    return '<article class="card jcard"><a class="jcard__hit" href="' +
      esc(ROOT + "blog/" + p.slug + ".html") + '">' +
      "<h3>" + esc(p.title) + "</h3>" +
      '<p class="jcard__meta"><time datetime="' + esc(p.date) + '" data-i18n-off>' +
      esc(dateLabel(p.date)) + "</time>" +
      ' · <span data-i18n-off>' + esc(p.read) + "</span> <span>min read</span></p>" +
      '<p class="jcard__desc">' + esc(p.desc) + "</p>" +
      '<p class="jcard__tags" data-i18n-off>' +
      (p.tags || []).map((t) => '<span class="chip chip--plain">' + esc(t) + "</span>").join("") +
      "</p></a></article>";
  }

  function start() {
    fetch(ROOT + "data/posts.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        const posts = (d && d.posts) || [];
        if (!posts.length) return;
        grid.innerHTML = posts.slice(0, 3).map(card).join("");
      })
      .catch(() => { /* the static card is already the right answer */ });
  }

  /* Below the fold, so it waits for the page to stop being busy rather than joining
     the boot. The phone's first paint never pays for this fetch. */
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 2500 });
  else window.setTimeout(start, 1200);
})();
