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
     615 characters in 12.3s of live sampling, which is 27.2 characters a second.
     Twilio types only the panel it opens on and leaves the other six already
     written; here every language types the first time you reach it, because four
     silent tabs out of five read as a broken effect rather than as a choice. */
  var RATE = 27.2;
  var CARET = "▎";

  function typer(panel) {
    var code = panel.querySelector("code");
    var lines = code ? [].slice.call(code.children) : [];
    if (lines.length < 2) return null;

    /* Snapshot every text node with its full source. Painting then only ever
       shortens a node and hides lines that have not been reached, so the token
       spans are never rebuilt and a colour cannot flicker mid-type. */
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
        var keep = Math.max(0, Math.min(a.nodes[i].text.length, budget));
        a.nodes[i].node.nodeValue = a.nodes[i].text.slice(0, keep);
        budget -= keep;
      }
    }

    function paint(budget) {
      var frontier = atoms[0], i, a;
      for (i = 0; i < atoms.length; i++) {
        a = atoms[i];
        frontier = a;
        if (budget >= a.len) { fill(a, a.len); a.line.style.display = ""; budget -= a.len; }
        else { fill(a, budget); a.line.style.display = ""; break; }
      }
      for (var k = i + 1; k < atoms.length; k++) {
        fill(atoms[k], 0);
        atoms[k].line.style.display = "none";
      }
      frontier.line.appendChild(caret);
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
      paint(budget);
      follow();
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
