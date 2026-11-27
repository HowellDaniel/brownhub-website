/*
  Problem feedback, everywhere on the site.

  A visitor whose price is wrong, whose link is dead or whose assistant will not answer
  is standing on a page that is not help.html, and until now the only way to tell the
  studio was to go and find help.html first. This is the way that needs no finding: a
  round question mark hung in the bottom-right corner of every page that wears the
  shell, opened by hand or by its own key.

  The copy rule is the one js/cookies.js writes under. Every sentence a visitor reads is
  painted here in its English source form, and translate.js — which watches the body for
  nodes added after it ran — repaints them in the language the visitor chose. The corner
  mark is the exception on purpose: "?" reads the same in Accra and in Warsaw, so it
  carries its words as an aria-label instead of as text. The keyboard hint is the other,
  and it is aria-hidden — ⌘⌥F is a picture of keys, not a sentence, and the keys differ
  by platform rather than by language. Because that hint is a promise, the binding listens
  for the physical key: macOS hands the browser the glyph Option types, so ⌥+F arrives as
  "ƒ" and a test against the letter "f" never fires on the machine the hint names.

  The note rides the capture endpoint and becomes a row the studio reads with its SMS.
  The pictures ride the mail rail the assistant already sends documents down, one POST per
  picture, because that single-file shape is the proven one and no bucket is opened for it.
  A screenshot that cannot be mailed says so in words beside a note that did arrive — a
  silent success is the one outcome that loses a visitor's evidence.
*/
(function () {
  "use strict";

  var doc = document;
  var FN = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1";
  var MAIL = "https://formsubmit.co/ajax/howelldaniel533@gmail.com";
  var MAX_MESSAGE = 2000;
  var MAX_CONTACT = 32;
  var SHOT_MAX = 10 * 1024 * 1024;
  var SHOT_CAP = 3;
  var SHOT_KIND = /^image\/(png|jpe?g|webp|gif|heic)$/;

  var COPY = {
    pill: "Problem feedback",
    help: "Help",
    title: "What would you like to share?",
    sub: "Tell us about a problem or suggestion so we can improve BrownHub Studio.",
    note: "Problem or suggestion (required)",
    describe: "Describe what happened, what you expected, and how to see it again.",
    shots: "Screenshots",
    shotsAdd: "Attach up to 3 pictures — PNG, JPG or WebP, up to 10 MB each",
    shotsDrop: "Drop pictures here, or paste them",
    shotsReject: "That will not do — a picture up to 10 MB, three at most.",
    shotsRemove: "Remove this picture",
    shotsBusy: "Sending your screenshots…",
    shotsPartial: "Your words reached the studio. The screenshots did not — attach them on the contact page.",
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

  /* Checked here, in the browser the file arrived in, rather than hoped for at the mail
     form: a 40 MB PNG or a video is dropped by FormSubmit without a word, and a visitor
     who was told it sent would have lost the one picture that showed the problem. */
  function acceptsShot(file) {
    return !!file && SHOT_KIND.test(file.type || "") && file.size <= SHOT_MAX;
  }

  /* The mail form prints this field as the envelope subject, so it is built from the page
     the visitor is standing on — never from the words they typed or the number they left. */
  function shotSubject(path, total, index) {
    return "BrownHub screenshot " + index + " of " + total + " from " + path;
  }

  function megabytes(bytes) {
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + " MB"
      : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function timed(ms) {
    return window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
  }

  // ── the badge ───────────────────────────────────────────────────────────────
  var apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
  var pair = el("div", "report-pair");
  var pill = el("button", "report-pill");
  pill.type = "button";
  /* One mark, not a sentence: the reference hangs a question mark in the corner and a
     visitor reads it in any language. The words it replaces are kept where an AT user is
     still told what they are pressing. */
  pill.appendChild(el("span", "report-pill__mark", "?"));
  pill.setAttribute("aria-label", COPY.pill);
  pill.title = COPY.pill;
  pair.appendChild(pill);

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
  /* The shortcut is printed where there is room for it now that the corner holds only a
     mark. Keys are a picture, not a sentence, so this stays out of the dictionaries and
     out of the screen reader — and CSS keeps it off any device with no keyboard. */
  var hint = el("kbd", "report-modal__key", apple ? "⌘ + ⌥ + F" : "Ctrl + Alt + F");
  hint.setAttribute("aria-hidden", "true");
  headings.append(heading, sub, hint);
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
  var shotsOpen = el("button", "report__shots-open", "+");
  shotsOpen.type = "button";
  shotsOpen.setAttribute("aria-label", COPY.shotsAdd);
  var shotsNote = el("p", "report__shots-note", COPY.shotsAdd);
  /* The drop line replaces the caption only while a picture is actually being dragged:
     a tile that reads "drop pictures here" at rest advertises a gesture nobody is making. */
  var shotsDropLine = el("p", "report__shots-note report__shots-note--drop", COPY.shotsDrop);
  shotsDropLine.hidden = true;
  var shotsRejectLine = el("p", "report__shots-reject", COPY.shotsReject);
  shotsRejectLine.setAttribute("role", "status");
  shotsRejectLine.setAttribute("aria-live", "polite");
  shotsRejectLine.hidden = true;
  var shotsStrip = el("div", "report__shots-strip");
  shotsStrip.hidden = true;
  /* Visually hidden, never removed: Safari ignores a programmatic click on an input that
     is not in the render tree, and .hp is the site's own hiding rule — present, painted
     nowhere, and still clickable. */
  var picker = doc.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/webp,image/gif,image/heic";
  picker.multiple = true;
  picker.className = "hp";
  picker.id = "report-shots";
  var picked = [];
  var urls = [];

  function paintShots() {
    for (var i = 0; i < urls.length; i++) {
      // Repainting throws every thumbnail away, so every blob URL it was drawn from goes too.
      if (urls[i]) URL.revokeObjectURL(urls[i]);
    }
    urls = [];
    shotsStrip.textContent = "";
    for (var j = 0; j < picked.length; j++) {
      var file = picked[j];
      var tag = el("div", "report__shots-tag");
      var thumb = el("img", "report__shots-thumb");
      thumb.alt = "";
      urls[j] = URL.createObjectURL(file);
      thumb.src = urls[j];
      var x = el("button", "report__shots-x", "×");
      x.type = "button";
      x.setAttribute("aria-label", COPY.shotsRemove);
      x.addEventListener("click", (function (at) {
        return function () { picked.splice(at, 1); addShots([]); };
      })(j));
      tag.append(thumb, el("b", null, file.name), el("em", null, megabytes(file.size)), x);
      shotsStrip.appendChild(tag);
    }
    shotsStrip.hidden = !picked.length;
  }

  function addShots(files) {
    var refused = 0;
    for (var i = 0; i < files.length; i++) {
      if (picked.length >= SHOT_CAP || !acceptsShot(files[i])) { refused++; continue; }
      picked.push(files[i]);
    }
    reveal(shotsRejectLine, refused > 0);
    paintShots();
  }

  function resetShots() {
    picked = [];
    addShots([]);
  }

  function openPicker() {
    if (picked.length < SHOT_CAP) picker.click();
  }

  shotsOpen.addEventListener("click", openPicker);
  shots.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("button")) return;
    openPicker();
  });
  picker.addEventListener("change", function () {
    var got = Array.prototype.slice.call(picker.files || []);
    // Cleared first: a picture taken away and chosen again is the same file, and an input
    // still holding it fires no change at all.
    picker.value = "";
    addShots(got);
  });
  shots.addEventListener("dragover", function (e) {
    e.preventDefault();
    shots.classList.add("report__shots--over");
    reveal(shotsNote, false);
    reveal(shotsDropLine, true);
    reveal(shotsRejectLine, false);
  });
  shots.addEventListener("dragleave", function () {
    shots.classList.remove("report__shots--over");
    reveal(shotsDropLine, false);
    reveal(shotsNote, true);
  });
  shots.addEventListener("drop", function (e) {
    e.preventDefault();
    shots.classList.remove("report__shots--over");
    reveal(shotsDropLine, false);
    reveal(shotsNote, true);
    var dt = e.dataTransfer;
    addShots(dt && dt.files ? Array.prototype.slice.call(dt.files) : []);
  });
  /* A screenshot reaches the clipboard by the dozen — Print Screen, Cmd-Shift-4 — and a
     dialog that makes a visitor save each one to disk to attach it is a dialog that loses it. */
  doc.addEventListener("paste", function (e) {
    if (modal.hidden) return;
    var files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length) return;
    e.preventDefault();
    addShots(Array.prototype.slice.call(files));
  });
  shots.append(shotsOpen, shotsNote, shotsDropLine, shotsRejectLine, shotsStrip, picker);

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

  /* The row and the pictures leave over two different rails, so they can fail apart. A
     visitor whose note arrived and whose evidence did not has to be told which half, or
     they will believe the studio has the picture. */
  var partial = el("p", "report__error report__error--partial", COPY.shotsPartial);
  partial.setAttribute("role", "status");
  partial.setAttribute("aria-live", "polite");
  partial.hidden = true;

  var mailing = el("p", "report__mailing", COPY.shotsBusy);
  mailing.setAttribute("role", "status");
  mailing.setAttribute("aria-live", "polite");
  mailing.hidden = true;

  var foot = el("div", "report-modal__foot");
  var help = el("a", "report__help", COPY.help);
  help.href = ROOT + "help.html";
  foot.appendChild(help);
  var send = el("button", "btn btn--primary report__send", COPY.send);
  send.type = "submit";
  send.disabled = true;

  form.append(noteField, shotsLabel, shots, contactField, hp, error, mailing, foot, done, partial);
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
    /* The home page's arrival card is a dialog with its own Tab trap, and this one answers
       to a key that works anywhere. Summoned while the card is up, both traps would be live
       at once and Tab would move a caret around a card the visitor cannot see — so the card
       is retired first, through its own close control, which is the only dismissal promo.js
       listens for. Nothing here reaches into the card's state. */
    var arrival = doc.querySelector("#home-promo:not([hidden]) .promo__close");
    if (arrival) arrival.click();
    /* The visitor was standing on a button inside a card that no longer exists; handing
       focus back there at close time strands the caret, so they go back to the badge. */
    lastFocus = arrival ? pill : doc.activeElement;
    /* Taking the scrollbar away would shift everything behind the card by its width;
       pay that width back as padding so the page does not move under the visitor. */
    var gap = window.innerWidth - doc.documentElement.clientWidth;
    if (gap > 0) doc.body.style.paddingRight = gap + "px";
    modal.hidden = false;
    doc.body.classList.add("report-open");
    /* A send locks its own fields, which is right while its thanks are on screen and wrong
       the moment the same visitor comes back for the second thing they remembered. */
    if (form.dataset.sent) {
      delete form.dataset.sent;
      note.disabled = false;
      contact.disabled = false;
      note.value = "";
      reveal(done, false);
      reveal(partial, false);
      resetShots();
    }
    sync();
    note.focus({ preventScroll: true });
  }

  function close(restore) {
    if (modal.hidden) return;
    modal.hidden = true;
    doc.body.classList.remove("report-open");
    doc.body.style.paddingRight = "";
    if (restore === false) return;
    /* A send that succeeded locks its own button, and focus cannot land on a disabled
       control — the visitor would be left with the caret in a dialog that has already
       closed. The same happens to a visitor who opened this by its key from the page
       body, because focusing the body is nothing at all. The badge is where they came
       from, so that is where they go back to. */
    var back = (lastFocus && lastFocus !== doc.body && !lastFocus.disabled) ? lastFocus : pill;
    back.focus({ preventScroll: true });
  }

  pill.addEventListener("click", open);
  x.addEventListener("click", function () { close(); });
  scrim.addEventListener("click", function () { close(); });

  /* macOS reports the glyph Option types, not the letter under the finger: Option+F on the
     US layout is "ƒ", and on a French keyboard the key marked F sits at the physical position
     the browser calls KeyG. So the physical code is the primary test and the typed glyphs are
     the fallback — either way the combination, not the character, is what opens the dialog. */
  var FEEDBACK_GLYPHS = { f: 1, F: 1, "ƒ": 1, "‡": 1 };

  function feedbackKey(e) {
    if (!(e.metaKey || e.ctrlKey) || !e.altKey) return false;
    if (e.code === "KeyF") return true;
    return Object.prototype.hasOwnProperty.call(FEEDBACK_GLYPHS, e.key || "");
  }

  doc.addEventListener("keydown", function (e) {
    // The key works with the dialog shut, which is the whole point of printing it.
    if (feedbackKey(e)) {
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
      signal: timed(8000)
    }).then(function (response) {
      return response.ok ? response.json().catch(function () { return null; }) : null;
    }).then(function (answer) {
      if (!(answer && answer.ok === true)) { finish("row"); return; }
      if (!picked.length) { finish("all"); return; }
      /* The note is filed first, because it is the part the studio reads as a number. The
         pictures follow on their own rail, and their failure is reported as theirs alone. */
      reveal(mailing, true);
      mailShots({ message: payload.message, page: payload.page }, function (shotsOk) {
        finish(shotsOk ? "all" : "shots");
      });
    }).catch(function () {
      finish("row");
    });
  });

  /* One POST per picture: this is the shape the assistant's documents already ride to the
     same address, and a second file under the same field name is an assumption about someone
     else's mail form. A picture the endpoint quietly dropped would read here as delivered. */
  function mailShot(file, meta, next) {
    var fd = new FormData();
    fd.append("picture", file);
    fd.append("message", meta.message);
    fd.append("_subject", meta.subject);
    fd.append("page", meta.page);
    fd.append("time", new Date().toISOString());
    fd.append("_captcha", "false");
    fd.append("_template", "table");
    go(0);
    function go(attempt) {
      fetch(MAIL, { method: "POST", body: fd, credentials: "omit", signal: timed(15000) })
        .then(function (r) { if (r && r.ok) { next(true); } else { retry(attempt); } })
        .catch(function () { retry(attempt); });
    }
    function retry(attempt) {
      // The same envelope goes out a second time, the way the voice note does — a FormSubmit
      // hiccup on a visitor's one screenshot is not worth a lost picture.
      if (attempt >= 1) { next(false); return; }
      setTimeout(function () { go(1); }, 1200);
    }
  }

  /* Sent one at a time so the "1 of 3" the subject carries is also the order they land in. */
  function mailShots(meta, next) {
    var files = picked.slice();
    var i = 0;
    var allOk = true;
    (function step() {
      if (i >= files.length) { next(allOk); return; }
      var at = i;
      mailShot(files[at], {
        message: meta.message,
        page: meta.page,
        subject: shotSubject(location.pathname, files.length, at + 1)
      }, function (ok) {
        if (!ok) allOk = false;
        i++;
        step();
      });
    })();
  }

  function finish(outcome) {
    busy = false;
    form.removeAttribute("aria-busy");
    reveal(mailing, false);
    if (outcome !== "row") form.dataset.sent = "1";
    if (outcome === "row") {
      /* The note stays exactly as it was typed, and so do the pictures: a visitor who has
         just written a paragraph will not write it again for a send that looked like it
         swallowed it. */
      reveal(error, true);
      sync();
      return;
    }
    reveal(error, false);
    note.disabled = true;
    contact.disabled = true;
    send.disabled = true;
    reveal(done, true);
    /* A half-delivered send keeps its thumbnails on screen — the visitor can see which
       pictures the studio is still missing, and the sentence says where to put them. */
    reveal(partial, outcome === "shots");
  }
})();
