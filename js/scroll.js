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
    ".contact-info__card, .catalog-cta, .filter, .cta__inner, .page-hero p, .legal > *, .review, .reviews-empty";
  const DRIFT = [[".hero__orb", -46], [".hero__card", -20], [".shot img", -30], [".product-card img", -22],
    [".exp__card img", -26]];

  /* ---------- nav: condense + scroll-progress hairline ---------- */
  const header = doc.querySelector(".site-header");
  const bar = doc.createElement("span");
  bar.className = "nav__progress";
  bar.setAttribute("aria-hidden", "true");
  if (header) header.appendChild(bar);
  const measureNav = () => root.style.setProperty("--nav-h", Math.round(header.getBoundingClientRect().height) + "px");

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

  function scan() {
    doc.querySelectorAll(FRAMES).forEach((el) => tag(el, "frame"));
    doc.querySelectorAll(RISES).forEach((el) => tag(el, "rise"));
    io.takeRecords();
    doc.querySelectorAll("[data-rv]:not(.is-in)").forEach((el) => {
      if (!el.dataset.watched) { el.dataset.watched = "1"; io.observe(el); }
    });
  }

  /* ---------- parallax inside each frame ---------- */
  const drift = [];
  function collectDrift() {
    drift.length = 0;
    if (still) return;
    DRIFT.forEach(([sel, amp]) => doc.querySelectorAll(sel).forEach((el, i) =>
      drift.push({ el, amp: sel === ".hero__card" && i % 2 ? -amp : amp })));
  }
  function applyDrift() {
    const vh = innerHeight;
    for (const d of drift) {
      const r = d.el.getBoundingClientRect();
      if (r.bottom < -240 || r.top > vh + 240) continue;
      d.el.style.setProperty("--py", (((r.top + r.height / 2) - vh / 2) / vh * d.amp).toFixed(1) + "px");
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
      const label = doc.createElement("span");
      label.className = "story-rail__label";
      label.textContent = o.h.textContent;
      b.append(dot, label);
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
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = scrollY;
      if (header) header.classList.toggle("is-scrolled", y > 24);
      const span = doc.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.setProperty("--p", span > 0 ? Math.min(y / span, 1).toFixed(4) : 0);
      applyDrift();
    });
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { measureNav(); wireFooter(); onScroll(); }, { passive: true });

  measureNav();
  scan();
  buildRail();
  wireFooter();
  onScroll();

  /* Late nodes: filtered portfolio tiles, catalog and store cards, translated text. */
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan();
      collectDrift();
      syncRailLabels();
      applyDrift();
    });
  }).observe(doc.body, { childList: true, subtree: true });

  if (still) doc.querySelectorAll("[data-rv]").forEach((el) => el.classList.add("is-in"));
  addEventListener("load", () => { measureNav(); scan(); collectDrift(); onScroll(); }, { once: true });
})();
