/* The studio's light switch.
   Every visit opens black, first one or not — in light mode, dark mode or system,
   the veil does not care — and one tap lifts it onto whatever display mode the
   visitor already has. It is inline and blocking on purpose: the veil has to be
   in the first frame, or the page flashes through before it goes dark. */
(function () {
  "use strict";

  var root = document.documentElement;
  var media = window.matchMedia("(prefers-reduced-motion: reduce)");
  var overlay, button, down = false;

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
