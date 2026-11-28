/*
  The Meta Pixel — the only script on this site that lets another company follow a
  visitor from page to page.

  It is built the way the display ad slot is built (js/store.js), because that slot
  already settled the two rules that matter here:

    1. A half-pasted id is worse than none. An id that does not look like an id stops
       anything loading, so a mistyped value cannot send traffic to somebody else's
       account.
    2. Nothing leaves before the visitor has said yes to "Advertising and affiliate"
       in the cookie centre. js/cookies.js is a defer tag after this one, so the first
       pass of this file cannot know the answer; the document settling is the moment
       every tag has run, and a decision made mid-visit is caught by the "bhconsent"
       event. A visitor who never decides is a visitor nothing is sent for.

  There is deliberately no <noscript> fallback image, which Meta's own install
  instructions include. That fallback would fire for a visitor whose browser has
  scripting switched off — a visitor who could never have reached this page's consent
  centre, and therefore never gave the yes this whole file is built around.

  No name, email, phone number or message ever reaches this script, and none is
  forwarded to Meta. The three events it can send are a page being read, an enquiry
  being sent, and a payment being made, and the only extra value is the amount and
  currency of that payment.
*/
(() => {
  "use strict";

  // Paste the pixel id here. It is the row of digits Events Manager shows next to
  // the pixel's name — nothing else in that account is the id.
  var PIXEL_ID = "";

  var doc = document;
  var SRC = "https://connect.facebook.net/en_US/fbevents.js";

  /* Meta's ids are a bare run of digits — a real one is fifteen or sixteen long, and
     Events Manager accepts up to twenty. A name, a URL or a half-selected string is
     refused here rather than at the network. */
  function pixelId() {
    var v = typeof PIXEL_ID === "string" ? PIXEL_ID.trim() : "";
    return /^\d{8,20}$/.test(v) ? v : "";
  }

  function consent() {
    return typeof window.bhConsent === "function"
      ? window.bhConsent()
      : { decided: false, analytics: false, advertising: false };
  }

  var ready = false;      /* fbq exists and has been initialised */
  var loading = false;    /* the script tag is on its way */
  var queued = [];        /* events asked for before the script answered */

  function send(name, params) {
    if (!ready || typeof window.fbq !== "function") return false;
    try {
      window.fbq("track", name, params || {});
      return true;
    } catch (e) { return false; }
  }

  function start() {
    var id = pixelId();
    if (!id || loading || ready) return;
    loading = true;
    var s = doc.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = function () {
      if (typeof window.fbq !== "function") { loading = false; return; }
      window.fbq("init", id);
      /* Meta offers to guess events off the page — which form was touched, which
         button was clicked — without anything here asking. Refuse: this site names
         the three things it reports, and a guessed fourth is not consented to.
         An older copy of the script simply ignores the call. */
      try { window.fbq("set", "autoEventLoggingEnabled", false); } catch (e) {}
      ready = true;
      send("PageView");
      queued.forEach(function (q) { send(q.n, q.p); });
      queued = [];
    };
    s.onerror = function () { loading = false; };
    doc.head.appendChild(s);
  }

  /* The one entry point the rest of the site may call: window.bhPixel("Lead").
     Before the answer is known it is silent, and an event asked for while the
     script is still arriving is kept and sent the moment it is not. */
  window.bhPixel = function (name, params) {
    var c = consent();
    if (!c.decided || !c.advertising || !pixelId()) return false;
    var n = String(name || "").trim();
    if (!n) return false;
    if (!ready) {
      if (queued.length < 20) queued.push({ n: n, p: params });
      start();
      return false;
    }
    return send(n, params);
  };

  function maybe() {
    var c = consent();
    if (c.decided && c.advertising) start();
  }

  /* The dependency is the consent centre, not the document. js/cookies.js is a defer tag
     placed after this one, and a defer script runs at readyState "interactive" — never
     "loading" — so testing the document here took the else branch, read a consent centre
     that did not exist yet, and then never asked again: a yes stored on an earlier visit
     stayed invisible until the visitor touched a control, which is the opposite of what the
     privacy page tells them. Ask about the thing that is actually missing instead. If the
     consent centre never arrives, no answer is known, and no answer is a no. */
  if (typeof window.bhConsent === "function") maybe();
  else doc.addEventListener("DOMContentLoaded", maybe);
  doc.addEventListener("bhconsent", maybe);
})();
