/*
  The two-tap rating and the optional note on help.html.

  It posts to /functions/v1/capture/feedback rather than straight to the database:
  public.feedback has no insert policy and no grants to a browser key at all, so
  finding the endpoint is not a way in — only this studio's own service key can
  write a row. See supabase/functions/capture/index.ts.

  Nothing is kept on the visitor's device for this: no cookie, no localStorage. A
  rating is worth one row per page read, which is all the studio can act on, and
  the per-address ceiling in the function is what stops anything looping.
*/
(function () {
  "use strict";

  var doc = document;
  var FN = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1";
  var MAX_MESSAGE = 2000;
  var MAX_CONTACT = 32;
  var FAIL = "Could not send that. Try again, or tell us on the contact page.";

  var form = doc.getElementById("feedback-form");
  if (!form) return;

  var votes = [].slice.call(form.querySelectorAll("[data-vote]"));
  var rest = doc.getElementById("feedback-rest");
  var done = doc.getElementById("feedback-done");
  var hp = form.querySelector("[name='_site']");
  var message = doc.getElementById("feedback-message");
  var contact = doc.getElementById("feedback-contact");
  var thanks = done ? done.textContent : "";

  var vote = "";
  var busy = false;

  function say(text) {
    if (!done) return;
    done.textContent = text;
    done.hidden = false;
  }

  function clear() {
    busy = false;
    votes.forEach(function (b) { b.disabled = false; });
  }

  // Which part of the page is being judged. The page names it; the function keeps
  // it only if it is a plain label, so nothing typed here can reach the row.
  function article() {
    return form.getAttribute("data-article") || "help";
  }

  /* The Send has to be pressable where the note leaves it.
     Focusing the textarea makes the browser scroll the TEXTAREA into view and never the
     button below it: measured in a 390x844 frame, Send landed at viewport y 773..811
     while the install ask holds 740..832, and document.elementFromPoint at the button's
     own centre returned the ask's paragraph — the note was open and unsendable. Desk was
     5px clear on the same landing, so this is not only a phone problem.
     The site already publishes how much of the bottom edge the asks take as --queue-h,
     which is what the assistant sheet and the pinned stages stop short of; the note is
     simply the same kind of consumer and reads the same number. */
  function liftSend() {
    var btn = rest && rest.querySelector('button[type="submit"]');
    if (!btn || !window.scrollTo) return;
    var q = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--queue-h"));
    var line = window.innerHeight - (isNaN(q) ? 0 : q) - 16;
    var r = btn.getBoundingClientRect();
    if (r.bottom > line) window.scrollTo({ top: window.scrollY + (r.bottom - line) });
  }

  function send(withNote) {
    if (busy) return;
    if (!vote && !String(message ? message.value : "").trim()) {
      // Nothing judged and nothing written is not feedback; keep the box open
      // rather than filing an empty row the studio would have to discard.
      if (rest) rest.hidden = false;
      if (message) message.focus({ preventScroll: true });
      liftSend();
      return;
    }
    busy = true;
    votes.forEach(function (b) { b.disabled = true; });
    var payload = {
      vote: vote,
      // A tap judges an answer; a note with no tap is talking about the page.
      topic: vote ? "answer" : "page",
      article: form.getAttribute("data-article") || "help",
      message: withNote ? String(message ? message.value : "").trim().slice(0, MAX_MESSAGE) : "",
      contact: withNote ? String(contact ? contact.value : "").trim().slice(0, MAX_CONTACT) : "",
      _site: hp ? String(hp.value || "") : "",
      page: location.pathname,
      lang: doc.documentElement.lang || "en"
    };
    fetch(FN + "/capture/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify(payload),
      signal: (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined
    }).then(function (r) {
      file(!!(r && r.ok));
    }).catch(function () {
      file(false);
    });
  }

  function file(ok) {
    if (ok) {
      votes.forEach(function (b) {
        var chosen = b.getAttribute("data-vote") === vote;
        b.disabled = !chosen;
        b.setAttribute("aria-pressed", chosen ? "true" : "false");
      });
      if (rest) rest.hidden = true;
      say(thanks || "Thank you.");
    } else {
      clear();
      if (rest) rest.hidden = false;
      say(FAIL);
    }
  }

  votes.forEach(function (b) {
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () {
      vote = b.getAttribute("data-vote") || "";
      /* Mark the answer the moment it is given, not only when the post comes back.
         "No" moves focus into the note and "Yes" can fail, and in both cases the
         pills are the last place a visitor looks to remember what they tapped. */
      votes.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      // "No" is the answer that should ask a follow-up, and it asks in place
      // instead of posting, so someone with a complaint is not cut off.
      if (vote === "no" && rest) {
        rest.hidden = false;
        if (message) message.focus({ preventScroll: true });
        liftSend();
        return;
      }
      send(false);
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(true);
  });
})();
