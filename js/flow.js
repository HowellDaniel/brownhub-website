/*
  Auto-flowing rails: the catalog items and the client wall drift from right to
  left on their own, the way twilio's proof bands do.

  All this file does is measure and pad the track, and hand the off-screen frames
  their pictures back when the rail is being looked at; the movement, the pause on
  hover and the reduced-motion fallback live in CSS. One copy of the cards is a loop's
  period, so the shift is published in pixels (--flow-shift) instead of a fixed
  half-width, and the cards are cloned until a full period of content is left on
  screen at the moment the track wraps. Duration follows distance, so a long rail
  and a short one travel at the same speed rather than the long one sprinting.
*/
(() => {
  "use strict";
  const PX_PER_SECOND = 44;
  const MAX_COPIES = 6;
  const FOCUSABLE = "a[href], button, input, select, textarea, summary, [tabindex]";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /*
    A rail is a row of twenty-six pictures and a phone reads two of them at a time.
    Blink measures a lazy picture against the document's screenfuls, not against what
    the clipping box lets a visitor actually look at, so a sideways row inside an
    overflow:hidden band asks for every frame in it the moment the page settles: 2.0MB
    at once, on the same pipe the hero, the stylesheet and the scripts are still
    fighting over, and holding the window's load event open fourteen seconds after the
    last of them arrived. The frames therefore come up in the markup without a src, and
    this hands each one back on two conditions: the rail is on the screen, and the frame
    is near the window the rail shows. A visitor with scripting off keeps the first few
    pictures, which are the ones the rail opens on, and the row never moves for them
    anyway.
  */
  const gates = new WeakMap();

  function parkedNodes(items) {
    return Array.prototype.slice.call(items.querySelectorAll("img[data-src]"));
  }

  function fill(img) {
    const url = img.getAttribute("data-src");
    if (!url) return;
    img.removeAttribute("data-src");
    img.src = url;
  }

  /* A card and its duplicate ask for the same picture. Handing it back to both in the
     same beat spends one request on it instead of two a whole loop apart. */
  function handBack(rail, url) {
    parkedNodes(rail).forEach((img) => {
      if (img.getAttribute("data-src") === url) fill(img);
    });
  }

  /*
    A moving rail cannot be watched with an observer. Blink answers an IntersectionObserver
    from a layout pass, and a track that travels by a CSS transform animation never
    re-lays itself out: rooted on the rail it duly reports the two frames on screen when
    the page settles, then goes silent for the rest of the loop — measured, 44 parked
    frames through a full scroll pass. So a live rail is scheduled off its own clock
    instead. The track moves at PX_PER_SECOND, so the wait before a frame reaches the
    window the rail shows is its distance from that window divided by the speed, and the
    distance is read rather than guessed so a wrap, a resize or a new language cannot
    drift the plan.
  */
  const AHEAD = 1.5; // rail-widths of frames to keep in hand before they arrive
  const LEAD = "0px 250% 0px 250%"; // the same idea, in rootMargins, for a rail that does not move

  function sweep(g) {
    g.at = undefined;
    const rail = g.rail, items = g.items;
    const parked = parkedNodes(items);
    if (!parked.length || !g.watching) return;
    const box = rail.getBoundingClientRect();
    const lead = rail.clientWidth * AHEAD;
    /* Which edge a frame comes in at belongs to the animation, not to this file: a
       right-to-left page runs the track the other way round. */
    const fromRight = getComputedStyle(items).animationName !== "flow-right";
    let next = Infinity;
    parked.forEach((img) => {
      const card = img.closest(".flow__card") || img;
      const r = card.getBoundingClientRect();
      const away = fromRight ? r.left - box.right : box.left - r.right;
      if (away <= lead) handBack(rail, img.getAttribute("data-src"));
      else if (away - lead < next) next = away - lead;
    });
    if (g.at !== undefined || next === Infinity) return;
    g.at = setTimeout(() => sweep(g), Math.max(500, (next / PX_PER_SECOND) * 1000));
  }

  /* The watched set is rebuilt after every answer rather than trusted: taking a src
     takes the frame's data-src with it, and a resize or a change of language throws the
     whole set of duplicates away and grows another one. */
  function track(g) {
    g.seen.forEach((img) => {
      if (img.isConnected && img.hasAttribute("data-src")) return;
      g.inner.unobserve(img);
      g.seen.delete(img);
    });
    parkedNodes(g.items).forEach((img) => {
      if (g.seen.has(img)) return;
      g.inner.observe(img);
      g.seen.add(img);
    });
  }

  /* A rail that is not moving — reduced motion, or a wall too short to loop — is dragged
     by a finger, and that does reach the observer. It is watched the ordinary way. A row
     that neither moves nor scrolls shows all of itself or none of it, and the set is small
     enough by definition that handing every frame back is cheaper than keeping a plate on
     the screen for a visitor who has no way to reach the rest. */
  function watch(g) {
    if (g.live) {
      if (g.inner) { g.inner.disconnect(); g.inner = null; g.seen.clear(); }
      if (g.at === undefined) sweep(g);
      return;
    }
    if (g.at !== undefined) { clearTimeout(g.at); g.at = undefined; }
    if (getComputedStyle(g.rail).overflowX !== "auto") {
      parkedNodes(g.items).forEach(fill);
      return;
    }
    if (!g.inner) {
      g.inner = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) fill(en.target); });
        track(g);
      }, { root: g.rail, rootMargin: LEAD, threshold: 0 });
    }
    track(g);
  }

  /* Away from the screen the rail keeps nothing at all: a hundred frames standing by off
     the edge of a phone is not worth paying for on every frame of the scroll. */
  function stop(g) {
    g.watching = false;
    if (g.at !== undefined) { clearTimeout(g.at); g.at = undefined; }
    if (!g.inner) return;
    g.inner.disconnect();
    g.inner = null;
    g.seen.clear();
  }

  function gate(rail, items, live) {
    if (typeof IntersectionObserver !== "function") {
      parkedNodes(items).forEach(fill);
      return;
    }
    let g = gates.get(rail);
    if (!g) {
      g = { rail, items, live, watching: false, inner: null, seen: new Set(), at: undefined };
      gates.set(rail, g);
      g.outer = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) { stop(g); return; }
        g.watching = true;
        watch(g);
      }, { rootMargin: "80% 0px 80% 0px", threshold: 0 });
      g.outer.observe(rail);
    }
    g.items = items;
    g.live = live;
    if (g.watching) watch(g);
  }

  const rails = Array.prototype.slice.call(document.querySelectorAll(".flow"));
  if (!rails.length) return;

  function prepare(rail) {
    const items = rail.querySelector(".flow__items");
    if (!items) return;
    /* The first pass fixes what one copy is: everything loaded in the markup, in
       order. Clones are appended after it and stripped back to that length each
       time, so a re-measure can never mistake its own padding for content. */
    if (!items.dataset.srcCount) {
      if (!items.children.length) return;
      items.dataset.srcCount = String(items.children.length);
    }
    const count = Number(items.dataset.srcCount);
    while (items.children.length > count) items.lastElementChild.remove();
    const src = Array.prototype.slice.call(items.children);
    if (!src.length) return;

    const one = src.reduce((w, n) => w + n.getBoundingClientRect().width, 0) +
      (parseFloat(getComputedStyle(items).columnGap) || 0) * (src.length - 1);
    if (one < 1) return;

    const copies = Math.min(MAX_COPIES, Math.ceil(rail.clientWidth / one) + 1);
    for (let c = 1; c < copies; c++) {
      src.forEach((n) => {
        const clone = n.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        /* aria-hidden must not wrap a tab stop: a keyboard visitor would land on an
           invisible duplicate and get nothing in return. CSS already seals the
           duplicates off from the pointer; this seals them off from Tab as well. */
        [clone].concat(Array.prototype.slice.call(clone.querySelectorAll(FOCUSABLE)))
          .forEach((f) => { f.tabIndex = -1; });
        items.appendChild(clone);
      });
    }

    /* A wall too short to fill the screen even when repeated would only jitter, so
       it stays a plain row instead. */
    const live = copies >= 2 && one >= rail.clientWidth * 0.6 && !reduced();
    rail.classList.toggle("flow--live", live);
    rail.style.setProperty("--flow-shift", Math.round(one) + "px");
    rail.style.setProperty("--flow-dur", (one / PX_PER_SECOND).toFixed(1) + "s");
    gate(rail, items, live);
  }

  rails.forEach((rail) => {
    prepare(rail);
    /* A finger that lands on the rail holds it: hover cannot be relied on there,
       and the cards must stay put long enough to tap one. */
    rail.addEventListener("pointerdown", () => rail.classList.add("is-held"));
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
      rail.addEventListener(ev, () => rail.classList.remove("is-held")));
  });

  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => rails.forEach(prepare), 250);
  }, { passive: true });

  // A rail filled after page load (the client wall arrives by fetch) is measured
  // by its renderer asking for a refresh rather than knowing any of this.
  window.BROWNHUB_FLOW = { refresh: () => rails.forEach(prepare) };

  // Card labels change width when the page is re-applied in another language.
  document.addEventListener("i18n-applied", () => rails.forEach(prepare));
})();
