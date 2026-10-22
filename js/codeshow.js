(function () {
  "use strict";

  /* A language menu over one code panel, borrowed from twilio.com's "Build.
     Without limits." band. The five panels are already in the page and already
     coloured: every token is a hand-written span, because a highlighter would be
     a second script the content policy has to admit and would re-tint the same
     five snippets on each load.
     Nothing here decides which panel is first — that is the `hidden` attribute in
     the markup, so a visitor with scripting off still reads the HTML card. */

  /* Measured off the reference band: its Python panel went 20 -> 130 -> 240 ->
     615 characters in 12.3s of live sampling — 595 new characters over 12.3s,
     which is 48.4 characters a second. That pace was the reference's, not the
     owner's: asked to read the code rather than watch it arrive, he wanted it two
     thirds as quick, so the clock runs at 65% of the measured figure. The longest
     card on this page (620 characters) now takes about twenty seconds instead of
     thirteen, which is still inside one patient look at a panel.
     Twilio types only the panel it opens on and leaves the other six already
     written; here every language types the first time you reach it, because four
     silent tabs out of five read as a broken effect rather than as a choice. */
  var RATE = 31.5;
  var CARET = "▎";

  function typer(panel) {
    var code = panel.querySelector("code");
    var lines = code ? [].slice.call(code.children) : [];
    if (lines.length < 2) return null;

    /* Snapshot every text node with its full source so the token spans are never
       rebuilt and a colour cannot flicker mid-type. */
    var atoms = lines.map(function (line) {
      var walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      var len = 0;
      for (var n = walker.nextNode(); n; n = walker.nextNode()) {
        nodes.push({ node: n, text: n.nodeValue });
        len += n.nodeValue.length;
      }
      return { line: line, nodes: nodes, len: len };
    });
    var total = atoms.reduce(function (s, a) { return s + a.len; }, 0);
    var caret = document.createElement("span");
    caret.className = "codeshow__caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = CARET;

    function fill(a, budget) {
      for (var i = 0; i < a.nodes.length; i++) {
        var t = a.nodes[i];
        /* A node is always rewritten as a prefix of its own snapshot, so a length
           that did not change means a value that did not. Skipping the write is what
           keeps a frame that types two characters from re-invalidating sixty. */
        var keep = Math.max(0, Math.min(t.text.length, budget));
        if (t.node.nodeValue.length !== keep) t.node.nodeValue = t.text.slice(0, keep);
        budget -= keep;
      }
    }

    /* The type only ever moves forwards, so the paint is a cursor over the lines
       rather than a pass over the whole panel: everything before `at` is finished,
       everything after `shown` is still closed, and one frame touches the two lines
       that sit on those edges. Moving the caret is the only DOM insertion the panel
       makes, and doing it once per line instead of once per frame is what stops
       js/scroll.js watching a mutation sixty times a second. */
    var at = 0, shown = -1, caretLine = -1, spent = 0;
    atoms.forEach(function (a) { a.line.style.display = "none"; });

    /* `budget` counts every character the clock has earned since the panel began,
       so the part of it still available to this frame is what lies past `spent` —
       the characters the cursor has already passed. Spending the whole ask against
       the lines still to come let each frame buy the finished ones again, and the
       frontier ran away from the clock: the last five lines of a 620-character card
       went up in one frame and the panel looked poured rather than typed. */
    function paint(budget) {
      var want = Math.floor(budget);
      var left = want - spent;
      while (at < atoms.length && left >= atoms[at].len) {
        fill(atoms[at], atoms[at].len);
        spent += atoms[at].len;
        at++;
        left = want - spent;
      }
      var frontier = Math.min(at, atoms.length - 1);
      if (at < atoms.length) fill(atoms[frontier], Math.max(0, left));
      if (frontier === shown) return false;
      for (var k = shown + 1; k <= frontier; k++) atoms[k].line.style.display = "";
      shown = frontier;
      atoms[frontier].line.appendChild(caret);
      caretLine = frontier;
      return true;
    }

    var raf = 0, t0 = 0, running = false, done = false;

    function follow() {
      /* A panel sitting behind `hidden` has no boxes at all, and measuring one
         would push its scroll down six pixels a frame for nothing. */
      if (!panel.getClientRects().length) return;
      var here = panel.getBoundingClientRect();
      var there = caret.getBoundingClientRect();
      if (there.bottom > here.bottom - 6) panel.scrollTop += there.bottom - here.bottom + 6;
    }

    function step(now) {
      if (!t0) t0 = now;
      var budget = (now - t0) / 1000 * RATE;
      if (budget >= total) { finish(); return; }
      /* The caret can only overflow the panel by going down a line — the code never
         wraps, it scrolls sideways — so the two rect reads live in `follow()` happen
         once a line, not once a frame. */
      if (paint(budget)) follow();
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (running || done) return;
      running = true;
      t0 = 0;
      raf = requestAnimationFrame(step);
    }

    function finish() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running = false;
      done = true;
      paint(total);
      follow();
    }

    paint(0);
    return { start: start, finish: finish, typed: function () { return done; } };
  }

  function wire(box) {
    var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    });
    if (tabs.length < 2) return;

    /* A card that types while nobody can see it has only run out of code by the
       time you get here, so the driver waits for the stage and starts on the panel
       that is standing there. */
    var motion = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    var drivers = [];
    if (motion && "requestAnimationFrame" in window) {
      for (var i = 0; i < panels.length; i++) drivers[i] = typer(panels[i]);
    }

    function select(i, focus, reached) {
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].setAttribute("aria-selected", j === i ? "true" : "false");
        tabs[j].tabIndex = j === i ? 0 : -1;
        if (panels[j]) panels[j].hidden = j !== i;
      }
      /* A line scrolled off to the right on one tab should not open the next one
         mid-word. */
      if (panels[i]) panels[i].scrollLeft = 0;
      if (focus) tabs[i].focus({ preventScroll: true });
      /* `reached` is a visitor standing on the tab themselves — a click or an
         arrow key. Then the panel starts whatever the observer has decided,
         because an un-hidden panel holding nothing typed is a blank card. */
      if ((reached || visible) && drivers[i] && !drivers[i].typed()) drivers[i].start();
    }

    var visible = false;
    var stage = box.querySelector(".codeshow__stage");
    if (drivers.length && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) {
        if (!entries[0].isIntersecting) return;
        visible = true;
        var at = tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; });
        if (drivers[at < 0 ? 0 : at]) drivers[at < 0 ? 0 : at].start();
        obs.disconnect();
      }, { threshold: 0.3 }).observe(stage || box);
    } else if (drivers.length) {
      visible = true;
    }

    /* The book and the print mirror take the whole page at once. A panel caught
       mid-type would print half its code, so a print request completes them all. */
    window.addEventListener("beforeprint", function () {
      for (var j = 0; j < drivers.length; j++) if (drivers[j]) drivers[j].finish();
    });

    box.addEventListener("click", function (e) {
      var tab = e.target.closest ? e.target.closest('[role="tab"]') : null;
      if (!tab) return;
      var i = tabs.indexOf(tab);
      if (i > -1) select(i, false, true);
    });

    box.addEventListener("keydown", function (e) {
      var from = tabs.indexOf(document.activeElement);
      if (from < 0) return;
      var last = tabs.length - 1;
      var to = e.key === "ArrowRight" ? Math.min(last, from + 1)
        : e.key === "ArrowLeft" ? Math.max(0, from - 1)
        : e.key === "Home" ? 0
        : e.key === "End" ? last : -1;
      if (to < 0) return;
      /* The strip is marked dir="ltr" so the arrows mean left and right even in
         Arabic, where the page around them runs the other way. */
      e.preventDefault();
      select(to, true, true);
    });

    var chosen = tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; });
    select(chosen < 0 ? 0 : chosen, false);
  }

  [].slice.call(document.querySelectorAll(".codeshow")).forEach(wire);
})();
