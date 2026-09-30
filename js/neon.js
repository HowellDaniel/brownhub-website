/* Catalog neon.
   A band travels the outline of each product-card shape, staggered across the grid
   so the cards never pulse in lockstep. The painting itself is all CSS (see the
   CATALOG NEON block in css/style.css); this file only decides which cards are on.
   A card animates while it is on screen and nothing at all when it is not, and a
   visitor who asked for stillness never gets the band, however they got here. */
(function () {
  "use strict";

  var doc = document;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  var cards = [];
  var view = null;

  function collect() {
    cards = Array.prototype.slice.call(doc.querySelectorAll(".product-card"));
    cards.forEach(function (card, i) {
      if (card.dataset.neon) return;
      card.dataset.neon = "1";
      card.style.setProperty("--bh-i", (-i * 0.43).toFixed(2) + "s");
    });
  }

  function watch() {
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

  var started = false;
  function start() {
    if (started) return;
    started = true;
    collect();
    watch();
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
  }
  new MutationObserver(function () {
    if (sweepPending) return;
    var wait = Math.max(0, 400 - (Date.now() - lastSweep));
    if (!wait) { sweep(); return; }
    sweepPending = true;
    setTimeout(sweep, wait);
  }).observe(doc.body, { childList: true, subtree: true });

  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) {
      cards.forEach(function (c) { c.classList.remove("is-on"); });
      return;
    }
    watch();
  });

  // Asking for stillness mid-visit has to take the band away, not just pause it.
  function onMode() {
    if (!still.matches) { watch(); return; }
    if (view) view.disconnect();
    cards.forEach(function (c) { c.classList.remove("is-on"); });
  }
  if (still.addEventListener) still.addEventListener("change", onMode);
  else still.addListener(onMode);
})();
