(function () {
  "use strict";

  /* A language menu over one code panel, borrowed from twilio.com's "Build.
     Without limits." band. The five panels are already in the page and already
     coloured: every token is a hand-written span, because a highlighter would be
     a second script the content policy has to admit and would re-tint the same
     five snippets on each load.
     Nothing here decides which panel is first — that is the `hidden` attribute in
     the markup, so a visitor with scripting off still reads the HTML card. */
  function wire(box) {
    var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute("aria-controls"));
    });
    if (tabs.length < 2) return;

    function select(i, focus) {
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].setAttribute("aria-selected", j === i ? "true" : "false");
        tabs[j].tabIndex = j === i ? 0 : -1;
        if (panels[j]) panels[j].hidden = j !== i;
      }
      /* A line scrolled off to the right on one tab should not open the next one
         mid-word. */
      if (panels[i]) panels[i].scrollLeft = 0;
      if (focus) tabs[i].focus({ preventScroll: true });
    }

    box.addEventListener("click", function (e) {
      var tab = e.target.closest ? e.target.closest('[role="tab"]') : null;
      if (!tab) return;
      var i = tabs.indexOf(tab);
      if (i > -1) select(i, false);
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
      select(to, true);
    });

    var chosen = tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; });
    select(chosen < 0 ? 0 : chosen, false);
  }

  [].slice.call(document.querySelectorAll(".codeshow")).forEach(wire);
})();
