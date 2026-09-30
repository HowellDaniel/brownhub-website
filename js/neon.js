/* Catalog neon.
   The product-card shapes answer the pointer: a light follows the cursor as it
   moves around the grid and rides the nearest edge of every card within reach, so
   a shape begins to glow before the cursor ever lands on it. When nobody is
   pointing, a band travels the outline of each card on its own, staggered so the
   grid never pulses in lockstep. Both layers are painted by the card's own pseudo
   elements (see the CATALOG NEON block in css/style.css), so no node is inserted
   and the card markup is untouched. js/neon.js only writes --mx, --my and --lit. */
(function () {
  "use strict";

  var doc = document;
  var REACH = 150;
  var cards = [];
  var queued = false;
  var px = -1e4;
  var py = -1e4;
  var fine = window.matchMedia("(hover:hover) and (pointer:fine)");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");

  function collect() {
    cards = Array.prototype.slice.call(doc.querySelectorAll(".product-card"));
    cards.forEach(function (card, i) {
      if (card.dataset.neon) return;
      card.dataset.neon = "1";
      card.style.setProperty("--bh-i", (-i * 0.43).toFixed(2) + "s");
    });
  }

  /* ---------- the idle band: only while the shape is on screen ---------- */
  var view = null;
  function watch() {
    // Every path into here goes through this gate: a visitor who asked for
    // stillness never gets the band, however it was reached.
    if (still.matches) return;
    if (!("IntersectionObserver" in window)) {
      cards.forEach(function (c) { c.classList.add("is-on"); });
      return;
    }
    if (view) view.disconnect();
    view = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        e.target.classList.toggle("is-on", e.isIntersecting && !doc.hidden);
      });
    }, { rootMargin: "90px 0px", threshold: 0.01 });
    cards.forEach(function (c) { view.observe(c); });
  }

  function paint() {
    queued = false;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.hidden || !c.classList.contains("is-on")) continue;
      var r = c.getBoundingClientRect();
      if (!r.width) continue;
      // The hotspot is the pointer clamped into the card, so a cursor in the gap
      // between two shapes lights both of their facing edges at once.
      var ex = Math.min(Math.max(px, r.left), r.right);
      var ey = Math.min(Math.max(py, r.top), r.bottom);
      var dx = px - ex;
      var dy = py - ey;
      var k = 1 - Math.sqrt(dx * dx + dy * dy) / REACH;
      if (k <= 0) {
        if (c.classList.contains("is-lit")) {
          c.classList.remove("is-lit");
          c.style.setProperty("--lit", "0");
        }
        continue;
      }
      c.style.setProperty("--mx", ((ex - r.left) / r.width * 100).toFixed(2) + "%");
      c.style.setProperty("--my", ((ey - r.top) / r.height * 100).toFixed(2) + "%");
      // smoothstep keeps the light off the hard cut-off at the edge of its reach
      c.style.setProperty("--lit", (k * k * (3 - 2 * k)).toFixed(3));
      c.classList.add("is-lit");
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  function onMove(e) {
    px = e.clientX;
    py = e.clientY;
    schedule();
  }

  function onLeave() {
    px = py = -1e4;
    schedule();
  }

  var wired = false;
  function setMode() {
    // A phone has no cursor to follow, and a visitor who asked for stillness gets
    // neither the travelling band nor the tracking light.
    var off = still.matches;
    if (wired && off) {
      doc.removeEventListener("pointermove", onMove);
      doc.removeEventListener("pointerdown", onMove);
      doc.removeEventListener("pointerleave", onLeave);
      removeEventListener("blur", onLeave);
      wired = false;
    }
    if (!wired && !off && fine.matches) {
      doc.addEventListener("pointermove", onMove, { passive: true });
      doc.addEventListener("pointerdown", onMove, { passive: true });
      doc.addEventListener("pointerleave", onLeave);
      addEventListener("blur", onLeave);
      wired = true;
    }
    if (off) {
      cards.forEach(function (c) {
        c.classList.remove("is-on", "is-lit");
        c.style.setProperty("--lit", "0");
      });
    } else {
      watch();
    }
  }

  var started = false;
  function start() {
    if (started) return;
    started = true;
    collect();
    setMode();
  }

  addEventListener("load", start, { once: true });
  if (doc.readyState !== "loading") start();

  // The catalog filter shows and hides cards, and translation rewrites the grid.
  // Nodes appear in bursts, so the sweep is rate-limited rather than per mutation.
  var lastSweep = 0;
  var sweepPending = false;
  function sweep() {
    lastSweep = Date.now();
    sweepPending = false;
    var before = cards.length;
    collect();
    if (cards.length !== before) watch();
    paint();
  }
  new MutationObserver(function () {
    if (sweepPending) return;
    var wait = Math.max(0, 400 - (Date.now() - lastSweep));
    if (!wait) { sweep(); return; }
    sweepPending = true;
    setTimeout(sweep, wait);
  }).observe(doc.body, { childList: true, subtree: true });

  // Rects move under a stationary cursor while the page scrolls or resizes.
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    cards.forEach(function (c) {
      if (doc.hidden) c.classList.remove("is-on");
    });
    if (!doc.hidden) watch();
  });
  [fine, still].forEach(function (mq) {
    if (mq.addEventListener) mq.addEventListener("change", setMode);
    else if (mq.addListener) mq.addListener(setMode);
  });
})();
