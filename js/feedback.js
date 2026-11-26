/*
  One rating per help answer. The panel posts to /capture/feedback, where the
  studio's service role is the only writer allowed into public.feedback.

  This script owns state and nothing else. Every sentence a visitor reads — the
  thank-you and the "it did not send" line — lives in help.html so translate.js can
  paint it, and translate.js fills the dictionaries after this file has run. Copy
  written here would overwrite the visitor's own language with English.
*/
(function () {
  "use strict";

  var doc = document;
  var FN = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1";
  var MAX_MESSAGE = 2000;
  var MAX_CONTACT = 32;

  function init(form) {
    var stars = form.querySelector(".feedback__stars");
    var rest = form.querySelector(".feedback__rest");
    var done = form.querySelector(".form-success");
    var error = form.querySelector(".feedback__error");
    var send = form.querySelector('button[type="submit"]');
    var hp = form.querySelector("[name='_site']");
    var message = form.querySelector(".feedback-message");
    var contact = form.querySelector(".feedback-contact");
    var busy = false;

    /* Off then on, deliberately: a status region that is already open says nothing
       again, and a visitor who presses Send twice deserves to hear about it twice. */
    function reveal(node, on) {
      if (!node) return;
      if (!on) {
        node.hidden = true;
        return;
      }
      node.hidden = true;
      node.hidden = false;
    }

    // Measured on the live function: a feedback post takes about three and a half
    // seconds. Left alone, Send looks dead for that whole time and gets pressed again.
    function waiting(on) {
      if (on) form.setAttribute("aria-busy", "true");
      else form.removeAttribute("aria-busy");
      if (send) send.disabled = on;
    }

    function liftSend() {
      var button = rest && rest.querySelector('button[type="submit"]');
      if (!button || !window.scrollTo) return;
      var queue = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--queue-h"));
      var line = window.innerHeight - (isNaN(queue) ? 0 : queue) - 16;
      var box = button.getBoundingClientRect();
      if (box.bottom > line) window.scrollTo({ top: window.scrollY + (box.bottom - line) });
    }

    function chosenRating() {
      return form.querySelector('input:checked[name="rating"]');
    }

    function unlock() {
      busy = false;
      waiting(false);
      form.querySelectorAll("input").forEach(function (input) {
        input.disabled = false;
      });
    }

    function finish(ok) {
      if (!ok) {
        unlock();
        reveal(rest, true);
        reveal(error, true);
        reveal(done, false);
        return;
      }
      waiting(false);
      form.dataset.sent = "1";
      form.querySelectorAll("input, button").forEach(function (field) {
        field.disabled = true;
      });
      reveal(rest, false);
      reveal(error, false);
      reveal(done, true);
    }

    form.addEventListener("change", function (event) {
      if (!event.target.matches('.feedback__stars input[type="radio"]')) return;
      if (stars) stars.dataset.selected = event.target.value;
      reveal(error, false);
      reveal(rest, true);
      liftSend();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy || form.dataset.sent) return;
      var rating = chosenRating();
      if (!rating) {
        reveal(rest, true);
        if (message) message.focus({ preventScroll: true });
        liftSend();
        return;
      }

      busy = true;
      waiting(true);
      var payload = {
        rating: Number(rating.value),
        topic: "answer",
        article: form.getAttribute("data-article") || "help",
        message: String(message ? message.value : "").trim().slice(0, MAX_MESSAGE),
        contact: String(contact ? contact.value : "").trim().slice(0, MAX_CONTACT),
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
      }).then(function (response) {
        return response.ok ? response.json().catch(function () { return null; }) : null;
      }).then(function (answer) {
        finish(!!(answer && answer.ok === true));
      }).catch(function () {
        finish(false);
      });
    });
  }

  var forms = doc.querySelectorAll('.feedback--answer');
  if (!forms.length) return;
  forms.forEach(init);
})();
