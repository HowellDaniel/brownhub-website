/* The studio's light switch.
   Each arrival opens black — in light mode, dark mode or system the veil does not
   care — and one tap lifts it onto whatever display mode the visitor already has.
   It is inline and blocking on purpose: the veil has to be in the first frame, or
   the page flashes through before it goes dark.

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
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-reduced-motion: reduce)");
  var overlay, button, down = false;

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

  function reveal() {
    if (down) return;
    down = true;
    root.setAttribute("data-lights", "on");
    root.classList.remove("lights-off");
    overlay.classList.add("is-lifting");
    function done() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      // The welcome card waits behind the veil rather than opening under it.
      document.dispatchEvent(new Event("lights-on"));
    }
    if (media.matches) done();
    else setTimeout(done, 600);
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
