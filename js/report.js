/*
  Problem feedback, everywhere on the site.

  A visitor whose price is wrong, whose link is dead or whose assistant will not answer
  is standing on a page that is not help.html, and until now the only way to tell the
  studio was to go and find help.html first. This is the way that needs no finding: a
  pill at the bottom of every page that wears the shell, opened by hand or by its own
  key.

  The copy rule is the one js/cookies.js writes under. Every sentence a visitor reads is
  painted here in its English source form, and translate.js — which watches the body for
  nodes added after it ran — repaints them in the language the visitor chose. The
  keyboard hint is the single exception and it is aria-hidden: ⌘⌥F is a picture of keys,
  not a sentence, and the keys differ by platform rather than by language.

  Nothing here uploads. The screenshots tile is printed because the shape of the form
  asks for it, and it says in words that attachments open with the next release — there
  is no storage bucket in this project, so a pressable tile would be a button that lies.
*/
(function () {
  "use strict";

  var doc = document;
  var FN = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1";
  var MAX_MESSAGE = 2000;
  var MAX_CONTACT = 32;

  var COPY = {
    pill: "Problem feedback",
    help: "Help",
    title: "What would you like to share?",
    sub: "Tell us about a problem or suggestion so we can improve BrownHub Studio.",
    note: "Problem or suggestion (required)",
    describe: "Describe what happened, what you expected, and how to see it again.",
    shots: "Screenshots",
    staged: "Screenshot attachments open with the next release.",
    contact: "Your WhatsApp number, if you want an answer back",
    ask: "Ask the studio assistant",
    send: "Send feedback",
    close: "Close",
    sent: "Thanks — your feedback reached the studio.",
    failed: "Could not send that. Try again, or tell us on the contact page."
  };

  /* The same root translate.js works out, because a page in gallery/ is one directory
     away from the help page and the dictionaries. */
  var ROOT = (function () {
    var logo = doc.querySelector(".nav__logo");
    if (!logo) return "";
    try {
      return new URL(".", new URL(logo.getAttribute("href"), doc.baseURI)).href;
    } catch (e) { return ""; }
  })();

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Off then on: a status region that is already open says nothing again, and a visitor
     who presses Send twice deserves to hear about it twice. */
  function reveal(node, on) {
    if (!node) return;
    node.hidden = true;
    if (on) node.hidden = false;
  }

  // ── the pair ────────────────────────────────────────────────────────────────
  var apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
  var pair = el("div", "report-pair");
  var pill = el("button", "report-pill");
  pill.type = "button";
  pill.appendChild(el("span", "report-pill__label", COPY.pill));
  var hint = el("kbd", "report-pill__key", apple ? "⌘ + ⌥ + F" : "Ctrl + Alt + F");
  hint.setAttribute("aria-hidden", "true");
  pill.appendChild(hint);
  var help = el("a", "report-help", "?");
  help.href = ROOT + "help.html";
  help.setAttribute("aria-label", COPY.help);
  pair.append(pill, help);

  // ── the dialog ──────────────────────────────────────────────────────────────
  var modal = el("div", "report-modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "report-title");
  modal.hidden = true;

  var scrim = el("div", "report-modal__scrim");
  var card = el("div", "report-modal__card");

  var head = el("div", "report-modal__head");
  var heading = el("h2", "report-modal__title", COPY.title);
  heading.id = "report-title";
  var sub = el("p", "report-modal__sub", COPY.sub);
  var x = el("button", "report-modal__close", "×");
  x.type = "button";
  x.setAttribute("aria-label", COPY.close);
  var headings = el("div", "report-modal__headings");
  headings.append(heading, sub);
  head.append(headings, x);

  var form = el("form", "report-form");
  form.noValidate = true;

  var noteField = el("div", "form-field");
  var noteLabel = el("label", null, COPY.note);
  noteLabel.htmlFor = "report-note";
  var note = el("textarea", "report__note");
  note.id = "report-note";
  note.rows = 5;
  note.setAttribute("placeholder", COPY.describe);
  noteField.append(noteLabel, note);

  var shotsLabel = el("p", "report__shots-label", COPY.shots);
  var shots = el("div", "report__shots");
  shots.setAttribute("aria-disabled", "true");
  var plus = el("span", "report__shots-plus", "+");
  plus.setAttribute("aria-hidden", "true");
  shots.append(plus, el("p", "report__shots-note", COPY.staged));

  var contactField = el("div", "form-field");
  var contactLabel = el("label", null, COPY.contact);
  contactLabel.htmlFor = "report-contact";
  var contact = el("input", "report__contact");
  contact.id = "report-contact";
  contact.type = "tel";
  contact.autocomplete = "tel";
  contact.setAttribute("placeholder", "+233 00 000 0000");
  contactField.append(contactLabel, contact);

  var hp = el("div", "hp");
  hp.setAttribute("aria-hidden", "true");
  var honeypot = doc.createElement("input");
  honeypot.type = "text";
  honeypot.name = "_site";
  honeypot.tabIndex = -1;
  honeypot.autocomplete = "off";
  honeypot.setAttribute("inputmode", "none");
  hp.appendChild(honeypot);

  var error = el("p", "report__error", COPY.failed);
  error.setAttribute("role", "status");
  error.setAttribute("aria-live", "polite");
  error.hidden = true;

  var done = el("p", "form-success", COPY.sent);
  done.setAttribute("role", "status");
  done.setAttribute("aria-live", "polite");
  done.hidden = true;

  var foot = el("div", "report-modal__foot");
  var send = el("button", "btn btn--primary report__send", COPY.send);
  send.type = "submit";
  send.disabled = true;

  form.append(noteField, shotsLabel, shots, contactField, hp, error, foot, done);
  card.append(head, form);
  modal.append(scrim, card);

  /* 404.html wears the shell but loads no assistant, and an action that opens nothing
     is worse than no action. The toggle is the only honest test of whether there is
     someone to ask. */
  var toggle = doc.querySelector(".chat-widget__toggle");
  if (toggle) {
    var ask = el("button", "report__ask", COPY.ask);
    ask.type = "button";
    ask.addEventListener("click", function () {
      close(false);
      doc.dispatchEvent(new CustomEvent("bh-chat-open"));
    });
    foot.appendChild(ask);
  }
  foot.appendChild(send);

  doc.body.appendChild(pair);
  doc.body.appendChild(modal);

  // ── opening and closing ─────────────────────────────────────────────────────
  var lastFocus = null;

  function focusables() {
    return Array.prototype.slice.call(card.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([type="hidden"])'))
      .filter(function (node) {
        return node.offsetParent !== null && !node.closest(".hp");
      });
  }

  function open() {
    if (!modal.hidden) return;
    lastFocus = doc.activeElement;
    /* Taking the scrollbar away would shift everything behind the card by its width;
       pay that width back as padding so the page does not move under the visitor. */
    var gap = window.innerWidth - doc.documentElement.clientWidth;
    if (gap > 0) doc.body.style.paddingRight = gap + "px";
    modal.hidden = false;
    doc.body.classList.add("report-open");
    note.focus({ preventScroll: true });
  }

  function close(restore) {
    if (modal.hidden) return;
    modal.hidden = true;
    doc.body.classList.remove("report-open");
    doc.body.style.paddingRight = "";
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  pill.addEventListener("click", open);
  x.addEventListener("click", function () { close(); });
  scrim.addEventListener("click", function () { close(); });

  doc.addEventListener("keydown", function (e) {
    // The key works with the dialog shut, which is the whole point of printing it.
    if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey) && e.altKey) {
      e.preventDefault();
      open();
      return;
    }
    if (modal.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ── sending ─────────────────────────────────────────────────────────────────
  var busy = false;

  function text() { return note.value.trim(); }

  function sync() { send.disabled = !text(); }

  note.addEventListener("input", sync);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || form.dataset.sent) return;
    if (!text()) { note.focus({ preventScroll: true }); return; }

    busy = true;
    form.setAttribute("aria-busy", "true");
    send.disabled = true;

    var payload = {
      topic: "other",
      article: "site",
      message: text().slice(0, MAX_MESSAGE),
      contact: String(contact.value || "").trim().slice(0, MAX_CONTACT),
      _site: String(honeypot.value || ""),
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

  function finish(ok) {
    busy = false;
    form.removeAttribute("aria-busy");
    if (!ok) {
      /* The note stays exactly as it was typed. A visitor who has just written a
         paragraph will not write it again for a send that looked like it swallowed it. */
      reveal(error, true);
      sync();
      return;
    }
    reveal(error, false);
    form.dataset.sent = "1";
    note.disabled = true;
    contact.disabled = true;
    send.disabled = true;
    reveal(done, true);
  }
})();
