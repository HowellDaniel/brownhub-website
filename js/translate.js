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
  var selectEl = null;

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
    if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE" || root.id === "lang-select") return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (root.hasAttribute(a)) {
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
    return fetch("i18n/" + code + ".json?v=16")
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
    if (selectEl) selectEl.value = code;
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

  function buildSelect() {
    var nav = document.querySelector(".nav");
    if (!nav || document.getElementById("lang-select")) return;

    var style = document.createElement("style");
    style.textContent =
      ".lang-select{-webkit-appearance:none;appearance:none;flex:none;" +
      "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23d97a1f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");" +
      "background-repeat:no-repeat;background-position:right .6rem center;" +
      "background-color:transparent;background-clip:padding-box;" +
      "border:1.5px solid var(--accent);border-radius:999px;color:var(--text-muted);font-family:inherit;" +
      "font-size:0.95rem;font-weight:500;padding:.3rem 1.8rem .3rem .85rem;margin-left:1.1rem;cursor:pointer;" +
      "transition:color .2s,box-shadow .2s}" +
      ".lang-select:hover,.lang-select:focus{color:var(--text);outline:none;box-shadow:0 0 0 3px rgba(217,122,31,0.18)}" +
      ".lang-select option{color:var(--text);background:var(--surface)}" +
      "@media (max-width:640px){.lang-select{font-size:.75rem;padding:.25rem 1.35rem .25rem .45rem;margin-left:.45rem;background-position:right .35rem center;max-width:7.4rem}" +
      ".site-header .theme-toggle{margin-left:.5rem;width:40px;height:40px}}" +
      "@media (max-width:430px){.lang-select{max-width:6.4rem;font-size:.72rem}.site-header .logo-img{height:32px}}";
    document.head.appendChild(style);

    selectEl = document.createElement("select");
    selectEl.className = "lang-select";
    selectEl.id = "lang-select";
    selectEl.setAttribute("aria-label", t("Choose language"));
    document.addEventListener("i18n-applied", function () {
      if (selectEl) selectEl.setAttribute("aria-label", t("Choose language"));
    });
    LANGS.forEach(function (l) {
      var o = document.createElement("option");
      o.value = l[0];
      o.textContent = l[1];
      selectEl.appendChild(o);
    });
    selectEl.addEventListener("change", function () { apply(selectEl.value); });

    var toggle = document.querySelector(".theme-toggle");
    nav.insertBefore(selectEl, toggle || nav.firstChild);
  }

  function init() {
    buildSelect();

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
