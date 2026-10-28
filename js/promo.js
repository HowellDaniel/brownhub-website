/* The home welcome card.
   Shows once per arrival at the home page — a first load, a refresh, or the Home
   link, which reloads the page — and never when the visitor has followed a link
   straight to a section. The card is a dialog, so focus moves into it, Tab stays
   inside, Escape and the backdrop close it, and the page behind cannot scroll. */
(function () {
  "use strict";

  var box = document.getElementById("home-promo");
  if (!box) return;
  var card = box.querySelector(".promo__card");
  var lastFocus = null;

  function focusables() {
    return Array.prototype.slice.call(card.querySelectorAll("a[href], button:not([disabled])"))
      .filter(function (el) { return el.offsetParent !== null; });
  }

  function show() {
    if (!box.hidden) return;
    lastFocus = document.activeElement;
    /* Taking the page's scrollbar away would shift everything behind the card
       by its width; pay that width back as padding so nothing moves. */
    var gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = gap + "px";
    box.hidden = false;
    document.body.classList.add("promo-open");
    var first = card.querySelector(".promo__actions .btn") || card.querySelector(".promo__close");
    if (first) first.focus({ preventScroll: true });
  }

  function hide() {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove("promo-open");
    document.body.style.paddingRight = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  box.addEventListener("click", function (e) {
    if (e.target.closest("[data-promo-close]")) { e.preventDefault(); hide(); }
  });

  document.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); hide(); return; }
    if (e.key !== "Tab") return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* A link with a hash is someone on their way to a band, not someone arriving. */
  if (location.hash) return;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(show, still ? 350 : 900);
})();
