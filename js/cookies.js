/*
  Cookie preferences, in the shape twilio uses: a footer link that opens a
  centre listing each category, plus a first-visit notice.

  What this site actually does today is small, and the copy says exactly that —
  the two optional categories are recorded so that anything added later can read
  the choice, not because a tracker is already running. Read the state with
  window.bhConsent(); it fires a "bhconsent" event whenever it changes.
*/
(() => {
  "use strict";
  const doc = document;
  const KEY = "brownhub-consent";

  const CATEGORIES = [
    {
      id: "necessary",
      name: "Strictly necessary",
      desc: "Always on. Your chosen language, the dark or light theme and a signed-in client session are kept in your own browser so the site can remember them. Without them the pages still load, but they forget you between visits.",
      locked: true
    },
    {
      id: "analytics",
      name: "Analytics",
      desc: "Would tell us which pages get read and where people leave. BrownHub loads no analytics script on this site today, so saving this choice changes nothing until one is added."
    },
    {
      id: "advertising",
      name: "Advertising and affiliate",
      desc: "Cookies a partner might set when you follow an affiliate link away from this site. No advertising or affiliate script runs here today, and turning this off does not stop a partner setting their own cookie once you visit them."
    }
  ];

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw === "object") {
        return { necessary: true, analytics: !!raw.analytics, advertising: !!raw.advertising,
                 decided: !!raw.decided, at: raw.at || "" };
      }
    } catch (e) { /* a blocked or corrupt entry simply means "not decided yet" */ }
    return { necessary: true, analytics: false, advertising: false, decided: false, at: "" };
  }

  let state = read();

  function save(patch) {
    state = Object.assign({}, state, patch, { necessary: true, decided: true, at: new Date().toISOString() });
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    doc.dispatchEvent(new CustomEvent("bhconsent", { detail: Object.assign({}, state) }));
    syncToggles();
    hideNotice();
  }

  window.bhConsent = () => Object.assign({}, state);

  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ---------- first-visit notice ---------- */
  let notice;
  function buildNotice() {
    notice = el("div", "cookie-notice");
    notice.setAttribute("role", "region");
    notice.setAttribute("aria-label", "Cookie notice");
    const inner = el("div", "cookie-notice__inner");
    inner.appendChild(el("p", "cookie-notice__text",
      "This site keeps your language and theme in your browser and nothing else. " +
      "No analytics or advertising cookie is placed here."));
    const btns = el("div", "cookie-notice__btns");
    const ok = el("button", "btn btn--primary btn--sm"); ok.type = "button"; ok.textContent = "Accept all";
    const no = el("button", "btn btn--ghost btn--sm"); no.type = "button"; no.textContent = "Reject non-essential";
    const pref = el("button", "btn btn--text btn--sm"); pref.type = "button"; pref.textContent = "Cookie preferences";
    ok.addEventListener("click", () => save({ analytics: true, advertising: true }));
    no.addEventListener("click", () => save({ analytics: false, advertising: false }));
    pref.addEventListener("click", open);
    btns.append(ok, no, pref);
    inner.appendChild(btns);
    const close = el("button", "cookie-notice__close");
    close.type = "button"; close.setAttribute("aria-label", "Dismiss this notice"); close.textContent = "×";
    close.addEventListener("click", () => save({ analytics: false, advertising: false }));
    inner.appendChild(close);
    notice.appendChild(inner);
    doc.body.appendChild(notice);
  }
  const hideNotice = () => { if (notice) notice.classList.add("is-gone"); };

  /* ---------- preferences centre ---------- */
  let modal, lastFocus;
  function buildModal() {
    modal = el("div", "cookie-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "cookie-modal-title");
    modal.hidden = true;

    const scrim = el("div", "cookie-modal__scrim");
    scrim.addEventListener("click", close);

    const card = el("div", "cookie-modal__card");
    const head = el("div", "cookie-modal__head");
    const h2 = el("h2"); h2.id = "cookie-modal-title"; h2.textContent = "Cookie preferences";
    const x = el("button", "cookie-modal__close"); x.type = "button";
    x.setAttribute("aria-label", "Close"); x.textContent = "×";
    x.addEventListener("click", close);
    head.append(h2, x);
    card.appendChild(head);
    card.appendChild(el("p", "cookie-modal__intro",
      "Choose what may be stored or loaded while you use this site. You can change " +
      "this from the footer at any time, and the full picture is in the privacy policy."));

    const list = el("ul", "cookie-cats");
    CATEGORIES.forEach((c) => {
      const li = el("li", "cookie-cat");
      const top = el("div", "cookie-cat__top");
      const name = el("h3", "cookie-cat__name"); name.textContent = c.name;
      top.appendChild(name);
      if (c.locked) {
        const on = el("span", "cookie-cat__always"); on.textContent = "Always on";
        top.appendChild(on);
      } else {
        const sw = el("label", "cookie-switch");
        const input = doc.createElement("input");
        input.type = "checkbox"; input.dataset.cat = c.id;
        input.checked = !!state[c.id];
        input.addEventListener("change", () => {
          save({ [c.id]: input.checked });
        });
        const knob = el("span", "cookie-switch__track");
        sw.append(input, knob);
        sw.setAttribute("aria-label", c.name);
        top.appendChild(sw);
      }
      li.appendChild(top);
      li.appendChild(el("p", "cookie-cat__desc", c.desc));
      list.appendChild(li);
    });
    card.appendChild(list);

    const foot = el("div", "cookie-modal__foot");
    const all = el("button", "btn btn--primary btn--sm"); all.type = "button"; all.textContent = "Save preferences";
    const none = el("button", "btn btn--ghost btn--sm"); none.type = "button"; none.textContent = "Reject non-essential";
    all.addEventListener("click", () => {
      const on = {};
      card.querySelectorAll("input[data-cat]").forEach((i) => { on[i.dataset.cat] = i.checked; });
      save(on);
      close();
    });
    none.addEventListener("click", () => { save({ analytics: false, advertising: false }); close(); });
    foot.append(all, none);
    const link = el("a", "cookie-modal__link", "Read the privacy policy");
    link.href = "privacy.html";
    foot.appendChild(link);
    card.appendChild(foot);

    modal.append(scrim, card);
    doc.body.appendChild(modal);
  }

  function syncToggles() {
    if (!modal) return;
    modal.querySelectorAll("input[data-cat]").forEach((i) => { i.checked = !!state[i.dataset.cat]; });
  }

  function open() {
    if (!modal) buildModal();
    syncToggles();
    lastFocus = doc.activeElement;
    modal.hidden = false;
    doc.body.classList.add("no-scroll");
    const first = modal.querySelector("input[data-cat]") || modal.querySelector(".cookie-modal__close");
    if (first) first.focus();
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    doc.body.classList.remove("no-scroll");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) close();
  });

  doc.addEventListener("click", (e) => {
    const trigger = e.target.closest && e.target.closest("[data-cookie-preferences]");
    if (trigger) { e.preventDefault(); open(); }
  });

  /* the nav search offers a "Cookie preferences" result with no page of its own */
  doc.addEventListener("bh-cookie-open", open);

  function init() {
    if (state.decided) return;
    buildNotice();
    void notice.offsetWidth;            /* commit the hidden frame, or it cannot slide up */
    notice.classList.add("is-in");
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
