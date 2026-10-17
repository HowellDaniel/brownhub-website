(function () {
  var doc = document;
  var root = doc.documentElement;

  function tr(s) { return (window.I18N && I18N.t) ? I18N.t(s) : s; }

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
  var KEY = "brownhub-install";
  var deferred = null;
  var pill = null;

  var phone = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  // The printed and on-screen code points at ?app=1, which is the one address that
  // reopens this card on the phone that arrives through it — a phone that has
  // already refused the app once would otherwise stay silent.
  var asked = /[?&]app=1(?:&|$)/.test(location.search);

  function remembered() {
    try { return localStorage.getItem(KEY) === "off"; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(KEY, "off"); } catch (e) {}
  }

  function dismiss() {
    remember();
    if (pill) pill.hidden = true;
    reserve();
  }

  /* The bottom of the screen belongs to the queue: the install pill, the chat bubble,
     the cookie notice and the quote card are all fixed to it, and on a phone the pill
     is full width. The pinned stages end their own screenful at that same edge, so
     measured at 390x844 the row of stones that jumps between pictures sat under the
     pill — out of sight and out of reach of a thumb. This is the one number that tells
     the page how much of the bottom the queue owns; the stage gives it back. */
  var reserved = null;
  /* The assistant's teaser hangs over the top of the bubble it comes out of, so a
     stage that stops at the bubble alone still has a speech bubble printed across
     its row of stones. It is charged by its own edge, not the button's. */
  var QUEUE = ".install, .chat-widget__toggle, .chat-widget__teaser, .cookie-notice, .leadask";
  function reserve() {
    var owned = 0;
    /* Every member of the queue is fixed to the bottom edge, so the room it owns is the
       distance from its own top down to that edge — and that is asked of the screen, not
       read from the height token a notice published on the way in. A dismissed notice
       leaves its token on <html> and takes its body out, so a token would keep charging a
       stage for a ghost; the rect only charges what a visitor can still see. The pill
       lifts itself over the notices, so whichever member sits highest is the edge the
       stage has to stop below. */
    [].forEach.call(
      doc.querySelectorAll(QUEUE),
      function (n) {
        if (n.hidden || n.getAttribute("aria-hidden") === "true") return;
        if (getComputedStyle(n).visibility === "hidden") return;
        var r = n.getBoundingClientRect();
        if (r.height < 1 || r.top >= innerHeight) return;
        owned = Math.max(owned, Math.round(innerHeight - r.top));
      });
    var next = owned + "px";
    if (reserved === next) return;
    reserved = next;
    root.style.setProperty("--queue-h", next);
    dispatchEvent(new CustomEvent("queue-change"));
  }

  function show(how) {
    if (pill || standalone || (remembered() && !asked)) return;
    pill = doc.createElement("div");
    pill.className = "install" + (how === "qr" ? " install--qr" : "");
    pill.setAttribute("role", "region");
    pill.setAttribute("aria-label", tr("Install the BrownHub Studio app"));

    var text = doc.createElement("p");
    text.textContent = how === "ios" ? tr("On iPhone: tap Share, then Add to Home Screen.")
      : how === "qr" ? tr("Scan this with your phone camera to open BrownHub Studio.")
      : tr("Install the BrownHub Studio app");
    pill.appendChild(text);

    if (how === "qr") {
      // A still image rather than a canvas drawn at run time: it is the same file
      // the studio prints on a card, so what a visitor scans is what we verified.
      var code = doc.createElement("img");
      code.className = "install__qr";
      code.src = "images/qr-app.png?v=2";
      code.width = 104;
      code.height = 104;
      code.alt = tr("QR code linking to the BrownHub Studio app");
      pill.appendChild(code);
    }

    if (how === "chrome" && deferred) {
      var go = doc.createElement("button");
      go.type = "button";
      go.className = "btn btn--primary install__go";
      go.textContent = tr("Install");
      go.addEventListener("click", function () {
        deferred.prompt();
        deferred.userChoice.then(function () {
          deferred = null;
          dismiss();
        });
      });
      pill.appendChild(go);
    }

    var no = doc.createElement("button");
    no.type = "button";
    no.className = "install__no";
    no.setAttribute("aria-label", tr("Not now"));
    no.textContent = "\u00d7";
    no.addEventListener("click", dismiss);
    pill.appendChild(no);

    doc.body.appendChild(pill);
    pill.classList.add("install--in");
    /* The pill arrives with its own entrance transform, and the notices it queues
        behind can land a moment later, so the reservation is read once now and once
        when the move has finished. */
    requestAnimationFrame(reserve);
    setTimeout(reserve, 700);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    show("chrome");
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    dismiss();
  });

  // Safari on iOS never fires beforeinstallprompt, so the pill carries the gesture
  // instead of a button. Desktop browsers that never fire it either — Safari and
  // Firefox on the Mac — get the code to scan, which is how a visitor on a laptop
  // ends up with the app on the phone in their pocket.
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  setTimeout(function () {
    if (deferred) show("chrome");
    else if (ios && !window.MSStream) show("ios");
    else if (!phone) show("qr");
    else if (asked) show("plain");
  }, 2500);

  /* The rest of the queue is not ours: the chat bubble, the cookie notice and the quote
     card are built by their own scripts, so this watches them instead of asking them to
     report. Body-level additions are rare — a notice, the bubble, a modal — and the write
     is guarded, so a change that does not move the bottom edge costs the page nothing it
     would not have paid anyway. The two notices are watched for the moment they fold
     away, because that is when their published height stops describing the screen. */
  function own(n) {
    if (!n || n.__queued) return;
    if (typeof ResizeObserver === "function") {
      n.__queued = new ResizeObserver(reserve);
      n.__queued.observe(n);
    }
    n.addEventListener("transitionend", reserve);
  }
  addEventListener("resize", reserve, { passive: true });
  addEventListener("i18n-applied", reserve);
  if (typeof MutationObserver === "function") {
    var queued = false, widget = null;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        [].forEach.call(doc.querySelectorAll(QUEUE), own);
        /* The teaser is not a body-level addition: it is built inside the assistant
           twenty seconds in, while a visitor may be mid-scroll. The widget is watched
           for its own children so the bubble arriving and leaving both move the edge. */
        if (!widget) {
          var w = doc.querySelector(".chat-widget");
          if (w) {
            widget = new MutationObserver(reserve);
            widget.observe(w, { childList: true });
          }
        }
        reserve();
      });
    }).observe(doc.body, { childList: true });
  }
  addEventListener("load", function () { own(pill); reserve(); }, { once: true });
  reserve();
})();
