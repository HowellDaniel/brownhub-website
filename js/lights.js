/* The studio's light switch.
   Each arrival opens black — in light mode, dark mode or system the veil does not
   care — and one tap lights the room before it lifts it onto whatever display mode
   the visitor already has. The dark ground is the switch waiting; the lit ground is
   the loading, because by then the light is on. It is inline and blocking on
   purpose: the veil has to be in the first frame, or the page flashes through
   before it goes dark.

   An arrival is a fresh visit, not every page: the clock is kept in this tab's
   own session, so walking from Home to Catalog stays lit, while coming back after
   half an hour away — or opening the site in a new tab — finds the room dark
   again. Nothing is written that outlives the tab.

   One exemption: a machine that never taps. Google's crawler and the link
   unfurlers read the rendered page, and a headless renderer that sees only a
   black room indexes a black room — and gets an AI summary of nothing. A person
   with a mouse always gets the veil. */
(function () {
  "use strict";

  var KEY = "lights-last-seen";
  var AWAY = 30 * 60 * 1000;
  var LOAD_MS = 5000;
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-reduced-motion: reduce)");
  var overlay, button, down = false;

  /* The room does not come on the instant the switch is touched — it fills. Two
     arcs walk round each other while a number climbs for five seconds, and the
     veil lifts when it reaches 100.
     The climb is deliberately uneven. A loader that adds the same amount every
     frame is a metronome, and everyone can see it is one; a real one sprints
     while it is still guessing, stalls in the middle, and finishes in a rush.
     The waypoints below are that shape, joined by straight lines so the value is
     monotone — a percentage that ever went backwards would read as a failure. */
  var STEPS = [[0, 0], [0.10, 0.14], [0.22, 0.26], [0.30, 0.31], [0.55, 0.48],
    [0.72, 0.61], [0.86, 0.78], [0.95, 0.92], [1, 1]];

  function at(t) {
    for (var i = 1; i < STEPS.length; i++) {
      if (t <= STEPS[i][0]) {
        var a = STEPS[i - 1], b = STEPS[i];
        return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0]));
      }
    }
    return 1;
  }

  /* A static string, and the only way markup gets in: nothing a visitor writes
     reaches it, so there is nothing to escape. The arcs travel by their own
     `stroke-dashoffset` rather than a transform, because a dash pattern sliding
     along a circle needs no `transform-box` support to look right. */
  var RING = '<svg class="light-load__ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    '<circle class="light-load__arc light-load__arc--out" cx="60" cy="60" r="55"></circle>' +
    '<circle class="light-load__arc light-load__arc--in" cx="60" cy="60" r="46"></circle>' +
    '</svg>';

  function load(then) {
    overlay.tabIndex = -1;
    // Move the caret inside the room before taking its door away, or an aria-modal
    // dialog is left with nothing focused.
    overlay.focus({ preventScroll: true });
    overlay.removeChild(button);
    // The switch has been thrown, so the room stops being dark. The class is added
    // before the box goes in, so the first frame of the loading is already the
    // brighter one and the brightening is the light coming on, not a repaint.
    overlay.classList.add("is-lit");

    var box = document.createElement("div");
    box.className = "light-load";
    box.innerHTML = RING +
      '<p class="light-load__word" id="light-load-word" role="status">Loading</p>' +
      '<p class="light-load__brand" data-i18n-off>BrownHub Studio</p>' +
      '<p class="light-load__pct" data-i18n-off aria-hidden="true">0%</p>';
    overlay.appendChild(box);
    overlay.setAttribute("aria-labelledby", "light-load-word");

    var pct = box.querySelector(".light-load__pct");
    var start = Date.now();
    function paint() {
      var t = (Date.now() - start) / LOAD_MS;
      if (t >= 1) { pct.textContent = "100%"; return; }
      // Tab-hidden stops the frames, not the clock: the value is read from the
      // wall, so a reader that comes back finds the number it missed, not a stall.
      pct.textContent = Math.round(at(t) * 100) + "%";
      window.requestAnimationFrame(paint);
    }
    window.requestAnimationFrame(paint);
    setTimeout(function () {
      pct.textContent = "100%";
      box.classList.add("is-full");
      // A beat on the finished number before the room appears: the lift has to
      // look like the end of the loading, not an interruption of it.
      setTimeout(then, 320);
    }, LOAD_MS);
  }

  function arrived() {
    var now = Date.now(), last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY)) || 0;
      sessionStorage.setItem(KEY, String(now));
    } catch (e) { return true; }
    return !last || now - last > AWAY;
  }

  /* A browser driven by a machine never taps, so for it the switch would be a
     door, not a greeting. Both halves are needed: a crawler that announces
     itself, and a headless renderer that does not. A person at a keyboard is
     neither, so the human light show is untouched. */
  function isMachine() {
    if (navigator.webdriver) return true;
    var ua = navigator.userAgent || "";
    return /Googlebot|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|HeadlessChrome|Lighthouse|PTST|Screaming Frog|facebookexternalhit|WhatsApp|TelegramBot|Twitterbot|LinkedInBot|Slackbot|Discordbot|Applebot|AhrefsBot|SemrushBot|bot$|\/bot[;. ]/i.test(ua);
  }

  if (isMachine()) return;

  if (!arrived()) return;

  overlay = document.createElement("div");
  overlay.id = "light-overlay";
  overlay.className = "light-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "light-button");

  button = document.createElement("button");
  button.type = "button";
  button.id = "light-button";
  button.className = "light-overlay__btn";
  button.textContent = "Tap to turn on the light";
  overlay.appendChild(button);

  function lift() {
    root.setAttribute("data-lights", "on");
    root.classList.remove("lights-off");
    overlay.classList.add("is-lifting");
    function done() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      // The welcome card waits behind the veil rather than opening under it.
      document.dispatchEvent(new Event("lights-on"));
    }
    if (media.matches) done();
    // The veil goes over 1.7s in css/style.css. Cutting it loose any earlier would
    // take the room away mid-fade and the page would arrive in a snap after all.
    else setTimeout(done, 1750);
  }

  function reveal() {
    if (down) return;
    down = true;
    // Nobody who has asked for no motion should be made to wait five seconds for
    // a room to fill in. The switch still works; the theatre does not.
    if (media.matches) lift();
    else load(lift);
  }

  button.addEventListener("click", reveal);
  document.addEventListener("keydown", function (e) {
    if (down) return;
    if (e.key === "Escape") { e.preventDefault(); reveal(); return; }
    if (e.key === "Tab") { e.preventDefault(); button.focus({ preventScroll: true }); }
  });

  root.classList.add("lights-off");
  // The head is parsed before <body> exists, so the veil hangs under <html>
  // for the first paint and moves into the body once there is one to hold it.
  root.appendChild(overlay);
  document.addEventListener("DOMContentLoaded", function () {
    if (down || !overlay.parentNode) return;
    document.body.appendChild(overlay);
    button.focus({ preventScroll: true });
  });
})();
