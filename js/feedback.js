/*
  One rating per help answer. The panel posts to /capture/feedback, where the
  studio's service role is the only writer allowed into public.feedback.
*/
(function () {
  "use strict";

  var doc = document;
  var FN = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1";
  var MAX_MESSAGE = 2000;
  var MAX_CONTACT = 32;
  var FAIL = "Could not send that. Try again, or tell us on the contact page.";

  function init(form) {
    var stars = form.querySelector(".feedback__stars");
    var rest = form.querySelector(".feedback__rest");
    var done = form.querySelector(".form-success");
    var hp = form.querySelector("[name='_site']");
    var message = form.querySelector(".feedback-message");
    var contact = form.querySelector(".feedback-contact");
    var success = done ? done.textContent : "";
    var busy = false;

    function say(text) {
      if (!done) return;
      done.textContent = text;
      done.hidden = false;
    }

    function thanksText() {
      if (!done) return "Thank you.";
      if (done.hidden) success = done.textContent;
      return success.trim() || "Thank you.";
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
      form.querySelectorAll("input").forEach(function (input) {
        input.disabled = false;
      });
      var button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = false;
    }

    function finish(ok) {
      if (!ok) {
        unlock();
        if (rest) rest.hidden = false;
        say(FAIL);
        return;
      }
      form.dataset.sent = "1";
      form.querySelectorAll("input, button").forEach(function (field) {
        field.disabled = true;
      });
      if (rest) rest.hidden = true;
      say(thanksText());
    }

    form.addEventListener("change", function (event) {
      if (!event.target.matches('.feedback__stars input[type="radio"]')) return;
      if (stars) stars.dataset.selected = event.target.value;
      if (rest) rest.hidden = false;
      liftSend();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (busy || form.dataset.sent) return;
      var rating = chosenRating();
      if (!rating) {
        if (rest) rest.hidden = false;
        if (message) message.focus({ preventScroll: true });
        liftSend();
        return;
      }

      busy = true;
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
