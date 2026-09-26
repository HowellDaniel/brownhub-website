(function () {
  "use strict";

  var LANGS = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["pt", "Português"],
    ["ar", "العربية"], ["zh", "简体中文"], ["de", "Deutsch"], ["nl", "Nederlands"],
    ["it", "Italiano"], ["ru", "Русский"], ["hi", "हिन्दी"], ["sw", "Kiswahili"], ["tw", "Twi"]];
  var ATTRS = ["placeholder", "title", "alt", "aria-label"];
  var dicts = {};
  var rmaps = {};
  var records = [];
  var seen = new WeakSet();
  var seenAttr = new WeakMap();
  var current = "en";
  var localeBtn = null, localeName = null, localePanel = null;

  function trimKey(s) { return s ? s.trim() : ""; }

  function t(text) {
    var d = dicts[current];
    if (!d || current === "en") return text;
    var hit = d[trimKey(text)];
    return hit === undefined ? text : hit;
  }

  function record(node, el, attr) {
    var orig = el ? el.getAttribute(attr) : node.nodeValue;
    if (!trimKey(orig || "")) return;
    records.push({ node: node, el: el, attr: attr, orig: orig, last: orig });
  }

  function currentVal(rec) {
    return rec.el ? rec.el.getAttribute(rec.attr) : rec.node.nodeValue;
  }

  function collect(root) {
    if (root.nodeType === 3) {
      if (!seen.has(root)) { seen.add(root); record(root, null, null); }
      return;
    }
    if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE") return;
  // Language names stay in their own orthography, and the picker paints them itself.
  if (root.id === "lang-select" || root.id === "locale-list" || root.className === "locale__name") return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      // Empty at scan time does not mean absent forever: the modals fill their attrs on open.
      if (root.hasAttribute(a) && trimKey(root.getAttribute(a) || "")) {
        var m = seenAttr.get(root);
        if (!m) { m = {}; seenAttr.set(root, m); }
        if (!m[a]) { m[a] = 1; record(null, root, a); }
      }
    }
    var kids = root.childNodes;
    for (var j = 0; j < kids.length; j++) collect(kids[j]);
  }

  function write(rec, value) {
    if (rec.el) rec.el.setAttribute(rec.attr, value);
    else rec.node.nodeValue = value;
    rec.last = value;
  }

  function baseOf(rec) {
    var now = currentVal(rec);
    if (now !== rec.last) { rec.orig = now; rec.last = now; }
    return rec.orig;
  }

  function translateRecord(rec, dict) {
    var src = baseOf(rec);
    var hit = dict[trimKey(src)];
    if (hit === undefined) return;
    var lead = src.slice(0, src.length - src.trimStart().length);
    var trail = src.slice(src.trimEnd().length);
    write(rec, lead + hit + trail);
  }

  function applyMeta(dict) {
    if (!dict) {
      document.title = records.metaTitle || document.title;
      if (records.metaDesc) records.metaDesc.content = records.metaDescOrig;
      return;
    }
    var tt = dict[trimKey(records.metaTitle || document.title)];
    if (tt !== undefined) document.title = tt;
    var md = document.querySelector('meta[name="description"]');
    if (md) {
      var mm = dict[trimKey(md.getAttribute("content"))];
      if (mm !== undefined) md.setAttribute("content", mm);
    }
  }

  function loadDict(code) {
    if (dicts[code]) return Promise.resolve(dicts[code]);
    return fetch("i18n/" + code + ".json?v=42")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { dicts[code] = d; return d; });
  }

  function revMap(code) {
    if (!rmaps[code]) {
      var d = dicts[code];
      if (!d) return null;
      var m = {};
      for (var k in d) { if (!m[d[k]]) m[d[k]] = k; }
      rmaps[code] = m;
    }
    return rmaps[code];
  }

  function announce() {
    try { document.dispatchEvent(new Event("i18n-applied")); } catch (e) {}
  }

  function apply(code) {
    if (code === "en") {
      current = "en";
      records.forEach(function (r) {
        var now = currentVal(r);
        if (now === r.last) write(r, r.orig);
        else { r.orig = now; r.last = now; }
      });
      applyMeta(null);
      announce();
    } else {
      loadDict(code).then(function (dict) {
        current = code;
        records.forEach(function (r) { translateRecord(r, dict); });
        applyMeta(dict);
        announce();
      }).catch(function () { return; });
    }
    document.documentElement.setAttribute("lang", code);
    try { localStorage.setItem("brownhub-lang", code); } catch (e) {}
    sync();
  }

  window.I18N = {
    t: t,
    apply: apply,
    get lang() { return current; },
    // Map a translated string back to its English source (for keyword routing).
    en: function (text) {
      var m = revMap(current);
      if (!m) return text;
      var hit = m[trimKey(text)];
      return hit === undefined ? text : hit;
    },
    translateNode: function (node) {
      var before = records.length;
      collect(node);
      if (current !== "en" && dicts[current]) {
        for (var i = before; i < records.length; i++) translateRecord(records[i], dicts[current]);
      }
    }
  };

  function buildLocale() {
    var host = document.getElementById("locale");
    if (!host || host.firstChild) return;

    host.innerHTML =
      '<button class="locale__btn" type="button" aria-expanded="false" aria-controls="locale-list" aria-label="Choose language">' +
        '<svg class="locale__globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.2 9.6h17.6M3.2 14.4h17.6M12 3a15.5 15.5 0 0 1 0 18M12 3a15.5 15.5 0 0 0 0 18"/></svg>' +
        '<span class="locale__name">English</span>' +
        '<svg class="locale__caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>' +
      "</button>" +
      '<div class="locale__panel" id="locale-list"></div>';

    localeBtn = host.querySelector(".locale__btn");
    localeName = host.querySelector(".locale__name");
    localePanel = host.querySelector("#locale-list");

    LANGS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "locale__opt";
      b.setAttribute("data-code", l[0]);
      b.textContent = l[1];
      b.addEventListener("click", function () { apply(l[0]); close(); localeBtn.focus(); });
      localePanel.appendChild(b);
    });

    localeBtn.addEventListener("click", function () {
      var willOpen = !host.classList.contains("is-open");
      host.classList.toggle("is-open", willOpen);
      localeBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    document.addEventListener("pointerdown", function (e) {
      if (!host.contains(e.target)) close();
    });
    document.addEventListener("i18n-applied", function () {
      if (localeBtn) localeBtn.setAttribute("aria-label", t("Choose language"));
    });
    sync();
  }

  function close() {
    if (!localeBtn) return;
    var host = localeBtn.parentNode;
    host.classList.remove("is-open");
    localeBtn.setAttribute("aria-expanded", "false");
  }

  // The current language is written the way its speakers write it, so the label
  // and every option are excluded from translation by collect().
  function sync() {
    if (!localeBtn) return;
    var name = "English";
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === current) name = LANGS[i][1];
    localeName.textContent = name;
    Array.prototype.forEach.call(localePanel.children, function (b) {
      var on = b.getAttribute("data-code") === current;
      b.classList.toggle("is-current", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function init() {
    buildLocale();

    records.metaTitle = document.title;
    var md = document.querySelector('meta[name="description"]');
    if (md) { records.metaDesc = md; records.metaDescOrig = md.getAttribute("content"); }

    collect(document.body);

    var saved = "en";
    try {
      saved = localStorage.getItem("brownhub-lang") || "";
      if (!saved) {
        // Walk the visitor's whole preferred-language list, not just the first one.
        var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "en"];
        for (var pi = 0; pi < prefs.length; pi++) {
          var code = String(prefs[pi] || "").slice(0, 2).toLowerCase();
          if (code === "ak") code = "tw";
          if (LANGS.some(function (l) { return l[0] === code; })) { saved = code; break; }
        }
      }
    } catch (e) {}

    if (saved && saved !== "en") apply(saved);

    var pending = [];
    var raf = null;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) pending.push(m.addedNodes[i]);
      });
      if (!pending.length || raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var nodes = pending; pending = [];
        nodes.forEach(function (n) { window.I18N.translateNode(n); });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
