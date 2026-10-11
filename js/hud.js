/*
  The catalog tab wears the choreography of the ArtCraft home page: a headline that
  typesets itself out from under a moving blade, hairline frames that draw their own
  border before the corner crosses pop in, monospace readout labels above each piece
  of work, and a sticky strip that says what the grid is currently showing.

  It is opt-in by markup: this file does nothing at all on a page without [data-hud],
  which today is only catalog.html. Everything here is presentational — with the
  effect off, the motion preference set to reduce, or scripting blocked, the page is
  the same catalog with the same words in the same order.
*/
(function () {
  "use strict";

  var doc = document, root = doc.documentElement;
  var host = doc.querySelector("[data-hud]");
  if (!host) return;
  root.classList.add("js-hud");

  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* A blade that sweeps left to right is only a reveal while the text runs that
     way. In Arabic, Hebrew, Farsi or Urdu it would wipe backwards, so the headline
     is handed to the reader whole. */
  function rtl() { return root.getAttribute("dir") === "rtl"; }

  /* ============================================================
     1. the wordmark — letters emerge from a blade, line by line

     The headline's own text nodes are moved into a clipped layer rather than
     rewritten: js/translate.js holds references to those exact nodes, so a letter
     split in place would stop the heading translating. The letters are a copy,
     hidden from readers, and they are rebuilt whenever the dictionary repaints.
     ============================================================ */
  var word = host.querySelector("[data-wm]");

  function letters(node) {
    var kids = [].slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        var frag = doc.createDocumentFragment(), chars = k.nodeValue.split("");
        for (var c = 0; c < chars.length; c++) {
          /* Spaces stay plain text nodes: a line may break between words, and never
             inside one. */
          if (chars[c] === " ") { frag.appendChild(doc.createTextNode(" ")); continue; }
          var s = doc.createElement("span");
          s.className = "wm-letter";
          s.textContent = chars[c];
          frag.appendChild(s);
        }
        node.replaceChild(frag, k);
      } else if (k.nodeType === 1) { letters(k); }
    }
  }

  /* Rows are read back in document order so every line gets its own sweep, which
     is what a wrapped headline in German or a long collection name needs. */
  function rowsOf(nodes) {
    var rows = [];
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      var last = rows.length ? rows[rows.length - 1] : null;
      if (!last || Math.abs(last.t - r.top) > 6) { last = { t: r.top, items: [] }; rows.push(last); }
      last.items.push({ el: nodes[i], l: r.left, w: r.width });
    }
    return rows;
  }

  function buildLayer() {
    var layer = doc.createElement("span");
    layer.className = "wm";
    layer.setAttribute("aria-hidden", "true");
    var clone = word.querySelector(".hud-src").cloneNode(true);
    while (clone.firstChild) layer.appendChild(clone.firstChild);
    letters(layer);
    return layer;
  }

  function teardown() {
    var src = word.querySelector(".hud-src"), layer = word.querySelector(".wm");
    if (src) while (src.firstChild) word.appendChild(src.firstChild);
    if (src) src.remove();
    if (layer) layer.remove();
  }

  var wordTimer = null;
  function typeWord() {
    if (!word || still || rtl()) return;
    var whole = word.textContent.replace(/\s+/g, " ").trim();
    if (whole.replace(/\s/g, "").length < 3) return;

    var src = doc.createElement("span");
    src.className = "hud-src";
    while (word.firstChild) src.appendChild(word.firstChild);
    word.appendChild(src);
    var layer = buildLayer();
    word.appendChild(layer);

    var nodes = [].slice.call(layer.querySelectorAll(".wm-letter"));
    if (!nodes.length) { teardown(); return; }

    /* Widths are locked before anything moves. Without this, clipping a letter and
       translating its neighbours reflows the line mid-animation and the headline
       jitters. So measuring happens twice — once free, once fixed. */
    var rows = rowsOf(nodes), r, q;
    for (r = 0; r < rows.length; r++)
      for (q = 0; q < rows[r].items.length; q++)
        rows[r].items[q].el.style.width = (Math.round(rows[r].items[q].w * 100) / 100) + "px";
    rows = rowsOf(nodes);
    for (r = 0; r < rows.length; r++)
      for (q = 0; q < rows[r].items.length; q++) rows[r].items[q].el.style.opacity = "0";

    var BASE = 0.6, PER_ROW = 0.22, DUR = BASE + PER_ROW * (rows.length - 1);
    var t0 = 0, raf = 0, done = false;
    function clear() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(wordTimer);
      for (var r = 0; r < rows.length; r++) for (var q = 0; q < rows[r].items.length; q++) {
        var el = rows[r].items[q].el;
        el.style.transform = ""; el.style.clipPath = ""; el.style.opacity = ""; el.style.width = "";
      }
      host.classList.add("is-typed");
    }
    function frame(now) {
      if (done) return;
      if (!t0) t0 = now;
      var t = (now - t0) / 1000;
      if (t >= DUR + 0.05) { clear(); return; }
      for (var r = 0; r < rows.length; r++) {
        var p = (t - r * PER_ROW) / BASE;
        p = p > 1 ? 1 : p < 0 ? 0 : p;
        var items = rows[r].items;
        if (!items.length) continue;
        var from = items[0].l, to = items[items.length - 1].l + items[items.length - 1].w;
        var edge = from + (to - from) * (1 - Math.pow(1 - p, 3));
        for (var q = 0; q < items.length; q++) {
          var it = items[q], rev = (edge - it.l) / (it.w || 1);
          rev = rev > 1 ? 1 : rev < 0 ? 0 : rev;
          if (rev >= 1) { it.el.style.clipPath = ""; it.el.style.transform = ""; it.el.style.opacity = ""; continue; }
          it.el.style.clipPath = "inset(-18% " + ((1 - rev) * 100).toFixed(1) + "% -18% 0)";
          it.el.style.transform = "translate3d(" + (-(1 - rev) * (it.w * 0.34 + 3)).toFixed(1) + "px,0,0)";
          it.el.style.opacity = rev.toFixed(3);
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    /* A tab that goes to the background during the sweep stops handing out frames;
       this hands the headline back whole rather than leaving it half typed. */
    wordTimer = setTimeout(clear, (DUR + 0.7) * 1000);
  }

  /* Webfonts land after the first paint and change every letter's width, so the
     reveal waits for them instead of measuring the fallback face. */
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(typeWord);
  else if (still) { /* nothing to do */ }
  else typeWord();

  /* The dictionary repaints the clipped source layer, so the copy that is actually
     seen is rebuilt from it — instantly, because a visitor who has just changed
     language has already read the page once. */
  doc.addEventListener("i18n-applied", function () {
    if (!word) return;
    var src = word.querySelector(".hud-src"), layer = word.querySelector(".wm");
    if (!src || !layer) {
      if (!src && !still && !rtl() && host.classList.contains("is-typed")) {
        host.classList.remove("is-typed");
        typeWord();
      }
      return;
    }
    if (rtl()) { teardown(); return; }
    var next = buildLayer();
    word.replaceChild(next, layer);
    if (!still && !host.classList.contains("is-typed")) { host.classList.add("is-typed"); }
  });

  /* ============================================================
     2. blueprint frames — the rule draws itself, then the crosses pop
     ============================================================ */
  var FRAMES = [].slice.call(host.querySelectorAll(".hud-frame"));
  FRAMES.forEach(function (f) {
    var ticks = doc.createElement("span");
    ticks.className = "hud-ticks";
    ticks.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 4; i++) ticks.appendChild(doc.createElement("i"));
    f.appendChild(ticks);
  });
  if (FRAMES.length) {
    if (still) FRAMES.forEach(function (f) { f.classList.add("is-drawn"); });
    else {
      var watchFrames = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          entries[i].target.classList.add("is-drawn");
          watchFrames.unobserve(entries[i].target);
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
      FRAMES.forEach(function (f) { watchFrames.observe(f); });
    }
  }

  /* ============================================================
     3. readout labels — the collection and the slot, above the picture
     ============================================================ */
  var tiles = [].slice.call(doc.querySelectorAll(".collection[data-collection]"));
  var grid = doc.getElementById("catalog-grid");
  var cards = grid ? [].slice.call(grid.querySelectorAll(".product-card")) : [];

  function labelFor(card) {
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].getAttribute("data-collection") !== (card.getAttribute("data-cat") || card.dataset.cat)) continue;
      var name = tiles[i].querySelector(".collection__name");
      /* The tile's own label is what the dictionary translated; the dataset holds
         the English source, which would sit oddly in a French page. */
      if (name && name.textContent) return name.textContent;
    }
    return card.dataset.catlabel || "";
  }

  cards.forEach(function (card, i) {
    if (card.querySelector(".hud-row")) return;
    var row = doc.createElement("div");
    row.className = "hud-row";
    var shelf = doc.createElement("span");
    shelf.className = "hud-label";
    shelf.setAttribute("data-hud-cat", "");
    shelf.textContent = labelFor(card);
    var slot = doc.createElement("span");
    slot.className = "hud-label hud-label--faint";
    slot.textContent = ("0" + (i + 1)).slice(-2);
    row.appendChild(shelf);
    row.appendChild(slot);
    card.insertBefore(row, card.firstChild);
  });

  doc.addEventListener("i18n-applied", function () {
    for (var i = 0; i < cards.length; i++) {
      var shelf = cards[i].querySelector(".hud-label[data-hud-cat]");
      if (!shelf) continue;
      var want = labelFor(cards[i]);
      if (want && shelf.textContent !== want) shelf.textContent = want;
    }
  });

  /* ============================================================
     4. the sticky readout — what the grid is holding right now
     ============================================================ */
  var status = doc.querySelector("[data-hud-status]");
  var shownEl = status && status.querySelector("[data-hud-shown]");
  var totalEl = status && status.querySelector("[data-hud-total]");
  var shelfEl = status && status.querySelector("[data-hud-shelf]");

  function refreshStatus() {
    if (!status) return;
    var shown = 0;
    for (var i = 0; i < cards.length; i++) if (!cards[i].hidden) shown++;
    if (shownEl) shownEl.textContent = String(shown);
    if (totalEl) totalEl.textContent = String(cards.length);
    if (shelfEl) {
      var on = null;
      for (var t = 0; t < tiles.length; t++)
        if (tiles[t].getAttribute("aria-pressed") === "true") on = tiles[t];
      var name = on && on.querySelector(".collection__name");
      shelfEl.textContent = name ? name.textContent : "";
      status.classList.toggle("is-shelf", !!on);
    }
    status.classList.toggle("is-empty", shown === 0);
    status.style.setProperty("--hud-fill", cards.length ? (shown / cards.length).toFixed(4) : "0");
  }
  refreshStatus();

  if (cards.length && typeof MutationObserver === "function") {
    var mo = new MutationObserver(refreshStatus);
    for (var i = 0; i < cards.length; i++) mo.observe(cards[i], { attributes: true, attributeFilter: ["hidden"] });
    for (var t = 0; t < tiles.length; t++) mo.observe(tiles[t], { attributes: true, attributeFilter: ["aria-pressed"] });
    /* Typing a search narrows the grid on the same input event that moved the last
       card, so the count answers there rather than waiting for the next mutation. */
    doc.addEventListener("input", refreshStatus, true);
  }
})();
