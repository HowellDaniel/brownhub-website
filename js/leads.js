/*
  Two records the studio keeps, in one file, because both are about what happens
  after a stranger lands on a page:

  1. A visit. One anonymous row per page load, sent only when the visitor has
     allowed "Analytics" in the cookie centre. Nothing is stored on their device
     for it and no cookie is set — the row holds a path, a language, a rough
     screen size, the host they came from and a daily hash, and the Edge Function
     that writes it never keeps an IP address.
  2. A quote ask. A card in the corner that offers to take a name and a WhatsApp
     number, for people who want a price but not a whole form. Dismissed once, it
     does not come back for a month; answered, it never comes back.

  Both go through /functions/v1/capture rather than straight to the database: the
  tables have no insert policy for a browser key at all, so a bot cannot post to
  them directly — see supabase/functions/capture/index.ts.
*/
(function () {
  "use strict";

  var doc = document;
  var EP = "https://rmvyrfqyxgupwuzxadyx.supabase.co/functions/v1/capture";
  var WA = "https://wa.me/233502954541";
  // The card is a courtesy, not a toll: it waits for a visitor to actually read
  // something, and it never appears on the page that already asks for everything.
  var KEY = "brownhub-leadask";
  var COOLDOWN_MS = 30 * 86400e3;
  var MAX_SHOWN = 2;
  var PATIENCE_MS = 22000;
  var SCROLL_PART = 0.45;
  // A bot fills every field it can find, including the off-screen one, and does it
  // in well under a second. Same two gates the enquiry form runs on (js/main.js).
  var HUMAN_MS = 2500;
  var SKIP = ["contact.html", "privacy.html", "legal.html", "security.html", "404.html", "offline.html"];

  function here() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function consent() {
    return typeof window.bhConsent === "function" ? window.bhConsent() : { decided: false, analytics: false, advertising: false };
  }

  function remember(patch) {
    var rec = read();
    for (var k in patch) rec[k] = patch[k];
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* storage blocked: the card simply asks again next time */ }
    return rec;
  }

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw === "object") {
        return {
          shown: Number(raw.shown) || 0,
          dismissedAt: Number(raw.dismissedAt) || 0,
          answered: !!raw.answered,
          sent: 0
        };
      }
    } catch (e) { /* a corrupt entry means we have never asked */ }
    return { shown: 0, dismissedAt: 0, answered: false, sent: 0 };
  }

  var state = read();

  /* ------------------------------------------------------------------ visits */

  var viewSent = false;

  function deviceClass() {
    var w = Math.max(window.innerWidth || 0, 1);
    return w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop";
  }

  function sendVisit() {
    if (viewSent) return;
    viewSent = true;
    var body = JSON.stringify({
      page: location.pathname,
      lang: doc.documentElement.lang || "en",
      referrer: doc.referrer || "",
      device: deviceClass()
    });
    // keepalive so a fast bounce still lands; no credentials, since there is
    // nothing here that should travel with a session.
    fetch(EP + "/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body,
      credentials: "omit",
      keepalive: true
    }).catch(function () { /* a lost count costs the studio one row, not the visitor anything */ });
  }

  function wireVisits() {
    if (SKIP.indexOf(here()) > -1) return;
    var c = consent();
    // Only an explicit "yes" counts. An unanswered notice is not agreement, and a
    // visitor who rejected never has anything sent at all.
    if (c.decided && c.analytics) { sendVisit(); return; }
    doc.addEventListener("bhconsent", function (e) {
      var d = (e && e.detail) || consent();
      if (d.analytics) sendVisit();
    });
  }

  /* ------------------------------------------------------------- quote card */

  var card = null, openedAt = Date.now(), busy = false;

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function field(labelText, name, type, attrs) {
    var wrap = el("div", "leadask__field");
    var label = el("label", null, labelText);
    var inp = doc.createElement("input");
    inp.name = name;
    inp.type = type || "text";
    inp.required = true;
    for (var k in (attrs || {})) {
      if (k === "id") inp.id = attrs[k];
      else inp.setAttribute(k, attrs[k]);
    }
    label.appendChild(inp);
    wrap.appendChild(label);
    return wrap;
  }

  function build() {
    card = el("section", "leadask");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-labelledby", "leadask-title");

    var x = el("button", "leadask__x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Dismiss this question");
    x.addEventListener("click", function () { dismiss(); });
    card.appendChild(x);

    card.appendChild(el("p", "leadask__eyebrow", "Get a quote"));
    card.appendChild(el("h2", "leadask__title",
      "Tell us your name and WhatsApp number, and we'll send you a design quote."));

    var form = el("form", "leadask__form");
    form.appendChild(field("Name", "name", "text", {
      autocomplete: "name", maxlength: "120", minlength: "2"
    }));
    var phone = field("WhatsApp number *", "whatsapp", "tel", {
      autocomplete: "tel", inputmode: "tel",
      pattern: "[0-9+][0-9\\s\\(\\)\\-]{5,18}"
    });
    phone.appendChild(el("p", "leadask__hint", "This is where we reply, so give the number on your WhatsApp."));
    form.appendChild(phone);

    // The honeypot: same off-screen shape as the enquiry form's, same CSS class.
    var hp = el("div", "hp");
    hp.setAttribute("aria-hidden", "true");
    var hpLabel = el("label");
    hpLabel.setAttribute("for", "leadask-site");
    hpLabel.appendChild(doc.createTextNode(" "));
    var hpInp = doc.createElement("input");
    hpInp.type = "text"; hpInp.id = "leadask-site"; hpInp.name = "_site";
    hpInp.tabIndex = -1;
    hpInp.setAttribute("autocomplete", "off");
    hpInp.setAttribute("inputmode", "none");
    hp.append(hpLabel, hpInp);
    form.appendChild(hp);

    var go = el("button", "btn btn--primary btn--block leadask__go", "Send it on WhatsApp");
    go.type = "submit";
    form.appendChild(go);
    form.appendChild(el("p", "leadask__fine", "We only use this to reply."));

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(form, hpInp, go);
    });
    card.appendChild(form);

    var alt = el("a", "leadask__alt", "or send a full brief");
    alt.href = "contact.html";
    card.appendChild(alt);
  }

  function waHref(name, interest) {
    var text = "Hello BrownHub! My name is " + name + "." +
      (interest ? " I'm interested in: " + interest + "." : "") +
      " I sent this from your website — could you send me a design quote?";
    return WA + "?text=" + encodeURIComponent(text);
  }

  function send(form, hpInp, go) {
    if (busy) return;
    if (!form.checkValidity()) {
      // A dispatched submit skips native validation; this catches a submit() call
      // from a script, which would otherwise post a half-empty lead.
      form.reportValidity();
      return;
    }
    var data = new FormData(form);
    var honeypot = String(data.get("_site") || "");
    var name = String(data.get("name") || "").trim().slice(0, 120);
    var whatsapp = String(data.get("whatsapp") || "").trim().slice(0, 32);
    if (!name || !whatsapp) return;
    busy = true;
    go.disabled = true;

    // The card never claims a lead was filed when it was not: on any failure the
    // button becomes the WhatsApp link, which works whatever the network does.
    function handoff() {
      var done = el("div", "leadask__done");
      done.appendChild(el("strong", null, "Message sent successfully!"));
      done.appendChild(el("p", null, "We'll get back to you within some few minutes. Thank you! 🙏 😊"));
      var a = el("a", "btn btn--primary btn--block", "Continue to WhatsApp");
      a.href = waHref(name, "");
      a.target = "_blank";
      a.rel = "noopener";
      done.appendChild(a);
      form.replaceWith(done);
      remember({ answered: true });
      setTimeout(function () { a.focus(); }, 60);
    }

    function fallback() {
      busy = false;
      go.disabled = false;
      go.type = "button";
      go.addEventListener("click", function () {
        window.open(waHref(name, ""), "_blank", "noopener");
      });
    }

    fetch(EP + "/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        name: name,
        whatsapp: whatsapp,
        _site: honeypot,
        page: location.pathname,
        lang: doc.documentElement.lang || "en",
        referrer: doc.referrer || ""
      }),
      signal: (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(8000) : undefined
    }).then(function (r) {
      // A honeypotted post comes back 200 {ok:true} from the function, so the page
      // cannot tell a filed lead from a quietly dropped one — and does not need to.
      if (r && r.ok) handoff(); else fallback();
    }).catch(fallback);
  }

  function dismiss() {
    remember({ shown: state.shown + 1, dismissedAt: Date.now() });
    hide();
  }

  function hide() {
    if (!card) return;
    doc.documentElement.removeAttribute("data-leadask");
    card.classList.add("is-gone");
    publishHeight();
    setTimeout(function () { if (card) { card.remove(); card = null; } }, 420);
  }

  // The install pill lifts over this card the same way it lifts over the cookie
  // notice, so the three never stack on top of one another. What it publishes is
  // the room the card takes from the bottom of the screen up to its own top edge,
  // since that is the figure the pill has to clear — the card's height alone would
  // leave the pill sitting across the card's lower half. The card's own height plus
  // its resolved bottom offset gives that same figure without reading a bounding
  // rect, which matters because the card slides up 14px as it appears and a rect
  // caught mid-slide parks the pill straight across the card's top edge.
  function publishHeight() {
    var h = 0;
    if (card && !card.classList.contains("is-gone")) {
      h = Math.round(card.offsetHeight + (parseFloat(window.getComputedStyle(card).bottom) || 0));
    }
    doc.documentElement.style.setProperty("--lead-h", h + "px");
  }

  function eligible() {
    if (SKIP.indexOf(here()) > -1) return false;
    if (state.answered) return false;
    if (state.shown >= MAX_SHOWN) return false;
    if (state.dismissedAt && Date.now() - state.dismissedAt < COOLDOWN_MS) return false;
    return true;
  }

  function show() {
    if (!card) { build(); doc.body.appendChild(card); }
    // The assistant's teaser lives in the same corner on a phone and paints over
    // this card's own fields; the CSS stands it down while the name is marked.
    doc.documentElement.setAttribute("data-leadask", "open");
    void card.offsetWidth;
    card.classList.add("leadask--in");
    publishHeight();
    if (window.ResizeObserver) new ResizeObserver(publishHeight).observe(card);
    remember({ shown: state.shown + 1 });
  }

  function wireAsk() {
    if (!eligible()) return;
    // Wait until the visitor has dealt with the cookie notice: asking for a name
    // and a number while a consent bar is still on screen is bad order, and the
    // honest moment to ask is once they have answered it.
    var start = consent().decided ? 0 : null;
    var triggered = false;
    function fire() {
      if (triggered || !eligible()) return;
      triggered = true;
      show();
    }
    function scrolled() {
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      return max > 400 && window.scrollY / max >= SCROLL_PART;
    }
    // Two ways to earn the card: reading down the page, or simply still being here.
    window.addEventListener("scroll", function () { if (scrolled() && Date.now() - openedAt > 4000) fire(); }, { passive: true });
    setTimeout(function () { if (consent().decided) fire(); }, PATIENCE_MS);
    if (start === null) {
      doc.addEventListener("bhconsent", function () {
        setTimeout(fire, PATIENCE_MS);
      }, { once: true });
    }
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && card && !card.classList.contains("is-gone")) dismiss();
    });
  }

  function init() {
    wireVisits();
    wireAsk();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
