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
    if (pill || standalone || remembered()) return;
    pill = doc.createElement("div");
    pill.className = "install";
    pill.setAttribute("role", "region");
    pill.setAttribute("aria-label", tr("Install the BrownHub app"));

    var text = doc.createElement("p");
    text.textContent = how === "ios" ? tr("On iPhone: tap Share, then Add to Home Screen.") : tr("Install the BrownHub app");
    pill.appendChild(text);

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
  // instead of a button.
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && !window.MSStream) setTimeout(function () { show("ios"); }, 2500);
})();
