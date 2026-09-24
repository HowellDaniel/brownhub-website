(function () {
  "use strict";

  // ===== Paste your Supabase project values here ==============================
  // 1. supabase.com -> New project (free tier), keep the email you choose private.
  // 2. SQL editor -> run sql/supabase-schema.sql once.
  // 3. Authentication -> Sign In / Up -> turn "Confirm email" OFF (new projects
  //    have no email sender yet), or set up SMTP if you want confirmation mails.
  // 4. Project Settings -> API Data -> copy the Project URL and the publishable
  //    key into the two lines below, then commit.
  var SB_URL = "https://rmvyrfqyxgupwuzxadyx.supabase.co";
  var SB_KEY = "sb_publishable_nfq7_vW3ajNQtMb0dq0BpQ_4I1CZM6x"; // publishable (anon) key: public by design, RLS guards the data
  // =============================================================================

  // Same-origin copy of @supabase/supabase-js 2.117.1 (sha256 dff1e545…a567),
  // fetched from the npm tarball's dist/umd/supabase.js and served from the site.
  var SDK_URL = "js/vendor/supabase-2.117.1.js";
  var MSG_MAX = 4000;

  var STATUS = {
    received: "Received",
    quoted: "Quoted",
    in_production: "In production",
    delivered: "Delivered",
    closed: "Closed"
  };
  // Rolling windows, newest first, so "Last week" means the past 7 days.
  var PERIODS = [
    ["all", "Any time", 0],
    ["day", "Last day", 24 * 3600e3],
    ["week", "Last week", 7 * 24 * 3600e3],
    ["month", "Last month", 30 * 24 * 3600e3],
    ["year", "Last year", 365 * 24 * 3600e3]
  ];
  var LOCALES = {
    en: "en-GB", fr: "fr-FR", es: "es-ES", pt: "pt-BR", ar: "ar-EG", zh: "zh-CN",
    de: "de-DE", nl: "nl-NL", it: "it-IT", ru: "ru-RU", hi: "hi-IN", sw: "sw-KE", tw: "ak-GH"
  };
  // Supabase hands back fixed English strings; show our own wording instead.
  var ERRORS = {
    "Invalid login credentials": "That email and password don't match.",
    "Email not confirmed": "Confirm your email address first, then log in.",
    "A user cannot be registered at this time. Please try again later.": "Too many sign-up attempts right now. Please try again in a little while.",
    "A user with that email address already exists.": "An account with that email already exists. Try logging in.",
    "Password should be at least 8 characters": "Use at least 8 characters for your password.",
    "Unable to validate user with provided password": "Use at least 8 characters for your password.",
    "Network request failed": "We couldn't reach the account service. Check your connection and try again.",
    "Failed to fetch": "We couldn't reach the account service. Check your connection and try again."
  };

  // The enquiry form works whether or not accounts are configured, so expose the
  // no-op surface first and overwrite it once the panel exists.
  window.BHAccounts = {
    record: function () {},
    open: function () {},
    signedIn: function () { return false; }
  };

  function en(s) { return window.I18N && window.I18N.en ? window.I18N.en(s) : s; }
  // Only needed for values the translator cannot track, such as a textarea's content.
  function t(k) { return window.I18N && window.I18N.t ? window.I18N.t(k) : k; }

  // translate.js only localises nodes it has not seen before, so every dynamic
  // label is written as a fresh English text node and picked up by its observer.
  function txt(el, s) {
    el.textContent = "";
    el.appendChild(document.createTextNode(s));
    return el;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) txt(n, text);
    return n;
  }

  // A secret key would hand anyone the whole database, so only the public browser
  // key is accepted: the new "sb_publishable_…" format or the legacy anon JWT.
  function isPublishable(key) {
    if (key.length < 30 || /^sb_secret_/i.test(key)) return false;
    if (/^sb_(publishable|anon)_/i.test(key)) return true;
    if (key.indexOf("eyJ") !== 0) return false;
    try {
      var claims = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return claims.role !== "service_role";
    } catch (e) {
      return true;
    }
  }

  if (SB_KEY && !isPublishable(SB_KEY)) {
    console.error("BrownHub accounts: that looks like a secret key. Use the publishable (anon) key — it is safe in public code because row-level security guards the data.");
  }

  // Values are pasted by hand, so tolerate stray spaces and a trailing slash.
  var SB_API_URL = SB_URL.trim().replace(/\/+$/, "");
  var SB_API_KEY = SB_KEY.trim();
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.[a-z]{2,}$/i.test(SB_API_URL) && isPublishable(SB_API_KEY);

  var navLi, modal, card, tabs, form, noteEl, nameField, nameInp, emailInp, passInp;
  var submitBtn, lede, titleEl, authView, historyView, who, list, empty, logoutBtn, tabLogin, tabSignup;
  var filterSel, trigger;
  var client = null, sdkPromise = null, session = null, rows = [], shown = [], mode = "login", busy = false, opener = null;
  var period = "all";

  if (configured) build();

  function build() {
    navLi = el("li");
    trigger = el("button", "nav__link nav__link--acct", "My requests");
    trigger.id = "acct-open";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "acct-modal");
    navLi.appendChild(trigger);
    var menu = document.getElementById("nav-menu");
    if (menu) {
      var cta = menu.querySelector(".nav__link--cta");
      // Sit just before the Contact call-to-action, whatever whitespace follows it.
      menu.insertBefore(navLi, cta ? cta.parentNode : null);
    }

    modal = el("div", "modal modal--acct");
    modal.id = "acct-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "acct-title");
    modal.innerHTML =
      '<div class="modal__backdrop" data-close-acct></div>' +
      '<div class="modal__card">' +
        '<button class="modal__close" type="button" aria-label="Close" data-close-acct>&times;</button>' +
        '<div class="modal__body">' +
          '<h3 id="acct-title">My requests</h3>' +
          '<p class="acct-lede" id="acct-lede"></p>' +
          '<div class="acct-tabs" id="acct-tabs">' +
            '<button type="button" class="acct-tab is-active" id="acct-tab-login" aria-pressed="true">Log in</button>' +
            '<button type="button" class="acct-tab" id="acct-tab-signup" aria-pressed="false">Sign up</button>' +
          '</div>' +
          '<form id="acct-form" novalidate>' +
            '<label class="acct-field" id="acct-name-field" hidden>Name' +
              '<input type="text" id="acct-name" autocomplete="name" placeholder="Your name"></label>' +
            '<label class="acct-field">Email' +
              '<input type="email" id="acct-email" autocomplete="email" placeholder="you@example.com" required></label>' +
            '<label class="acct-field">Password' +
              '<input type="password" id="acct-pass" autocomplete="current-password" placeholder="At least 8 characters" required></label>' +
            '<button type="submit" class="btn btn--primary btn--block" id="acct-submit">Log in</button>' +
            '<p class="acct-note" id="acct-note" role="status" aria-live="polite"></p>' +
          '</form>' +
          '<div id="acct-history" hidden>' +
            '<div class="acct-user"><span id="acct-who"></span>' +
              '<button type="button" class="btn btn--ghost btn--sm" id="acct-logout">Log out</button></div>' +
            '<div class="acct-filter" id="acct-filter-wrap">' +
              '<label for="acct-filter" id="acct-filter-label">Period</label>' +
              '<select id="acct-filter"></select>' +
            '</div>' +
            '<ul class="acct-list" id="acct-list"></ul>' +
            '<p class="acct-empty" id="acct-empty">No requests yet. Send an enquiry and it will appear here.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    var $ = function (id) { return document.getElementById(id); };
    card = modal.querySelector(".modal__card");
    tabs = $("acct-tabs"); form = $("acct-form"); noteEl = $("acct-note");
    nameField = $("acct-name-field"); nameInp = $("acct-name");
    emailInp = $("acct-email"); passInp = $("acct-pass");
    submitBtn = $("acct-submit"); lede = $("acct-lede"); titleEl = $("acct-title");
    authView = form; historyView = $("acct-history"); who = $("acct-who");
    list = $("acct-list"); empty = $("acct-empty"); logoutBtn = $("acct-logout");
    tabLogin = $("acct-tab-login"); tabSignup = $("acct-tab-signup");
    filterSel = $("acct-filter");

    buildFilter();
    trigger.addEventListener("click", togglePanel);
    tabLogin.addEventListener("click", function () { setMode("login"); });
    tabSignup.addEventListener("click", function () { setMode("signup"); });
    form.addEventListener("submit", submit);
    logoutBtn.addEventListener("click", logout);
    list.addEventListener("click", onListClick);
    filterSel.addEventListener("change", function () {
      period = filterSel.value || "all";
      paintHistory();
    });
    [].forEach.call(modal.querySelectorAll("[data-close-acct]"), function (b) {
      b.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
    });
    window.addEventListener("resize", function () {
      if (modal.classList.contains("open")) positionPanel();
    });
    window.addEventListener("scroll", function () {
      if (modal.classList.contains("open")) positionPanel();
    }, true);

    // Dates follow the visitor's language, so a language switch repaints the list.
    document.addEventListener("i18n-applied", function () {
      buildFilter();
      if (modal.classList.contains("open")) paintHistory();
    });

    window.BHAccounts = { open: openPanel, signedIn: function () { return !!session; }, record: record };
  }

  // ---- dropdown panel --------------------------------------------------------

  function togglePanel() {
    if (modal.classList.contains("open")) closeModal(); else openPanel();
  }

  // On wide screens the nav is a horizontal bar, so the panel hangs under its
  // item. Up to 840px the nav becomes the stacked burger menu, so the panel goes
  // back to being a centred sheet instead of anchoring to a hidden item.
  function isDrop() {
    return window.matchMedia("(min-width: 841px)").matches;
  }

  function positionPanel() {
    var drop = isDrop();
    modal.classList.toggle("is-drop", drop);
    if (!drop || !trigger) {
      card.style.top = card.style.left = card.style.width = card.style.maxHeight = "";
      return;
    }
    var r = trigger.getBoundingClientRect();
    var gap = 10;
    var w = Math.min(430, Math.max(320, window.innerWidth - 32));
    var left = Math.min(Math.max(16, r.right - w), Math.max(16, window.innerWidth - w - 16));
    card.style.width = w + "px";
    card.style.left = left + "px";
    card.style.top = (r.bottom + gap) + "px";
    card.style.maxHeight = Math.max(260, window.innerHeight - r.bottom - gap - 16) + "px";
  }

  function buildFilter() {
    if (!filterSel) return;
    var label = document.getElementById("acct-filter-label");
    if (label) txt(label, "Period");
    filterSel.textContent = "";
    PERIODS.forEach(function (p) {
      var o = el("option", null, null);
      o.value = p[0];
      o.appendChild(document.createTextNode(t(p[1])));
      if (p[0] === period) o.selected = true;
      filterSel.appendChild(o);
    });
    filterSel.value = period;
  }

  // ---- Supabase --------------------------------------------------------------

  function sb() {
    if (!client) {
      client = window.supabase.createClient(SB_API_URL, SB_API_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      client.auth.onAuthStateChange(function (event, s) {
        session = s;
        if (event === "SIGNED_OUT") { rows = []; showAuth(); }
      });
    }
    return client;
  }

  function loadSdk() {
    if (window.supabase) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = SDK_URL;
        s.async = true;
        s.onload = resolve;
        s.onerror = function () { sdkPromise = null; reject(new Error("Failed to fetch")); };
        document.head.appendChild(s);
      });
    }
    return sdkPromise;
  }

  // Only pay for the SDK when a returning client actually needs it.
  function storedSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("sb-") !== 0 || !/-auth-token$/.test(k)) continue;
        var v = JSON.parse(localStorage.getItem(k) || "null");
        var s = v && v.currentSession ? v.currentSession : v;
        if (s && s.user && s.user.id) return s;
      }
    } catch (e) { /* storage blocked */ }
    return null;
  }

  function restore() {
    if (session) return Promise.resolve(session);
    if (!storedSession()) return Promise.resolve(null);
    return loadSdk().then(function () { return sb().auth.getSession(); }).then(function (res) {
      session = (res && res.data && res.data.session) || null;
      return session;
    }).catch(function () { return null; });
  }

  function insert(row) {
    return loadSdk().then(function () { return sb().from("requests").insert(row); }).then(function (res) {
      if (res && res.error) throw res.error;
    });
  }

  function fetchRows() {
    return loadSdk().then(function () {
      return sb().from("requests")
        .select("created_at,name,email,company,phone,service,budget,message,status")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(200);
    }).then(function (res) {
      if (res.error) throw res.error;
      rows = res.data || [];
    });
  }

  function record(data) {
    if (!configured) return;
    var row = {
      name: (data.name || "").slice(0, 200),
      email: (data.email || "").slice(0, 200),
      company: (data.company || "").slice(0, 200),
      phone: (data.phone || "").slice(0, 60),
      service: en(data.service || "").slice(0, 200),
      budget: en(data.budget || "").slice(0, 120),
      message: (data.message || "").slice(0, MSG_MAX)
    };
    if (!row.message) return;
    restore().then(function (s) {
      if (!s) return null;
      row.email = row.email || s.user.email || "";
      return insert(row).then(function () {
        if (modal && modal.classList.contains("open")) refresh();
      }).catch(function () { /* the enquiry itself already went through */ });
    });
  }

  // ---- panel ----------------------------------------------------------------

  function setBusy(on) {
    busy = !!on;
    submitBtn.disabled = busy;
    logoutBtn.disabled = busy;
    tabLogin.disabled = busy;
    tabSignup.disabled = busy;
    txt(submitBtn, busy ? "Please wait…" : (mode === "signup" ? "Create my account" : "Log in"));
  }

  function note(msg) { txt(noteEl, msg || ""); }

  function setMode(next) {
    mode = next;
    var signup = mode === "signup";
    nameField.hidden = !signup;
    tabs.hidden = false;
    tabLogin.classList.toggle("is-active", !signup);
    tabSignup.classList.toggle("is-active", signup);
    tabLogin.setAttribute("aria-pressed", signup ? "false" : "true");
    tabSignup.setAttribute("aria-pressed", signup ? "true" : "false");
    passInp.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    passInp.placeholder = signup ? "At least 8 characters" : "Your password";
    if (!busy) txt(submitBtn, signup ? "Create my account" : "Log in");
    note("");
  }

  function showAuth() {
    authView.hidden = false;
    historyView.hidden = true;
    setMode(mode);
    txt(lede, "Sign up to keep a record of every request you send us, and re-order any of them in one tap.");
    txt(titleEl, "My requests");
  }

  function showHistory() {
    authView.hidden = true;
    historyView.hidden = false;
    tabs.hidden = true;
    txt(lede, "Requests you sent from this account, newest first.");
    who.textContent = "";
    who.appendChild(document.createTextNode("Signed in as"));
    who.appendChild(document.createTextNode(" " + (session && session.user ? session.user.email : "")));
    buildFilter();
    paintHistory();
  }

  function periodMs() {
    for (var i = 0; i < PERIODS.length; i++) { if (PERIODS[i][0] === period) return PERIODS[i][2]; }
    return 0;
  }

  function paintHistory() {
    var cut = periodMs();
    var now = Date.now();
    shown = cut ? rows.filter(function (r) {
      var at = new Date(r.created_at).getTime();
      return !isNaN(at) && now - at <= cut;
    }) : rows.slice();

    list.textContent = "";
    if (!shown.length) {
      empty.hidden = false;
      txt(empty, rows.length
        ? "No requests in that period. Try a wider range."
        : "No requests yet. Send an enquiry and it will appear here.");
      return;
    }
    empty.hidden = true;
    shown.forEach(function (r, i) { list.appendChild(rowItem(r, i)); });
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var code = LOCALES[(window.I18N && window.I18N.lang) || "en"] || "en-GB";
    try {
      return new Intl.DateTimeFormat(code, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function rowItem(r, i) {
    var li = el("li", "acct-item");
    var top = el("div", "acct-item__top");
    top.appendChild(el("span", "acct-item__svc", r.service || "Design request"));
    var st = STATUS[r.status] ? r.status : "received";
    top.appendChild(el("span", "acct-pill acct-pill--" + st, STATUS[st]));
    var time = el("time", "acct-item__date", fmtDate(r.created_at));
    time.dateTime = r.created_at;
    li.appendChild(top);
    li.appendChild(time);
    li.appendChild(el("p", "acct-item__msg", r.message));

    var meta = [];
    if (r.budget) meta.push(r.budget);
    if (r.company) meta.push(r.company);
    if (meta.length) li.appendChild(el("p", "acct-item__meta", meta.join(" · ")));

    var acts = el("div", "acct-item__actions");
    acts.appendChild(actBtn("again", "Re-request", "btn--primary", i));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      acts.appendChild(actBtn("copy", "Copy details", "btn--ghost", i));
    }
    li.appendChild(acts);
    return li;
  }

  function actBtn(act, label, kind, i) {
    var b = el("button", "btn " + kind + " btn--sm", label);
    b.type = "button";
    b.setAttribute("data-act", act);
    b.setAttribute("data-i", String(i));
    return b;
  }

  function refresh() {
    if (!session) return Promise.resolve();
    return fetchRows().then(paintHistory).catch(function () {
      list.textContent = "";
      empty.hidden = false;
      txt(empty, "We couldn't load your requests just now. Please try again.");
    });
  }

  function openPanel() {
    opener = document.activeElement;
    modal.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    positionPanel();
    if (session) showHistory(); else showAuth();
    restore().then(function (s) {
      if (!s) return;
      showHistory();
      refresh();
    });
    (session ? logoutBtn : emailInp).focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.classList.remove("is-drop");
    trigger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    if (opener && opener.focus) opener.focus();
  }

  function errText(err) {
    var raw = err && err.message ? String(err.message).replace(/\s+/g, " ").trim() : "";
    if (ERRORS[raw]) return ERRORS[raw];
    for (var k in ERRORS) { if (raw.indexOf(k) === 0) return ERRORS[k]; }
    return raw || "Something went wrong. Please try again.";
  }

  function afterIn() {
    setBusy(false);
    form.reset();
    showHistory();
    return refresh();
  }

  function submit(e) {
    e.preventDefault();
    if (busy) return;
    var mail = emailInp.value.trim();
    var pass = passInp.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { note("Enter a valid email address."); emailInp.focus(); return; }
    if (mode === "signup" ? pass.length < 8 : !pass) {
      note(mode === "signup" ? "Use at least 8 characters for your password." : "Enter your password.");
      passInp.focus();
      return;
    }
    setBusy(true);
    note("");
    loadSdk().then(function () {
      if (mode === "signup") {
        return sb().auth.signUp({
          email: mail,
          password: pass,
          data: { display_name: nameInp.value.trim() },
          options: { emailRedirectTo: location.href }
        }).then(function (res) {
          if (res.error) throw res.error;
          session = res.data && res.data.session ? res.data.session : null;
          if (session) return afterIn();
          // Same reply whether or not the address is new, so the form can't be probed.
          setBusy(false);
          setMode("login");
          note("We sent you a confirmation email. Open it, then log in here.");
          return null;
        });
      }
      return sb().auth.signInWithPassword({ email: mail, password: pass }).then(function (res) {
        if (res.error) throw res.error;
        session = res.data.session;
        return afterIn();
      });
    }).catch(function (err) {
      setBusy(false);
      note(errText(err));
    });
  }

  function logout() {
    if (busy) return;
    setBusy(true);
    loadSdk().then(function () { return sb().auth.signOut(); }).catch(function () {}).then(function () {
      session = null;
      rows = [];
      shown = [];
      period = "all";
      setBusy(false);
      showAuth();
      setMode("login");
      note("You are signed out.");
    });
  }

  function copyText(r) {
    var lines = ["BrownHub request — " + fmtDate(r.created_at)];
    if (r.service) lines.push("Service: " + r.service);
    if (r.budget) lines.push("Budget: " + r.budget);
    if (r.company) lines.push("Company: " + r.company);
    if (r.message) lines.push("Message: " + r.message);
    return lines.join("\n");
  }

  function onListClick(e) {
    var btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    var r = shown[Number(btn.getAttribute("data-i"))];
    if (!r) return;
    if (btn.getAttribute("data-act") === "copy") {
      navigator.clipboard.writeText(copyText(r)).then(function () {
        txt(btn, "Copied");
        setTimeout(function () { txt(btn, "Copy details"); }, 2000);
      }).catch(function () {});
      return;
    }
    var message = document.getElementById("message");
    if (!message) {
      // No enquiry form on this page: hand the request over to the contact page.
      var q = "item=" + encodeURIComponent(en(r.service) || "A design project");
      if (r.service) q += "&rereq=" + encodeURIComponent(en(r.service));
      if (r.budget) q += "&rebud=" + encodeURIComponent(en(r.budget));
      location.href = "contact.html?" + q;
      return;
    }
    closeModal();
    var head = t("I'm sending this again:") + " " + fmtDate(r.created_at) + "\n\n" + (r.message || "") + "\n\n";
    if (message.value.indexOf(head) !== 0) message.value = head + message.value;
    pickOption(document.getElementById("service"), en(r.service));
    pickOption(document.getElementById("budget"), en(r.budget));
    message.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function () { message.focus(); }, 400);
  }

  function pickOption(select, value) {
    if (!select || !value) return;
    [].some.call(select.options, function (o) {
      if (o.value === value) { select.value = o.value; return true; }
      return false;
    });
  }

  // A re-request clicked on another page: restore its service and budget here.
  var q = new URLSearchParams(location.search);
  var from = configured ? q.get("rereq") : null;
  var fromBudget = configured ? q.get("rebud") : null;
  if (from || fromBudget) {
    var applyFrom = function () {
      pickOption(document.getElementById("service"), from);
      pickOption(document.getElementById("budget"), fromBudget);
    };
    applyFrom();
    document.addEventListener("i18n-applied", applyFrom);
  }
})();
