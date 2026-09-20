(function () {
  "use strict";

  var LANGS = [
    ["en", "English"], ["fr", "Français (French)"], ["es", "Español (Spanish)"],
    ["pt", "Português (Portuguese)"], ["de", "Deutsch (German)"], ["it", "Italiano (Italian)"],
    ["nl", "Nederlands (Dutch)"], ["pl", "Polski (Polish)"], ["ru", "Русский (Russian)"],
    ["uk", "Українська (Ukrainian)"], ["tr", "Türkçe (Turkish)"], ["ar", "العربية (Arabic)"],
    ["he", "עברית (Hebrew)"], ["fa", "فارسی (Persian)"], ["hi", "हिन्दी (Hindi)"],
    ["bn", "বাংলা (Bengali)"], ["ur", "اردو (Urdu)"], ["ta", "தமிழ் (Tamil)"],
    ["ne", "नेपाली (Nepali)"], ["si", "සිංහල (Sinhala)"], ["am", "አማርኛ (Amharic)"],
    ["sw", "Kiswahili (Swahili)"], ["ha", "Hausa"], ["ig", "Igbo"], ["yo", "Yorùbá (Yoruba)"],
    ["zh-CN", "简体中文 (Chinese S.)"], ["zh-TW", "繁體中文 (Chinese T.)"], ["ja", "日本語 (Japanese)"],
    ["ko", "한국어 (Korean)"], ["vi", "Tiếng Việt (Vietnamese)"], ["th", "ไทย (Thai)"],
    ["id", "Bahasa Indonesia"], ["ms", "Bahasa Melayu (Malay)"], ["tl", "Filipino"],
    ["my", "မြန်မာ (Burmese)"], ["km", "ខ្មែរ (Khmer)"], ["lo", "ລາວ (Lao)"],
    ["af", "Afrikaans"], ["sv", "Svenska (Swedish)"], ["no", "Norsk (Norwegian)"],
    ["da", "Dansk (Danish)"], ["fi", "Suomi (Finnish)"], ["el", "Ελληνικά (Greek)"],
    ["cs", "Čeština (Czech)"], ["hu", "Magyar (Hungarian)"], ["ro", "Română (Romanian)"],
    ["bg", "Български (Bulgarian)"]
  ];

  var PROXY_SUFFIX = ".translate.goog";

  function isProxy() {
    return location.hostname.slice(-PROXY_SUFFIX.length) === PROXY_SUFFIX;
  }

  function rememberOrigin() {
    try {
      if (!isProxy()) localStorage.setItem("brownhub-origin", location.origin);
    } catch (e) {}
  }

  function siteOrigin() {
    var stored = "";
    try { stored = localStorage.getItem("brownhub-origin") || ""; } catch (e) {}
    if (stored) return stored;
    var host = location.hostname.slice(0, -PROXY_SUFFIX.length).split("-").join(".");
    return "https://" + host;
  }

  function proxyUrl(code) {
    var host = isProxy()
      ? location.hostname
      : location.hostname.split(".").join("-") + PROXY_SUFFIX;
    return "https://" + host + location.pathname +
      "?_x_tr_sl=en&_x_tr_tl=" + encodeURIComponent(code) + "&_x_tr_hl=en";
  }

  function englishUrl() {
    return siteOrigin() + location.pathname;
  }

  function currentLang() {
    if (!isProxy()) return "en";
    var m = /[?&]_x_tr_tl=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : "en";
  }

  function build() {
    var nav = document.querySelector(".nav");
    if (!nav || document.getElementById("lang-select")) return;

    var style = document.createElement("style");
    style.textContent =
      ".lang-select{-webkit-appearance:none;appearance:none;flex:none;background:transparent;" +
      "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238a94a6' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\");" +
      "background-repeat:no-repeat;background-position:right 2px center;" +
      "border:0;color:var(--text-muted);font-family:inherit;font-size:0.95rem;font-weight:500;" +
      "padding:.25rem 1.2rem .25rem .1rem;margin-left:1.1rem;cursor:pointer;transition:color .2s}" +
      ".lang-select:hover,.lang-select:focus{color:var(--text);outline:none}" +
      ".lang-select option{color:var(--text);background:var(--surface)}";
    document.head.appendChild(style);

    var select = document.createElement("select");
    select.className = "lang-select";
    select.id = "lang-select";
    select.setAttribute("aria-label", "Choose language");
    LANGS.forEach(function (l) {
      var o = document.createElement("option");
      o.value = l[0];
      o.textContent = l[1];
      select.appendChild(o);
    });

    var lang = currentLang();
    select.value = lang;
    if (select.selectedIndex === -1) select.value = "en";

    select.addEventListener("change", function () {
      try { localStorage.setItem("brownhub-lang", select.value); } catch (e) {}
      location.assign(select.value === "en" ? englishUrl() : proxyUrl(select.value));
    });

    var toggle = document.querySelector(".theme-toggle");
    nav.insertBefore(select, toggle || nav.firstChild);
  }

  rememberOrigin();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
