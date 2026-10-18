(function () {
  var doc = document;
  var root = doc.documentElement;

  function tr(s) { return (window.I18N && I18N.t) ? I18N.t(s) : s; }

  var standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
  var KEY = "brownhub-install";
  var deferred = null;
  var pill = null;

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    /* An installed copy asks for its own new build.
       A service worker is otherwise only compared against the network when a document
       starts up, so a phone that keeps BrownHub in the app switcher — which is exactly
       what an installed app is for — never re-reads /sw.js, and that copy goes on
       serving the day-old shell out of its cache while the browser tab, which is opened
       fresh every time, looks fine. Nothing here reloads the visitor's page: the worker
       already answers navigations from the network first, so a re-read only moves the
       fallback it holds and the headers it injects onto the next one. */
    var swreg = null;
    function recheck() {
      if (swreg && swreg.update) swreg.update().catch(function () {});
    }
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/sw.js")
        .then(function (r) { swreg = r; watchBuild(r); })
        .catch(function () {});
    });
    document.addEventListener("visibilitychange", function () {
      if (!doc.hidden) recheck();
    });
    addEventListener("focus", recheck);
    /* A tablet pinned to a wall, or a phone left on a desk with the screen kept awake
       by a client's quote page, never fires either event above. */
    setInterval(recheck, 10 * 60 * 1000);

    /* A standing-by build is announced, not imposed.
       The worker used to call skipWaiting() the moment it finished installing, so the
       studio's new code arrived underneath a phone that was mid-scroll. It now waits, and
       this is the card that asks. `waiting` is a build that arrived while the app was shut
       — the common case, since the card is up the second the app opens; `updatefound` is
       one that arrives while it is running, which the re-check above goes and finds. A
       browser tab is not asked (it re-reads the network on every navigation anyway) unless
       it arrives with ?upd=1, which is how the card is proven on a desk. */
    var BKEY = "brownhub-build";
    var buildCard = null;
    var takingBuild = false;
    function showBuild() {
      if (buildCard) return;
      if (!standalone && !/[?&]upd=1(?:&|$)/.test(location.search)) return;
      try { if (sessionStorage.getItem(BKEY) === "off") return; } catch (e) {}
      var msg = tr("A new version of BrownHub Studio is ready.");
      buildCard = doc.createElement("div");
      buildCard.className = "install install--build install--in";
      buildCard.setAttribute("role", "region");
      buildCard.setAttribute("aria-label", msg);
      /* One card owns the bottom edge: an install prompt left standing here would sit on
         top of this one, and a visitor being asked to update has already installed. */
      if (pill) pill.hidden = true;

      var line = doc.createElement("p");
      var go = doc.createElement("button");
      var no = doc.createElement("button");
      /* The worker answers over the network and the dictionary does too, and whichever
         lands first builds this card — so the words are painted by a function the
         translation event calls again, not by one read taken here. */
      function paint() {
        var m = tr("A new version of BrownHub Studio is ready.");
        line.textContent = m;
        go.textContent = tr("Update");
        no.setAttribute("aria-label", tr("Not now"));
        buildCard.setAttribute("aria-label", m);
      }
      paint();
      addEventListener("i18n-applied", paint);
      buildCard.appendChild(line);

      go.type = "button";
      go.className = "btn btn--primary install__go";
      go.addEventListener("click", function () {
        if (!swreg || !swreg.waiting) { location.reload(); return; }
        takingBuild = true;
        swreg.waiting.postMessage("skip-waiting");
        /* A worker that is already activating on its own never answers the message, so
           the card cannot simply wait on controllerchange forever. */
        setTimeout(function () { if (takingBuild) location.reload(); }, 4000);
      });
      buildCard.appendChild(go);

      no.type = "button";
      no.className = "install__no";
      no.textContent = "\u00d7";
      no.addEventListener("click", function () {
        try { sessionStorage.setItem(BKEY, "off"); } catch (e) {}
        buildCard.hidden = true;
        reserve();
      });
      buildCard.appendChild(no);

      doc.body.appendChild(buildCard);
      own(buildCard);
      requestAnimationFrame(reserve);
      setTimeout(reserve, 700);
    }
    function watchBuild(reg) {
      if (reg.waiting) showBuild();
      reg.addEventListener("updatefound", function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", function () {
          /* With no controller there is no older build for this one to wait behind — that
             is a first visit, and the worker activates on its own. */
          if (w.state === "installed" && navigator.serviceWorker.controller) showBuild();
        });
      });
    }
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!takingBuild) return;
      takingBuild = false;
      location.reload();
    });
  }

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
    /* A build card already standing here would be covered by this one — the worker can
       answer before the 2.5 s timer that brings the install prompt in. */
    if (pill || buildCard || standalone || (remembered() && !asked)) return;
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
