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
})();
