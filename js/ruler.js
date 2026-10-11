/*
  The catalog tab wears a ruler down its right edge: a 0–100% scale that slides up
  as the page runs down, with each band's own heading written along it at the
  percentage where that band begins. Reaching a band lifts its name off the scale,
  letter by letter, into the readout at the head of the rail, and a hairline marker
  pinned to the middle of the viewport says how far in the reader is.

  Three gates. [data-ruler] is markup only catalog.html carries. The rail then
  exists only on a wide screen that is not asking for reduced motion — below that
  the page is left exactly as it was, because 150px stolen from a phone is not an
  effect, it is damage. Nothing is added to the top edge: js/scroll.js already
  sweeps a progress hairline under the nav, and a second one would only disagree
  with it. Everything here is scenery: it is aria-hidden, and the headings it
  copies stay on the page in the same order for anyone reading past it.
*/
(function () {
  "use strict";

  var doc = document, root = doc.documentElement, win = window;
  var host = doc.querySelector("[data-ruler]");
  if (!host) return;

  var sections = [].slice.call(host.querySelectorAll(":scope > section"));
  /* A ruler over two bands measures nothing; the page has to be worth a scale. */
  if (sections.length < 3) return;

  var PX = 34;          // one percent of the page, along the scale
  var WIDE = 1360;      // css/style.css media query — and css/style.css --rail is the
                        // 150px the page gives up; the two have to agree by hand
  var CAP = 3;          // names listed above and below the readout
  /* Longest heading in the catalog is 26 characters, so this only trims an
     outlier. One shared cap for the scale label and the readout, because the
     letters fly out of the label into the readout and both have to say the
     same word for the flight to land on its own measure. */
  var MAXNAME = 28;

  var quiet = matchMedia("(prefers-reduced-motion: reduce)");
  var wide = matchMedia("(min-width:" + WIDE + "px)");
  function rtl() { return root.getAttribute("dir") === "rtl"; }

  var rail, scale, marker, pctEl, doneEl, nowEl, nextEl;
  var labels = [], names = [], topsPx = [], topsPct = [];
  var flies = [], active = -1, on = false, target = 0, smooth = 0, raf = 0;

  function node(tag, cls) { var n = doc.createElement(tag); if (cls) n.className = cls; return n; }
  function pad(n) { n = String(n); return n.length > 2 ? n : "00".slice(n.length) + n; }

  /* ============================================================
     1. the rail, built here so nothing orphaned is left in the markup
     ============================================================ */
  function build() {
    var wrap = node("div", "ruler");
    wrap.setAttribute("aria-hidden", "true");
    rail = node("div", "ruler__rail");
    doneEl = node("div", "ruler__done");
    nowEl = node("div", "ruler__now");
    nextEl = node("div", "ruler__next");
    scale = node("div", "ruler__scale");
    marker = node("div", "ruler__marker");
    pctEl = node("b");
    marker.appendChild(pctEl);
    rail.appendChild(doneEl); rail.appendChild(nowEl); rail.appendChild(nextEl);
    rail.appendChild(scale); rail.appendChild(marker);
    wrap.appendChild(rail);
    doc.body.appendChild(wrap);

    for (var i = 0; i <= 100; i++) {
      var t = node("div", "ruler__tick" + (i % 5 ? "" : " is-major"));
      t.style.top = (i * PX) + "px";
      if (i % 5 === 0) { var s = node("span", "ruler__num"); s.textContent = i; t.appendChild(s); }
      scale.appendChild(t);
    }
    /* The scale runs past 100% so the last band's name has somewhere to sit after
       its own start line; the marker never travels that far. */
    scale.style.height = (100 * PX + 340) + "px";
  }

  /* The label is the band's own heading read out of the live DOM. The dictionary has
     already translated it, so the rail speaks the visitor's language without one new
     key — and trimming happens on the copy, not on a second English string.

     The clone matters: on this page js/hud.js splits the opening headline into a
     layer of letters and leaves it beside the words it was built from, both inside
     the same h1. textContent on the heading itself would say the band twice. The
     letter layer is the aria-hidden half, so it comes off the copy that is read. */
  function nameOf(s) {
    var h = s.querySelector("h1, h2");
    if (!h) return "";
    var c = h.cloneNode(true);
    var hidden = c.querySelectorAll("[aria-hidden]");
    for (var i = 0; i < hidden.length; i++) hidden[i].remove();
    var t = c.textContent.replace(/\s+/g, " ").trim();
    if (t.length > MAXNAME) t = t.slice(0, MAXNAME - 1).replace(/\s\S*$/, "") + "…";
    return t;
  }

  function measure() {
    var y = win.pageYOffset, max = Math.max(1, root.scrollHeight - win.innerHeight);
    names = []; topsPx = []; topsPct = [];
    for (var i = 0; i < sections.length; i++) {
      var top = sections[i].getBoundingClientRect().top + y;
      names.push(nameOf(sections[i]));
      topsPx.push(top);
      topsPct.push(Math.min(100, Math.max(0, top / max * 100)));
    }
    while (labels.length < sections.length) labels.push(scale.appendChild(node("div", "ruler__label")));
    for (var q = 0; q < labels.length; q++) {
      labels[q].textContent = names[q] || "";
      labels[q].style.top = (topsPct[q] * PX) + "px";
      labels[q].classList.toggle("is-gone", q <= active);
    }
  }

  /* ============================================================
     2. the readout — what has passed, what is held, what is coming
     ============================================================ */
  function list(el, arr) {
    el.textContent = "";
    for (var i = 0; i < arr.length; i++) { var d = node("div"); d.textContent = arr[i]; el.appendChild(d); }
  }

  function activeAt() {
    var y = win.pageYOffset + win.innerHeight * 0.4, idx = 0;
    for (var i = 0; i < topsPx.length; i++) if (topsPx[i] <= y) idx = i;
    return idx;
  }

  function setActive(idx, mayFly) {
    if (idx === active) return;
    active = idx;
    list(doneEl, names.slice(Math.max(0, idx - CAP), idx));
    list(nextEl, names.slice(idx + 1, idx + 1 + CAP));
    for (var i = 0; i < labels.length; i++) labels[i].classList.toggle("is-gone", i <= idx);
    show(names[idx] || "", mayFly);
  }

  function killFlies() {
    for (var i = 0; i < flies.length; i++) { try { flies[i].anim.cancel(); } catch (e) {} flies[i].el.remove(); }
    flies = [];
    /* Only clears the hide show() set. While no band is held yet the readout is
       supposed to be empty, and an early call must not flip its visibility. */
    if (active > -1 && nowEl) nowEl.style.visibility = "";
  }

  /* A name leaves the scale vertically and lands horizontally in the readout, so the
     flight is the whole idea: each letter starts on the rotated label, arcs inward,
     and straightens as it arrives. */
  function show(word, mayFly) {
    killFlies();
    /* The WAAPI check belongs on an element, not on the word: `word` is a plain
       string here, and asking a string for .animate would silently turn the whole
       flight off while the readout still filled in. */
    if (!mayFly || quiet.matches || !word || !word.replace(/\s/g, "").length ||
        typeof Element.prototype.animate !== "function") {
      nowEl.textContent = word;
      return;
    }
    var src = labels[active] && labels[active].getBoundingClientRect();
    if (!src || !src.height) { nowEl.textContent = word; return; }

    /* Hidden while the letters fly so no half-built word flashes; the timer below is
       the guarantee it comes back even if the tab stops handing out frames. */
    nowEl.style.visibility = "hidden";
    nowEl.textContent = "";
    var spans = [], i;
    for (i = 0; i < word.length; i++) {
      var s = node("span");
      s.textContent = word.charAt(i) === " " ? " " : word.charAt(i);
      nowEl.appendChild(s); spans.push(s);
    }
    var finals = [];
    for (i = 0; i < spans.length; i++) finals.push(spans[i].getBoundingClientRect());

    var rot = rtl() ? -90 : 90;
    var live = 0;
    function reveal() { nowEl.style.visibility = ""; }
    for (i = 0; i < word.length; i++) {
      if (word.charAt(i) === " ") continue;
      var f = finals[i];
      if (!f || !f.width) continue;
      /* vertical-rl reads downward, so the letter furthest along the label starts
         furthest down it. */
      var sx = src.left + src.width / 2;
      var sy = src.top + ((i + 0.5) / word.length) * src.height;
      var el = node("span", "ruler__fly");
      el.textContent = word.charAt(i);
      el.style.left = f.left + "px";
      el.style.top = f.top + "px";
      doc.body.appendChild(el);
      var dx = sx - f.left, dy = sy - f.top;
      var anim = el.animate([
        { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg)", opacity: 0.35 },
        { transform: "translate(" + (dx * 0.35 - 58) + "px," + (dy * 0.55) + "px) rotate(" + (rot * 0.4) + "deg)", opacity: 1, offset: 0.5 },
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 }
      ], { duration: 620, delay: i * 26, easing: "cubic-bezier(.6,0,.2,1)", fill: "backwards" });
      (function (node_, anim_) {
        anim_.onfinish = function () {
          for (var k = flies.length - 1; k >= 0; k--) if (flies[k].anim === anim_) flies.splice(k, 1);
          node_.remove();
          if (!flies.length) reveal();
        };
        flies.push({ el: node_, anim: anim_ });
      })(el, anim);
      live++;
    }
    if (!live) { reveal(); return; }
    setTimeout(reveal, 620 + live * 26 + 500);
  }

  /* ============================================================
     3. the slide — the scale glides toward the real scroll position
     ============================================================ */
  function readTarget() {
    var max = root.scrollHeight - win.innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, win.pageYOffset / max)) : 0;
  }

  function paint() {
    if (!on) return;
    var p = smooth * 100;
    scale.style.transform = "translate3d(0," + (win.innerHeight / 2 - p * PX).toFixed(1) + "px,0)";
    pctEl.textContent = pad(Math.round(Math.max(0, Math.min(100, p)))) + "%";
  }

  function tick() {
    var d = target - smooth;
    /* The loop stops itself once the scale has caught up. A rAF that runs for the life
       of the page costs a phone its battery for a scale that has stopped moving. */
    if (Math.abs(d) < 0.0004) { smooth = target; paint(); raf = 0; return; }
    smooth += d * 0.12;
    paint();
    raf = requestAnimationFrame(tick);
  }

  function onScroll() {
    if (!on) return;
    readTarget();
    setActive(activeAt(), true);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* ============================================================
     4. when the rail is allowed to exist at all
     ============================================================ */
  function setOn() {
    var want = wide.matches && !quiet.matches && (root.scrollHeight - win.innerHeight) > win.innerHeight * 0.6;
    if (want === on) return;
    on = want;
    root.classList.toggle("has-rail", want);
    if (!want) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      killFlies();
      doneEl.textContent = nextEl.textContent = nowEl.textContent = "";
      return;
    }
    measure();
    active = -1;
    setActive(activeAt(), false);
    /* The rail comes up where the reader already is, not gliding from the top of
       the page to wherever they happened to have scrolled. */
    readTarget();
    smooth = target;
    paint();
  }

  var pending = 0;
  function reflow() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      /* The page may have just become too short to be worth a scale, so the gate is
         re-asked rather than only the geometry re-read. */
      setOn();
      if (!on) return;
      measure();
      readTarget();
      paint();
    });
  }

  build();
  measure();
  setOn();

  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", function () { setOn(); reflow(); });
  wide.addEventListener ? wide.addEventListener("change", setOn) : wide.addListener(setOn);
  quiet.addEventListener ? quiet.addEventListener("change", setOn) : quiet.addListener(setOn);

  /* Pictures landing, a search narrowing the grid, a dictionary repainting the
     headings — all of them move the bands, so the scale is re-read rather than
     trusted from the first layout. Webfonts are the same story in slow motion. */
  if (typeof ResizeObserver === "function") new ResizeObserver(reflow).observe(host);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(reflow);
  doc.addEventListener("i18n-applied", function () {
    measure();
    if (on) { active = -1; setActive(activeAt(), false); }
  });
})();
