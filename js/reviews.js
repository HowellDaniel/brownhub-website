/*
  Customer reviews. Everything in this band is read from data/reviews.json —
  the quotes are written by people who completed an order, and nothing here is
  invented by the page. With no approved entries the band says so and offers a
  way to submit one instead of showing placeholders.
  The JSON is a committed, reviewed file rather than user input, and every value
  is still escaped before it reaches the DOM.
*/
(() => {
  "use strict";
  const doc = document;
  const grid = doc.getElementById("reviews-grid");
  const empty = doc.getElementById("reviews-empty");
  const cta = doc.getElementById("reviews-cta");
  let current = [];
  const scoreEl = doc.getElementById("reviews-score");
  const avgEl = doc.getElementById("reviews-avg");
  const starsEl = doc.getElementById("reviews-stars");
  const countEl = doc.getElementById("reviews-count");
  if (!grid) return;

  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2l2.75 5.6 6.15.9-4.45 4.3 1.05 6.1L12 17.2l-5.5 2.9 1.05-6.1L3.1 9.7l6.15-.9L12 3.2Z"/></svg>';

  function stars(n) {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    let out = '<span class="review__stars" role="img" aria-label="' + v + " / 5\">";
    for (let i = 1; i <= 5; i++) out += '<span class="' + (i <= v ? "" : "stars--off") + '">' + STAR + "</span>";
    return out + "</span>";
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function card(r) {
    const who = [r.role, r.service, r.date].filter(Boolean).join(" · ");
    return '<article class="review">' +
      '<span class="review__mark" aria-hidden="true">&ldquo;</span>' +
      stars(r.rating) +
      '<blockquote class="review__quote">' + esc(r.quote) + "</blockquote>" +
      '<div class="review__who">' +
      '<span class="review__face" aria-hidden="true">' + esc(String(r.name).trim().charAt(0) || "“") + "</span>" +
      '<span class="review__lines">' +
      '<span class="review__name">' + esc(r.name) + "</span>" +
      (who ? '<span class="review__meta">' + esc(who) + "</span>" : "") +
      "</span></div></article>";
  }

  function render(list) {
    const items = Array.isArray(list) ? list.filter((r) => r && r.quote && r.name) : [];
    if (!items.length) {
      grid.innerHTML = "";
      grid.hidden = true;
      if (cta) cta.hidden = true;
      if (empty) empty.hidden = false;
      const band = doc.getElementById("reviews");
      if (band) band.classList.add("reviews-band--empty");
      return;
    }
    current = items;
    /* Unhide first: a hidden element has no layout, so building the wall while the
       grid is still shut would measure every column at zero height. */
    grid.hidden = false;
    if (empty) empty.hidden = true;
    if (cta) cta.hidden = false;
    build(items);
    score(items);
  }

  /* ── the wall ────────────────────────────────────────────────────────────────
     Quotes are handed out to the shortest column first, so a column of one-liners
     never sits beside a column of paragraphs, and each column keeps the order the
     owner put in the file. A column is duplicated only once it is known to be
     scrolling, because a static column of two copies reads as a mistake. */
  const SPEED = 24;                 // pixels a second, so every column drifts alike
  const FACTOR = [1, 0.8, 1.28];    // the middle column runs the other way, a little slower
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function columnCount() {
    if (matchMedia("(min-width:901px)").matches) return 3;
    return matchMedia("(min-width:641px)").matches ? 2 : 1;
  }

  function build(items) {
    const n = columnCount();
    const cols = [];
    const h = [];
    for (let i = 0; i < n; i++) { cols.push([]); h.push(0); }
    items.forEach((r) => {
      let pick = 0;
      for (let i = 1; i < n; i++) if (h[i] < h[pick]) pick = i;
      cols[pick].push(r);
      h[pick] += String(r.quote).length + 40;
    });
    grid.innerHTML = cols.map((c) =>
      '<div class="tst__col"><div class="tst__track"><div class="tst__copy">' +
      c.map(card).join("") + "</div></div></div>").join("");
    grid.classList.remove("tst--live");
    measure();
  }

  function measure() {
    const live = matchMedia("(min-width:641px)").matches && !reduced();
    /* The columns only take their wall height once the class is on, so measuring
       happens against the same clamp the animation will scroll inside. */
    grid.classList.add("tst--measuring");
    let any = false;
    Array.prototype.forEach.call(grid.children, (col, i) => {
      const track = col.querySelector(".tst__track");
      const copy = col.querySelector(".tst__copy");
      if (!track || !copy) return;
      Array.prototype.forEach.call(track.querySelectorAll(".tst__copy:not(:first-child)"),
        (n) => n.remove());
      const one = copy.getBoundingClientRect().height;
      if (!live || one < 1 || one < col.clientHeight * 1.12) return;
      const clone = copy.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("tst__copy--clone");
      track.appendChild(clone);
      track.style.setProperty("--tst-dur",
        ((one * 2) / (SPEED * (FACTOR[i % FACTOR.length] || 1))).toFixed(1) + "s");
      any = true;
    });
    grid.classList.remove("tst--measuring");
    grid.classList.toggle("tst--live", any);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!grid.hidden) build(current); }, 250);
  }, { passive: true });
  // the same quotes get longer in German and shorter in Chinese, so the wall is
  // re-cut whenever a language is applied over the page
  doc.addEventListener("i18n-applied", () => { if (!grid.hidden) measure(); });

  /* The headline number is the average of the stars clients actually left, so a
     band where nobody rated their job shows no score rather than a made-up one. */
  function score(items) {
    const rated = items.filter((r) => Number(r.rating) > 0);
    if (!rated.length || !scoreEl) return;
    const avg = rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length;
    avgEl.textContent = avg.toFixed(1);
    starsEl.innerHTML = stars(Math.round(avg));
    countEl.textContent = String(rated.length);
    scoreEl.hidden = false;
  }

  // no-cache: the owner adds entries by editing this file, and a returning
  // visitor should see a new review without a hard refresh. GitHub Pages
  // answers the revalidation with a 304, so it costs one conditional request.
  fetch("data/reviews.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => render(Array.isArray(d) ? d : d.reviews))
    .catch(() => render([]));

  /* The client wall is the same promise in another shape: a name appears here only
     because the client allowed it, so an empty file leaves the band shut rather than
     filling it with companies we have never met. */
  const wall = doc.getElementById("companies");
  const wallItems = doc.getElementById("companies-items");
  if (wall && wallItems) {
    fetch("data/companies.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = (Array.isArray(d) ? d : (d && d.companies) || []).filter((c) => c && c.name);
        if (!list.length) return;
        wallItems.innerHTML = list.map((c) =>
          '<div class="company"><strong>' + esc(c.name) + "</strong>" +
          (c.sector ? "<span>" + esc(c.sector) + "</span>" : "") + "</div>").join("");
        wall.hidden = false;
        if (window.BROWNHUB_FLOW) window.BROWNHUB_FLOW.refresh();
      })
      .catch(() => {});
  }
})();
