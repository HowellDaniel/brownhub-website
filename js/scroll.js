/*
  Page choreography in the twilio.com idiom: a nav that condenses as you scroll,
  staggered block reveals, curtain-reveal photos that parallax inside their frame,
  a diamond section rail, and an accordion footer.
  Presentational only — with scripting off the page renders exactly as before.
*/
(() => {
  "use strict";
  const doc = document, root = doc.documentElement;
  if (!("IntersectionObserver" in window)) return;
  root.classList.add("js-scroll");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FRAMES = ".shot, .product-card, .map-card, .exp__card";
  const RISES = ".section__head, .stats__item, .card, .feature, .step, .panel, .split > div, " +
    ".contact-info__card, .catalog-cta, .filter, .cta__inner, .page-hero p, .legal > *, .review, .reviews-empty, .kpi, .tl";
  const DRIFT = [[".hero__orb", -46], [".hero__card", -20], [".shot img", -30], [".product-card img", -22],
    [".exp__card img", -26], [".pstory__visual img", -26]];

  /* ---------- nav: condense + scroll-progress hairline ---------- */
  const header = doc.querySelector(".site-header");
  const bar = doc.createElement("span");
  bar.className = "nav__progress";
  bar.setAttribute("aria-hidden", "true");
  if (header) header.appendChild(bar);
  /* The bar is not one height: the row condenses over .3s and the strip above it
     collapses over .45s, so the value taken at page load is stale by a whole
     header by the time the first band is read. Everything that parks itself under
     the nav — the catalog readout, the drawer, the sticky rails, an anchor jump —
     reads this var, so it is kept on the real geometry instead of guessed. */
  let navH = 0;
  const measureNav = () => {
    if (!header) return;
    const h = Math.round(header.getBoundingClientRect().height);
    if (h === navH) return;
    navH = h;
    root.style.setProperty("--nav-h", h + "px");
  };
  if (header && typeof ResizeObserver === "function") new ResizeObserver(measureNav).observe(header);

  /* ---------- reveal tagging ---------- */
  const tagged = new WeakSet();
  function tag(el, kind) {
    if (tagged.has(el) || !el.parentElement) return;
    tagged.add(el);
    el.dataset.rv = kind;
    let i = 0;
    for (const sib of el.parentElement.children) if (sib.dataset && sib.dataset.rv) i++;
    el.style.setProperty("--rv-i", Math.min(i - 1, 7));
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });

  /* A frame plays its clip while it is on screen, not once on first sight: the
     loop used to hang off :hover, which no touch device ever gives it. */
  const play = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("is-view", e.isIntersecting);
  }, { rootMargin: "120px 0px", threshold: 0.05 });

  /* A late node only needs the pass over itself, not over the whole document. */
  function find(roots, sel) {
    if (!roots) return doc.querySelectorAll(sel);
    const out = [];
    for (const n of roots) {
      if (!n.matches) continue;
      if (n.matches(sel)) out.push(n);
      const inner = n.querySelectorAll(sel);
      for (let i = 0; i < inner.length; i++) out.push(inner[i]);
    }
    return out;
  }

  function scan(roots) {
    find(roots, FRAMES).forEach((el) => {
      tag(el, "frame");
      if (!el.dataset.playwatched) { el.dataset.playwatched = "1"; play.observe(el); }
    });
    find(roots, RISES).forEach((el) => tag(el, "rise"));
    io.takeRecords();
    find(roots, "[data-rv]:not(.is-in)").forEach((el) => {
      if (!el.dataset.watched) { el.dataset.watched = "1"; io.observe(el); }
    });
  }

  /* ---------- parallax inside each frame ---------- */
  /* A frame's distance from the top of the document is measured when it is
     collected, not on every scroll event. Reading a rect per element inside the
     scroll loop forced a layout flush ~80 times a frame — the profiler showed it
     as the heaviest script on the page. Anything that can actually move a frame
     (an image arriving, a translation reflowing a block, a resize, new cards)
     invalidates the measurement instead.

     A read does not cost itself, it costs every write that came before it, so the
     size of an invalidation matters as much as how often it happens. One picture
     arriving moves one frame and is measured on the spot; a resize or a language
     swap moves all eighty, and that walk is taken sixteen elements at a time so
     the frames it lands on are charged a slice rather than the whole document. */
  const drift = [];
  const byElement = new Map();
  const BATCH = 16;
  let stale = true, at = 0;
  function measure(d) {
    const r = d.el.getBoundingClientRect();
    d.abs = r.top + scrollY;
    d.h = r.height;
  }
  function measureDrift() {
    if (!drift.length) { stale = false; at = 0; return; }
    /* A slot already measured is passed over for free, so a walk woken by one new
       picture costs that picture and nothing else. The cap counts reads, not slots. */
    let reads = 0;
    while (at < drift.length && reads < BATCH) {
      const d = drift[at++];
      if (Number.isNaN(d.abs)) { measure(d); reads++; }
    }
    if (at < drift.length) return;
    drift.sort((a, b) => a.abs - b.abs);
    stale = false;
    at = 0;
  }
  function invalidateAll() {
    stale = true;
    at = 0;
    for (const d of drift) d.abs = NaN;
  }
  /* The pass over the selectors keeps the rows it already has, in the order the last
     walk left them, and appends whatever is new. Rebuilding in selection order instead
     would silently unsort the list, and the early exit in the paint below leans on
     that sort. Any change to the set moves the document under the frames that stayed,
     so it is the whole list that is dropped rather than the one card. */
  let pass = 0;
  function collectDrift() {
    if (still) { drift.length = 0; byElement.clear(); return; }
    pass++;
    let changed = false;
    DRIFT.forEach(([sel, amp]) => doc.querySelectorAll(sel).forEach((el, i) => {
      const flip = sel === ".hero__card" && i % 2 ? -amp : amp;
      const d = byElement.get(el);
      if (d) { d.amp = flip; d.live = pass; return; }
      const fresh = { el, amp: flip, abs: NaN, h: 0, py: "", live: pass };
      drift.push(fresh);
      byElement.set(el, fresh);
      changed = true;
    }));
    let n = 0;
    for (let i = 0; i < drift.length; i++) {
      const d = drift[i];
      if (d.live !== pass) { changed = true; byElement.delete(d.el); continue; }
      drift[n++] = d;
    }
    drift.length = n;
    if (changed) invalidateAll();
  }
  function applyDrift() {
    if (!drift.length) return;
    if (stale) measureDrift();
    const vh = innerHeight, y = scrollY;
    const from = y - 240, to = y + vh + 240;
    for (const d of drift) {
      if (Number.isNaN(d.abs)) continue;      /* waiting for its turn in the walk */
      if (d.abs + d.h < from) continue;
      if (d.abs > to) {
        /* The early exit is a property of the sorted list, and the list is only
           sorted once a walk has finished. */
        if (!stale) break;
        continue;
      }
      const py = (((d.abs + d.h / 2 - y) - vh / 2) / vh * d.amp).toFixed(1) + "px";
      if (py === d.py) continue;           /* a still frame writes nothing at all */
      d.py = py;
      d.el.style.setProperty("--py", py);
    }
  }

  /* ---------- diamond rail that tracks the section in view ---------- */
  const rail = doc.createElement("nav");
  rail.className = "story-rail";
  rail.setAttribute("aria-label", "Page sections");
  function buildRail() {
    const heads = [...doc.querySelectorAll("main > section")]
      .map((s) => ({ s, h: s.querySelector("h2") })).filter((o) => o.h);
    if (heads.length < 3) return;
    heads.forEach((o, i) => {
      if (!o.s.id) o.s.id = "section-" + (i + 1);
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "story-rail__btn";
      b.dataset.for = o.s.id;
      const dot = doc.createElement("span");
      dot.className = "story-rail__dot";
      dot.setAttribute("aria-hidden", "true");
      /* The lit stone carries a badge, the same read as the pinned story's rail.
         It hangs off the button rather than the stone so that neither the stone's
         45° turn nor its grow reaches the glyph. */
      const icon = doc.createElement("span");
      icon.className = "story-rail__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
      const label = doc.createElement("span");
      label.className = "story-rail__label";
      label.textContent = o.h.textContent;
      b.append(dot, icon, label);
      b.addEventListener("click", () => o.s.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }));
      rail.appendChild(b);
    });
    doc.body.appendChild(rail);
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const btn = rail.querySelector('[data-for="' + e.target.id + '"]');
        if (btn && e.isIntersecting) {
          rail.querySelectorAll(".story-rail__btn").forEach((x) => x.removeAttribute("data-active"));
          btn.setAttribute("data-active", "true");
        }
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    heads.forEach((o) => spy.observe(o.s));
  }
  /* Translation rewrites the h2 text after this runs, so labels are refreshed with it. */
  function syncRailLabels() {
    rail.querySelectorAll(".story-rail__btn").forEach((b) => {
      const h = doc.getElementById(b.dataset.for);
      const head = h && h.querySelector("h2");
      if (head) b.querySelector(".story-rail__label").textContent = head.textContent;
    });
  }

  /* ---------- footer columns fold into +/- accordions on small screens ---------- */
  const small = matchMedia("(max-width:720px)");
  function wireFooter() {
    doc.querySelectorAll(".footer__grid > div").forEach((col, i) => {
      const h = col.querySelector("h4"), list = col.querySelector("ul");
      if (!h || !list) return;
      if (!h.dataset.wired) {
        h.dataset.wired = "1";
        list.id = list.id || "footer-list-" + i;
        h.setAttribute("role", "button");
        h.tabIndex = 0;
        h.setAttribute("aria-controls", list.id);
        const flip = () => setOpen(col, small.matches ? col.dataset.open !== "true" : true);
        h.addEventListener("click", flip);
        h.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
        });
      }
      setOpen(col, !small.matches);
    });
  }
  function setOpen(col, open) {
    const list = col.querySelector("ul");
    col.dataset.open = open ? "true" : "false";
    col.querySelector("h4").setAttribute("aria-expanded", open ? "true" : "false");
    if (!small.matches) { list.style.maxHeight = ""; return; }
    if (open) {
      list.style.maxHeight = list.scrollHeight + "px";
      list.addEventListener("transitionend", () => { if (col.dataset.open === "true") list.style.maxHeight = "none"; }, { once: true });
    } else {
      list.style.maxHeight = list.scrollHeight + "px";
      requestAnimationFrame(() => { list.style.maxHeight = "0px"; });
    }
  }

  /* ---------- one rAF-gated scroll loop ---------- */
  let queued = false, span = 0, spanAt = 0, condensed = null;

  /* A frosted layer is not charged per layer, it is charged per frame. The ablation that
     found this took the whole site's glass off at once and every long frame went away;
     then it took the biggest one off, then the moving ones, then the fixed ones — and
     none of those changed the count. One backdrop-filter anywhere over the surface being
     scrolled is enough to cost the viewport its re-raster, so the only saving is all of
     it at once, and the only safe moment for that is while the page is actually moving.
     The glass is lifted for the length of a gesture and put back once the page settles:
     nobody reads a backdrop that is flying past, and the frost is waiting for the frame
     they stop on. */
  let flying = false, settle = 0;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = scrollY;
      /* Reads before writes, so nothing we queue here has to be settled to answer them.
         The walk itself is a slice of at most BATCH reads, so a woken list cannot spend
         a frame the way one global flag used to. */
      if (stale) measureDrift();
      /* The page can change height without loading anything — a band collapses, a panel
         closes — and a stale span then parks the hairline below full. That read is a layout
         flush, so it is asked for twice a second at most rather than every frame. */
      if (Date.now() - spanAt > 500) { spanAt = Date.now(); span = root.scrollHeight - innerHeight; }
      if (condensed !== (y > 24)) { condensed = y > 24; if (header) header.classList.toggle("is-scrolled", condensed); }
      if (bar) bar.style.setProperty("--p", span > 0 ? Math.min(y / span, 1).toFixed(4) : 0);
      applyDrift();
      /* Last, because the class is a write: the recalc it asks for belongs to the next
         frame, not to the one whose reads are only just answered. */
      if (!flying) { flying = true; root.classList.add("is-flying"); }
      clearTimeout(settle);
      settle = setTimeout(() => { flying = false; root.classList.remove("is-flying"); }, 240);
    });
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { measureNav(); wireFooter(); invalidateAll(); onScroll(); }, { passive: true });
  /* Images do not bubble their load, so capture it at the document. One picture that
     arrives settles into the space the page already carved for it, so it moves only
     itself: charge that single read now and leave the other seventy-nine alone. */
  doc.addEventListener("load", (e) => {
    const d = byElement.get(e.target);
    if (!d) return;
    /* Mid-walk the list is not yet in document order, so the only safe answer is to
       hand the row back to the walk and let it reach its own turn. */
    if (stale) { d.abs = NaN; at = 0; return; }
    measure(d);
    /* A picture that arrives can only push down, never up: the rows above it keep
       their measured places and just the tail is dropped. */
    const i = drift.indexOf(d);
    for (let k = i + 1; k < drift.length; k++) drift[k].abs = NaN;
    at = i + 1;
    stale = true;
  }, true);
  addEventListener("i18n-applied", invalidateAll);

  measureNav();
  scan();
  buildRail();
  wireFooter();
  onScroll();

  /* Late nodes: filtered portfolio tiles, catalog and store cards, translated text. */
  let pending = false;
  new MutationObserver((muts) => {
    /* Only an inserted *element* needs the pass. The translator rewrites the text of
       hundreds of nodes, each one a childList mutation, and re-scanning the whole
       document for a changed word was costing more than the parallax it fed. */
    let added = null;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (!added) added = [];
        added.push(n);
      }
    }
    if (!added || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan(added);
      collectDrift();
      syncRailLabels();
      applyDrift();
    });
  }).observe(doc.body, { childList: true, subtree: true });

  if (still) doc.querySelectorAll("[data-rv]").forEach((el) => el.classList.add("is-in"));
  addEventListener("load", () => { measureNav(); scan(); collectDrift(); onScroll(); }, { once: true });
})();
