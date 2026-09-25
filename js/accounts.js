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
    "New password should be different from the old password.": "Choose a password you haven't used before.",
    "Email rate limit exceeded": "Too many reset emails right now. Please wait a while and try again.",
    "Phone number is invalid": "Enter your number with its country code, like +233 50 000 0000.",
    "The phone number is already in use.": "That number is already on another account. Use the number you signed up with, or write to us.",
    "Invalid token": "That code doesn't match. Check the text message and try again.",
    "Token has expired": "That code has expired. Ask for a new one.",
    "Too many requests": "You've asked for a few codes just now. Wait a minute and try again.",
    "For security purposes, you can only request this once every 60 seconds": "You've asked for a few codes just now. Wait a minute and try again.",
    "SMS rate limit exceeded": "Too many codes sent right now. Please wait a minute and try again.",
    "Error sending out the SMS": "We couldn't text that number just now. Your account is open — try again later.",
    "Unable to send SMS": "We couldn't text that number just now. Your account is open — try again later.",
    // What Supabase answers when the project has no SMS provider wired up. Left raw
    // it prints GoTrue's internals to the client.
    "Unable to get SMS provider": "We couldn't text that number just now. Your account is open — try again later.",
    "New phone number is the same as current phone number": "We already have that number. Enter the 6-digit code we texted.",
    "Network request failed": "We couldn't reach the account service. Check your connection and try again.",
    "Failed to fetch": "We couldn't reach the account service. Check your connection and try again."
  };

  // The form doubles as the sign-in, sign-up and two reset steps, so each mode
  // keeps its own wording in these tables rather than in branching code.
  var SUBMIT_LABEL = {
    login: "Log in",
    signup: "Create my account",
    forgot: "Send reset link",
    newpass: "Save new password",
    phone: "Send me the code",
    verify: "Confirm my number"
  };
  var LEDES = {
    login: "Sign up to keep a record of every request you send us, and re-order any of them in one tap.",
    signup: "Sign up to keep a record of every request you send us, and re-order any of them in one tap.",
    forgot: "Enter your email and we'll send you a link to choose a new password.",
    newpass: "Choose a new password for your account.",
    phone: "Give us the number to text your 6-digit code to, and we'll send one now.",
    verify: "We've texted a 6-digit code to this number. Enter it to confirm it."
  };
  // The one control that gets a different label at almost every step.
  var LINK_LABEL = {
    login: "Forgot password?",
    forgot: "Back to log in",
    newpass: "Back to log in",
    phone: "Skip for now",
    verify: "Send another code"
  };
  var TITLES = {
    newpass: "Set a new password",
    phone: "Confirm your number",
    verify: "Confirm your number"
  };

  // The enquiry form works whether or not accounts are configured, so expose the
  // no-op surface first and overwrite it once the panel exists.
  window.BHAccounts = {
    record: function () {},
    open: function () {},
    signedIn: function () { return false; },
    email: function () { return ""; },
    ask: function () { return Promise.reject(new Error("The assistant is not switched on yet.")); }
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

  // The chat assistant is an Edge Function in this same project, which is why the
  // call lives here: this file owns the project URL and the public key. The model
  // key never touches the browser, so a visitor can only ever ask questions.
  function ask(question, lang, prices) {
    if (!configured) return Promise.reject(new Error("Accounts are not configured on this site."));
    return fetch(SB_API_URL + "/functions/v1/brownhub-assistant", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SB_API_KEY,
        Authorization: "Bearer " + SB_API_KEY
      },
      body: JSON.stringify({ q: question, lang: lang, prices: prices || [] })
    }).then(function (res) {
      return res.json().catch(function () { throw new Error("The assistant sent back nothing readable."); }).then(function (data) {
        if (!res.ok || !data || !data.answer) throw new Error((data && data.error) || "The assistant did not answer.");
        return data.answer;
      });
    });
  }

  var navLi, modal, card, tabs, form, noteEl, nameField, nameInp, emailInp, passInp;
  var passField, passLabel, linkBtn, link2Btn, emailField, phoneField, phoneInp, codeField, codeInp;
  var verifyBar, verifyMsg, verifyBtn, telLine, statusEl;
  var submitBtn, lede, titleEl, authView, historyView, who, list, empty, logoutBtn, tabLogin, tabSignup;
  var filterSel, trigger;
  var client = null, sdkPromise = null, session = null, rows = [], shown = [], mode = "login", busy = false, opener = null;
  var period = "all";
  // True between opening a reset link and saving the new password it authorises.
  var resetting = false;
  // The number a code is live for. Held apart from the input so re-sending can't be
  // aimed at a number the client has since typed over.
  var pendingPhone = "";

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
              '<input type="text" id="acct-name" name="name" autocomplete="name" placeholder="Your name"></label>' +
            '<label class="acct-field" id="acct-email-field">Email' +
              '<input type="email" id="acct-email" name="email" autocomplete="email" placeholder="you@example.com" required></label>' +
            '<label class="acct-field" id="acct-phone-field" hidden>Phone number' +
              '<input type="tel" id="acct-phone" name="phone" autocomplete="tel" inputmode="tel" placeholder="+233 50 000 0000"></label>' +
            // The number the code went to, shown on its own so no sentence has to be
            // rebuilt around a value the translator can't match.
            '<p class="acct-tel" id="acct-tel" hidden></p>' +
            '<label class="acct-field" id="acct-code-field" hidden>6-digit code' +
              '<input type="text" id="acct-code" name="code" class="acct-code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9 ]*" maxlength="8" placeholder="123456"></label>' +
            '<label class="acct-field" id="acct-pass-field"><span id="acct-pass-label">Password</span>' +
              '<input type="password" id="acct-pass" name="password" autocomplete="current-password" placeholder="At least 8 characters" required></label>' +
            '<button type="button" class="acct-link" id="acct-link" hidden>Forgot password?</button>' +
            '<button type="button" class="acct-link" id="acct-link2" hidden>Use another number</button>' +
            '<button type="submit" class="btn btn--primary btn--block" id="acct-submit">Log in</button>' +
            '<p class="acct-note" id="acct-note" role="status" aria-live="polite"></p>' +
          '</form>' +
          '<div id="acct-history" hidden>' +
            '<div class="acct-user"><span id="acct-who"></span>' +
              '<button type="button" class="btn btn--ghost btn--sm" id="acct-logout">Log out</button></div>' +
            '<div class="acct-verify" id="acct-verify" hidden>' +
              '<span id="acct-verify-msg"></span>' +
              '<button type="button" class="btn btn--primary btn--sm" id="acct-verify-btn">Verify now</button>' +
            '</div>' +
            '<p class="acct-note" id="acct-status" hidden></p>' +
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
    emailField = $("acct-email-field");
    passField = $("acct-pass-field"); passLabel = $("acct-pass-label"); linkBtn = $("acct-link");
    link2Btn = $("acct-link2");
    phoneField = $("acct-phone-field"); phoneInp = $("acct-phone");
    codeField = $("acct-code-field"); codeInp = $("acct-code");
    verifyBar = $("acct-verify"); verifyMsg = $("acct-verify-msg"); verifyBtn = $("acct-verify-btn");
    telLine = $("acct-tel"); statusEl = $("acct-status");
    submitBtn = $("acct-submit"); lede = $("acct-lede"); titleEl = $("acct-title");
    authView = form; historyView = $("acct-history"); who = $("acct-who");
    list = $("acct-list"); empty = $("acct-empty"); logoutBtn = $("acct-logout");
    tabLogin = $("acct-tab-login"); tabSignup = $("acct-tab-signup");
    filterSel = $("acct-filter");

    buildFilter();
    trigger.addEventListener("click", togglePanel);
    tabLogin.addEventListener("click", function () { setMode("login"); offerFill(); });
    tabSignup.addEventListener("click", function () { setMode("signup"); });
    // The same control carries a different job at every step, so its behaviour is
    // read off `mode` rather than being fixed at bind time.
    linkBtn.addEventListener("click", function () {
      if (busy || linkBtn.disabled) return;
      if (mode === "verify") { sendCode(pendingPhone || phoneOf()); return; }
      if (mode === "phone") { leaveVerify(); return; }
      resetting = false;
      var next = mode === "login" ? "forgot" : "login";
      setMode(next);
      if (next === "login") offerFill();
      emailInp.focus();
    });
    link2Btn.addEventListener("click", function () {
      if (busy || mode !== "verify") return;
      phoneInp.value = pendingPhone;
      setMode("phone");
      phoneInp.focus();
    });
    verifyBtn.addEventListener("click", function () {
      if (busy) return;
      // The reminder lives in the request list, so taking the offer has to bring the
      // form back on screen as well as changing its step.
      showStep();
      phoneInp.value = phoneInp.value || phoneOf();
      setMode("phone");
      phoneInp.focus();
    });
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

    window.BHAccounts = {
      open: openPanel,
      signedIn: function () { return !!session; },
      email: function () { return session && session.user ? session.user.email : ""; },
      record: record,
      ask: ask
    };
    checkSms();
    catchRecovery();
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
        if (event === "SIGNED_OUT") { rows = []; resetting = false; pendingPhone = ""; disarmResend(); showAuth(); }
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
    verifyBtn.disabled = busy;
    link2Btn.disabled = busy;
    paintResend();
    txt(submitBtn, busy ? "Please wait…" : SUBMIT_LABEL[mode]);
  }

  // The note sits inside the sign-in form, so a message written while the request
  // list is on screen would be invisible. Both views carry one and note() fills
  // both; whichever view the client is looking at is the one that reads.
  function note(msg) {
    txt(noteEl, msg || "");
    txt(statusEl, msg || "");
    statusEl.hidden = !msg;
  }

  function setMode(next) {
    mode = next;
    var signup = mode === "signup";
    var forgot = mode === "forgot";
    var newpass = mode === "newpass";
    var verify = mode === "verify";
    // Both phone steps are side trips: neither wants the address, the password or
    // the login/sign-up tabs on screen with it.
    var telStep = mode === "phone" || verify;
    var switching = forgot || newpass || telStep;
    nameField.hidden = !signup;
    // The reset ask needs an address only; the new password needs nothing but itself.
    passField.hidden = forgot || telStep;
    emailField.hidden = newpass || telStep;
    phoneField.hidden = !((signup || mode === "phone") && smsReady);
    codeField.hidden = !verify;
    telLine.hidden = !verify;
    tabs.hidden = switching;
    if (!switching) {
      tabLogin.classList.toggle("is-active", !signup);
      tabSignup.classList.toggle("is-active", signup);
      tabLogin.setAttribute("aria-pressed", signup ? "false" : "true");
      tabSignup.setAttribute("aria-pressed", signup ? "true" : "false");
    }
    linkBtn.hidden = signup;
    link2Btn.hidden = !verify;
    // The resend lock is only meaningful on the code step, so each step has to
    // repaint it: the link was armed while `mode` still said "signup".
    paintResend();
    txt(linkBtn, LINK_LABEL[mode] || "");
    txt(link2Btn, "Use another number");
    txt(passLabel, newpass ? "New password" : "Password");
    passInp.setAttribute("autocomplete", signup || newpass ? "new-password" : "current-password");
    passInp.placeholder = signup || newpass ? "At least 8 characters" : "Your password";
    txt(lede, LEDES[mode]);
    txt(titleEl, TITLES[mode] || "My requests");
    if (!busy) txt(submitBtn, SUBMIT_LABEL[mode]);
    note("");
  }

  function showAuth() {
    // A recovery session that has been dropped must not strand the panel on the
    // new-password form, which only makes sense while one is live. The two phone
    // steps need an account to attach a number to, so they go the same way.
    if (!resetting && mode === "newpass") mode = "login";
    if (!session && (mode === "phone" || mode === "verify")) { mode = "login"; pendingPhone = ""; }
    authView.hidden = false;
    historyView.hidden = true;
    setMode(mode);
    // Opening the panel is a tap of the visitor's own, which is what the browser
    // wants before it will offer a saved password.
    if (mode === "login") offerFill();
  }

  function showHistory() {
    authView.hidden = true;
    historyView.hidden = false;
    tabs.hidden = true;
    txt(titleEl, "My requests");
    txt(lede, "Requests you sent from this account, newest first.");
    paintVerifyBar();
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

  // A reset link or a texted code holds the panel on its own step; jumping to the
  // history list would strand the visitor halfway through either one.
  function detour() {
    return resetting || mode === "verify" || mode === "phone";
  }

  function openPanel() {
    // Re-ask each time the panel opens, so switching the provider on in the
    // dashboard lights the phone steps up without anyone reloading the page.
    checkSms();
    opener = document.activeElement;
    modal.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    positionPanel();
    if (session && !detour()) showHistory(); else showAuth();
    restore().then(function (s) {
      if (!s || detour()) return;
      showHistory();
      refresh();
    });
    (resetting ? passInp : mode === "verify" ? codeInp : mode === "phone" ? phoneInp : session ? logoutBtn : emailInp).focus();
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

  // ---- browser autofill --------------------------------------------------------
  // Password managers look for named fields inside a form that really posts, and
  // this one posts nothing, so hand the pair over explicitly: store() once it has
  // worked, get() when the panel opens. Absent API (Firefox, old Safari) just means
  // the visitor keeps typing by hand, so every call here is best-effort.
  var credsOk = !!(window.PasswordCredential && navigator.credentials);

  function saveCreds(id, secret) {
    if (!credsOk || !id || !secret) return;
    // store() answers asynchronously, so a rejected password manager (Chrome on a
    // profile with saving switched off, for one) must be swallowed here, not just
    // by the try block around the call.
    try {
      navigator.credentials.store(new window.PasswordCredential({ id: id, password: secret })).catch(function () {});
    } catch (e) {}
  }

  var fillAskedAt = 0;

  function offerFill() {
    if (!credsOk || !navigator.credentials.get) return;
    // One click can paint the auth view twice (logout, then the SIGNED_OUT reply),
    // and two asks in a row would pop the browser's picker at the visitor twice.
    var now = Date.now();
    if (now - fillAskedAt < 900) return;
    fillAskedAt = now;
    try {
      navigator.credentials.get({ password: true, mediation: "optional" }).then(function (c) {
        if (!c || !c.id || busy || mode !== "login") return;
        if (emailInp.value.trim() !== c.id) emailInp.value = c.id;
        if (c.password && !passInp.value) passInp.value = c.password;
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- phone verification ------------------------------------------------------
  // A code can only be texted while the project has a live SMS provider behind an
  // enabled Phone provider, and the panel must not offer a text it cannot send.
  // The project itself is the only witness, so ask it once per page load. A probe
  // that fails to answer leaves the feature on rather than switching off something
  // that works, and the next panel open asks again.
  var smsReady = false;
  var smsPending = false;

  function checkSms() {
    if (!configured || smsPending) return;
    smsPending = true;
    fetch(SB_API_URL + "/auth/v1/settings", { headers: { apikey: SB_API_KEY } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        smsPending = false;
        if (!data || !data.external) return;
        var on = !!data.external.phone;
        if (on === smsReady) return;
        smsReady = on;
        // The step the client is looking at may have just appeared or gone away.
        paintVerifyBar();
        if (modal.classList.contains("open") && !busy && !noteEl.textContent) setMode(mode);
      })
      .catch(function () { smsPending = false; });
  }

  // Supabase only accepts E.164, while most clients type their number the way it is
  // spoken. A leading 0 is the Ghanaian trunk code the studio's clients use, so it
  // becomes +233; anything else has to arrive with its country code.
  function phoneE164(raw) {
    var r = String(raw || "").trim();
    var s = r.replace(/\D/g, "");
    var plus = r.charAt(0) === "+";
    // Without a "+" there is nothing to tell us which country the number belongs to,
    // except the spoken Ghana form, whose leading 0 is the trunk code for +233. Any
    // other bare run of digits is refused rather than texted to a wrong destination.
    if (!plus && !/^0\d{8,9}$/.test(s) && !/^233\d{7,12}$/.test(s)) return "";
    if (!plus && /^0/.test(s)) s = "233" + s.slice(1);
    return /^\d{8,15}$/.test(s) ? "+" + s : "";
  }

  function phoneOf() {
    return session && session.user ? session.user.phone || "" : "";
  }

  function unconfirmed() {
    return !!(session && session.user) && !session.user.phone_confirmed_at;
  }

  // Supabase texts one code per number per minute, so the resend link has to sit the
  // gap out rather than fire and come back with an error.
  var codeAt = 0;
  var codeTimer = null;

  function resendLocked() { return Date.now() - codeAt < 60000; }

  function paintResend() {
    linkBtn.disabled = busy || (mode === "verify" && resendLocked());
  }

  function armResendLock() {
    codeAt = Date.now();
    if (codeTimer) clearTimeout(codeTimer);
    // One timer for the whole gap: the resend link is the only thing that changes at the end.
    codeTimer = setTimeout(function () { codeTimer = null; paintResend(); }, 61000);
    paintResend();
  }

  function disarmResend() {
    codeAt = 0;
    if (codeTimer) { clearTimeout(codeTimer); codeTimer = null; }
  }

  // Attach the number to the signed-in account, which is what asks Supabase to text
  // the code. A text that cannot go out rejects the whole update, so the number is
  // not left half-saved: the reminder bar simply asks for it again.
  function sendCode(number) {
    // Nothing can text a code while the provider is off, and every way into this
    // function is already hidden in that state.
    if (!smsReady) return;
    var tel = phoneE164(number);
    if (!tel) {
      note("Enter your number with its country code, like +233 50 000 0000.");
      phoneInp.focus();
      return;
    }
    if (!session) { setMode("login"); note("Log in first, then we can text you a code."); return; }
    pendingPhone = tel;
    setBusy(true);
    note("");
    var same = phoneOf() === tel;
    loadSdk().then(function () {
      var auth = sb().auth;
      // Re-sending to a number already on file has to go through /resend, because
      // setting the same number again is an error rather than a no-op.
      if (same) return auth.resend({ phone: tel, type: "phone_change" });
      return auth.updateUser({ phone: tel }).then(function (res) {
        // An earlier text may have failed after the number was stored, and the
        // session copy of the account would not know. The refusal says so, and
        // /resend is the only route left that will produce a code.
        if (res && res.error && /same as current phone number/i.test(res.error.message || "")) {
          return auth.resend({ phone: tel, type: "phone_change" });
        }
        return res;
      });
    }).then(function (res) {
      if (res && res.error) throw res.error;
      // The account now carries the number, so adopt that copy: the next code
      // request can go straight to /resend instead of being refused first.
      if (res && res.data && res.data.user && session) session.user = res.data.user;
      setBusy(false);
      armResendLock();
      codeInp.value = "";
      telLine.textContent = tel;
      showStep();
      setMode("verify");
      codeInp.focus();
    }).catch(function (err) {
      setBusy(false);
      phoneInp.value = tel;
      // The note sits inside the form, so a failed text has to bring the number step
      // back on screen rather than speak from behind the request list.
      showStep();
      setMode("phone");
      note(errText(err));
    });
  }

  // Every step is the same form; only which of the panel's two views is on screen moves.
  function showStep() {
    authView.hidden = false;
    historyView.hidden = true;
  }

  function confirmCode() {
    var code = codeInp.value.replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      note("Enter the 6 digits from the text message.");
      codeInp.focus();
      return;
    }
    if (!pendingPhone) { sendCode(phoneOf()); return; }
    setBusy(true);
    note("");
    loadSdk().then(function () {
      return sb().auth.verifyOtp({ phone: pendingPhone, token: code, type: "phone_change" }).then(function (res) {
        if (res.error) throw res.error;
        return sb().auth.getUser();
      });
    }).then(function (res) {
      var u = res && res.data && res.data.user;
      if (u && session) session.user = u;
      setBusy(false);
      pendingPhone = "";
      disarmResend();
      showHistory();
      note("Your number is confirmed.");
      return refresh();
    }).catch(function (err) {
      setBusy(false);
      note(errText(err));
    });
  }

  // Verification is deliberately optional, so leaving it must land the client back
  // where they came from rather than on a dead end. The reminder bar in the request
  // list is what keeps the offer alive afterwards, so no message is needed here.
  function leaveVerify() {
    pendingPhone = "";
    // Whatever the last step had to say is done with; the reminder bar is what
    // keeps the offer alive from here.
    note("");
    if (session) showHistory();
    else { setMode("login"); offerFill(); }
  }

  function paintVerifyBar() {
    var ok = !unconfirmed();
    verifyBar.hidden = !session || ok || !smsReady;
    if (verifyBar.hidden) return;
    txt(verifyMsg, phoneOf()
      ? "We haven't confirmed this number yet."
      : "Add your number so we can text you about your requests.");
    txt(verifyBtn, phoneOf() ? "Try again" : "Add number");
  }

  function submit(e) {
    e.preventDefault();
    if (busy) return;
    var mail = emailInp.value.trim();
    var pass = passInp.value;
    var telRaw = phoneInp.value;
    // The two phone steps ask for neither address nor password, so they branch out
    // before those checks rather than beside them.
    if (mode === "phone") { sendCode(telRaw); return; }
    if (mode === "verify") { confirmCode(); return; }
    var minPass = mode === "signup" || mode === "newpass";
    if (mode !== "newpass" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { note("Enter a valid email address."); emailInp.focus(); return; }
    if (mode !== "forgot") {
      if (minPass ? pass.length < 8 : !pass) {
        note(minPass ? "Use at least 8 characters for your password." : "Enter your password.");
        passInp.focus();
        return;
      }
    }
    // The number stays optional, but a half-typed one is worth flagging now rather
    // than losing it silently after the account is made.
    if (mode === "signup" && telRaw.trim() && !phoneE164(telRaw)) {
      note("Enter your number with its country code, like +233 50 000 0000.");
      phoneInp.focus();
      return;
    }
    setBusy(true);
    note("");
    loadSdk().then(function () {
      if (mode === "forgot") {
        return sb().auth.resetPasswordForEmail(mail, { redirectTo: recoveryTarget() }).then(function (res) {
          if (res.error) throw res.error;
          setBusy(false);
          // Same reply whether or not the address is registered, so the form can't be probed.
          note("If that email has an account with us, a reset link is on its way. Open it, then return here to choose a new password.");
        });
      }
      if (mode === "newpass") {
        return sb().auth.updateUser({ password: pass }).then(function (res) {
          if (res.error) throw res.error;
          if (res.data && res.data.session) session = res.data.session;
          resetting = false;
          // The email box is hidden in this step, so take the address from the session.
          saveCreds(session && session.user ? session.user.email : mail, pass);
          return afterIn();
        });
      }
      if (mode === "signup") {
        var tel = phoneE164(telRaw);
        return sb().auth.signUp({
          email: mail,
          password: pass,
          data: { display_name: nameInp.value.trim() },
          options: { emailRedirectTo: location.href }
        }).then(function (res) {
          if (res.error) throw res.error;
          session = res.data && res.data.session ? res.data.session : null;
          if (session) {
            saveCreds(mail, pass);
            afterIn();
            // A number given at sign-up is worth a code straight away. The account is
            // open either way, so a text that cannot go out costs nothing.
            if (tel) sendCode(tel);
            return null;
          }
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
        saveCreds(mail, pass);
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
      resetting = false;
      pendingPhone = "";
      disarmResend();
      setBusy(false);
      // showAuth paints whatever `mode` holds, so set it first and it also gets
      // to offer the saved password.
      mode = "login";
      showAuth();
      note("You are signed out.");
    });
  }

  // ---- password recovery -----------------------------------------------------

  // The mail lands back on the page the client was reading; accounts.js is on all
  // five, so any of them finishes the flow. Query and hash are dropped because
  // Supabase matches this against its own redirect allowlist.
  function recoveryTarget() {
    return location.origin + location.pathname;
  }

  // Implicit flow (this project's default) puts "type=recovery" in the fragment,
  // which never reaches the server; PKCE would put a one-time code in the query.
  function isRecoveryLink() {
    return /(?:[#&?])type=recovery(?:&|$)/.test(location.href) || /[?&]code=[^&]+/.test(location.search);
  }

  function catchRecovery() {
    if (!isRecoveryLink()) return;
    resetting = true;
    loadSdk().then(function () { return sb().auth.getSession(); }).then(function (res) {
      var s = res && res.data && res.data.session;
      if (!s) { resetting = false; return; }
      session = s;
      setMode("newpass");
      openPanel();
    }).catch(function () {
      resetting = false;
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
