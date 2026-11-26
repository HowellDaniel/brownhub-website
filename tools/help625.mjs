/*
  Blink proof for #625 and #626: a rating on every help answer, measured in a real engine
  rather than reasoned about from the stylesheet.

  node tools/help625.mjs [--arm=local|live] [--lang=en|ar] [--theme=dark|light|system]
                         [--vw=1440] [--vh=900] [--port=9425]
                         [--out=/tmp/bh625/<arm>-<lang>-<vw>x<vh>.json]
                         [--shot=/tmp/bh625] [--flow=rate|note|both|reject]
                         [--door=ok|fail|once] [--doorMs=700]

  Why the network is stubbed, and where it is not. The local arm never lets a request out:
  a rating on a test page is not a fact about a customer, and the studio's feedback table is
  business data. It still answers like the deployed function, with {"ok":true}, because a
  client that only succeeds when the page hands itself a blank response proves the opposite
  of what it claims. The live arm lets the one feedback POST leave the browser for real,
  because that is the request a curl cannot prove: the page's own CSP has to admit the
  functions origin, the Origin header has to be the site, and the deployed function has to
  answer. The rows the live arm leaves behind are read back and deleted on the SQL rail
  afterwards.
*/
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const ARM = ARG.arm || "local";
const LIVE = ARM === "live";
const ORIGIN = ARG.origin || (LIVE ? "https://www.brownhub283.com" : "http://127.0.0.1:8123");
const LANG = ARG.lang || "en";
const THEME = ARG.theme || "dark";
const VW = Number(ARG.vw || 1440);
const VH = Number(ARG.vh || 900);
const PORT = Number(ARG.port || 9425);
let FLOW = ARG.flow || "both";
/* The local arm owns its answer, so it can own a refusal too. `once` rejects the first
   post and accepts the retry, which is the only way this rig can watch a visitor
   actually try again. The live arm never uses either: a failed send is a fake fact
   about a real table. */
const DOOR = ARG.door || "ok";
const SERVE = DOOR === "fail" ? "true" : DOOR === "once" ? "S.calls.length === 1" : "false";
const DOOR_MS = Number(ARG.doorMs || (DOOR === "ok" ? 30 : 700));
const OUT = ARG.out || `/tmp/bh625/${ARM}-${LANG}-${THEME}-${VW}x${VH}-${FLOW}.json`;
const SHOTDIR = ARG.shot || null;
const RATE_FORM = 0;
const NOTE_FORM = 1;
const REJECT_FORM = 2;

/* One live run files one production row. The rating-only arm is safe on live, but the
   note arm deliberately owns the single live submission rather than leaving two. */
if (LIVE && FLOW === "both") FLOW = "note";
/* A refused send is a lie about the studio's own table, so the live arm cannot order one. */
if (LIVE && (DOOR !== "ok" || FLOW === "reject")) {
  throw new Error("the live arm cannot fake a rejected send: run --arm=live --door=ok");
}

const dict = LANG === "en" ? {} : JSON.parse(readFileSync(join(ROOT, "i18n", `${LANG}.json`), "utf8"));
const SOURCE = {
  group: "Choose a rating from 1 to 5 stars",
  stars: ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"],
  note: "Tell us about the experience (optional)",
  contact: "Your WhatsApp number, if you want an answer back",
  placeholder: "What helped, or what was still missing?",
  send: "Send feedback",
  thanks: "Thanks — your feedback reached the studio.",
  fail: "Could not send that. Try again, or tell us on the contact page.",
  still: "Still need help?",
  support: "Tell us what you could not resolve. The studio replies on WhatsApp or by phone, and directions are available before travelling.",
  contactBtn: "Contact the studio",
  whatsapp: "Chat on WhatsApp",
  directions: "Get directions",
  find: "Where to find us",
};
function expected(key) {
  if (LANG === "en") return SOURCE[key];
  const src = SOURCE[key];
  /* A missing key keeps its English text on purpose: the boot gate then compares the
     page's Arabic label against English and fails loudly, instead of the rig quietly
     accepting whatever the dictionary never supplied. */
  return Array.isArray(src) ? src.map((s) => dict[s] || s) : dict[src] || src;
}
const EXPECT = Object.fromEntries(Object.keys(SOURCE).map((k) => [k, expected(k)]));
const ARTICLES = [
  "design-services", "project-cost", "project-time", "order-an-item",
  "print-files", "where-is-the-studio", "get-started",
];

mkdirSync(OUT.replace(/[^/]*$/, ""), { recursive: true });
if (SHOTDIR) mkdirSync(SHOTDIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bh625-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function dispose() {
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (e) {
    console.log("left a temp profile behind: " + profile);
  }
}

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
  `--window-size=${VW},${VH + 120}`, "about:blank",
], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
const waits = [];
function fire(method, m) {
  for (const w of waits.slice()) {
    if (w.method === method) { waits.splice(waits.indexOf(w), 1); w.resolve(m); }
  }
}
function onMessage(ev) {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const w = pending.get(m.id); pending.delete(m.id);
    m.error ? w.reject(new Error(m.method + ": " + m.error.message)) : w.resolve(m.result);
    return;
  }
  fire(m.method, m);
}
const timings = [];
function send(method, params) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = ++nextId;
    pending.set(id, {
      resolve: (v) => { timings.push({ method, ms: Date.now() - t0 }); resolve(v); },
      reject: (e) => { timings.push({ method, ms: Date.now() - t0, err: true }); reject(e); },
    });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
function once(method, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    waits.push({ method, resolve: (m) => { clearTimeout(timer); resolve(m); } });
  });
}
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error("page threw " + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  }
  return r.result.value;
}

const SEED = `
(function () {
  try { localStorage.setItem("brownhub-lang", ${JSON.stringify(LANG)}); } catch (e) {}
  try { localStorage.setItem("brownhub-theme", ${JSON.stringify(THEME)}); } catch (e) {}
  try { localStorage.setItem("brownhub-consent", JSON.stringify({ necessary: true, analytics: false, advertising: false, decided: true, at: new Date().toISOString() })); } catch (e) {}
  var S = window.__hf = { calls: [], muted: [], errs: [], res: [], cls: 0, shifts: [] };
  addEventListener("error", function (e) {
    if (e instanceof ErrorEvent) S.errs.push(e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno);
    else if (e.target && e.target.src) S.res.push(String(e.target.src).split("/").pop());
  }, true);
  new PerformanceObserver(function (l) {
    for (var e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      S.cls += e.value;
      S.shifts.push({ v: Math.round(e.value * 10000) / 10000, t: Math.round(e.startTime),
        src: (e.sources || []).slice(0, 3).map(function (s) {
          var n = s.node, host = n && n.nodeType === 1 ? n : n && n.parentElement;
          if (!host) return "no-node";
          return host.nodeName.toLowerCase() + "." + String(host.className || "").split(" ")[0] +
            " y" + Math.round(s.previousRect.top) + "->" + Math.round(s.currentRect.top) +
            " h" + Math.round(s.previousRect.height) + "->" + Math.round(s.currentRect.height);
        }) });
    }
  }).observe({ type: "layout-shift", buffered: true });
  var real = window.fetch;
  window.fetch = function (url, opts) {
    var u = String(url);
    if (/capture\\/feedback/.test(u)) {
      var body = null;
      try { body = JSON.parse((opts && opts.body) || "null"); } catch (e) { body = "unparseable"; }
      var c = { url: u, method: (opts && opts.method) || "GET",
                ctype: String((opts && opts.headers && (opts.headers["content-type"] || opts.headers["Content-Type"])) || "-"),
                credentials: (opts && opts.credentials) || "-", body: body,
                door: ${LIVE ? "'live'" : "'stubbed'"} };
      S.calls.push(c);
      if (c.door === "stubbed") {
        var reject = ${SERVE};
        return new Promise(function (res) {
          setTimeout(function () {
            res({ ok: !reject, status: reject ? 500 : 200,
                  json: function () { return Promise.resolve(reject ? { error: "rig rejection" } : { ok: true }); } });
          }, ${DOOR_MS});
        });
      }
      return real.apply(this, arguments).then(function (r) {
        c.status = r.status; c.ok = r.ok;
        return r.clone().text().then(function (t) { c.answer = String(t).slice(0, 240); return r; },
                                      function () { c.answer = "unread"; return r; });
      }, function (e) {
        c.status = 0; c.ok = false; c.answer = "blocked: " + (e && e.message || e); throw e;
      });
    }
    if (/supabase\\.co/.test(u)) {
      S.muted.push(u.split("?")[0].replace(/^https:\\/\\/[^/]*\\//, "/"));
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ data: null, error: null }); } });
    }
    return real.apply(this, arguments);
  };
})();`;

const PAGE_TOOLS = `
window.__bhHelp = (function () {
  function num(n) { return Math.round(n * 100) / 100; }
  function box(n) { var r = n.getBoundingClientRect(); return { w:num(r.width), h:num(r.height), x:num(r.x), y:num(r.y) }; }
  function rgb(s) {
    var m = /rgba?\\(([^)]*)\\)/.exec(s); if (!m) return null;
    var p = m[1].split(",").map(parseFloat);
    return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    var a = fg.a;
    return { r:fg.r*a+bg.r*(1-a), g:fg.g*a+bg.g*(1-a), b:fg.b*a+bg.b*(1-a), a:1 };
  }
  function paint(n) {
    var stack = [], opaque = null;
    for (var c = n; c; c = c.parentElement) {
      var b = rgb(getComputedStyle(c).backgroundColor);
      if (b && b.a > 0) { if (b.a >= 1) { opaque = b; break; } stack.push(b); }
    }
    var base = opaque || { r:255, g:255, b:255, a:1 };
    if (base.a < 1) base = over(base, { r:255, g:255, b:255, a:1 });
    for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function contrast(n) {
    var cs = getComputedStyle(n), bg = paint(n);
    var fg = over(rgb(cs.color) || { r:0, g:0, b:0, a:1 }, bg);
    var hi = Math.max(lum(fg), lum(bg)), lo = Math.min(lum(fg), lum(bg));
    return num((hi + 0.05) / (lo + 0.05));
  }
  function form(i) { return document.querySelectorAll(".feedback--answer")[i]; }
  function probe(f) {
    var root = f.closest("details"), stars = [].slice.call(f.querySelectorAll(".feedback__star"));
    var inputs = [].slice.call(f.querySelectorAll(".feedback__star input"));
    var spans = [].slice.call(f.querySelectorAll(".feedback__star span"));
    var group = f.querySelector(".feedback__stars");
    var rest = f.querySelector(".feedback__rest"), done = f.querySelector(".form-success");
    var error = f.querySelector(".feedback__error");
    var message = f.querySelector(".feedback-message"), contact = f.querySelector(".feedback-contact");
    var send = rest ? rest.querySelector('button[type="submit"]') : null;
    var hp = f.querySelector("[name='_site']");
    var labels = [].slice.call(rest ? rest.querySelectorAll(".form-field label") : []);
    var allFields = [].slice.call(f.querySelectorAll("input, button"));
    return {
      article: f.getAttribute("data-article"), open: !!root && root.open,
      selected: group ? group.getAttribute("data-selected") : null,
      groupAria: group ? group.getAttribute("aria-label") : null,
      starBoxes: stars.map(box), starMins: stars.map(function (n) { var cs = getComputedStyle(n); return { w:num(parseFloat(cs.minWidth)), h:num(parseFloat(cs.minHeight)) }; }),
      starColors: spans.map(function (n) { return getComputedStyle(n).color; }),
      starTransforms: spans.map(function (n) { return getComputedStyle(n).transform; }),
      starRatios: spans.map(contrast),
      starValues: inputs.map(function (n) { return { value:n.value, checked:n.checked, disabled:n.disabled, aria:n.getAttribute("aria-label") }; }),
      noteLabel: labels.length ? labels[0].textContent.replace(/\\s+/g, " ").trim() : null,
      contactLabel: labels.length > 1 ? labels[1].textContent.replace(/\\s+/g, " ").trim() : null,
      placeholder: message ? message.getAttribute("placeholder") : null,
      sendText: send ? send.textContent.replace(/\\s+/g, " ").trim() : null,
      sendBox: send ? box(send) : null, sendRatio: send ? contrast(send) : null,
      restHidden: !rest || rest.hidden, doneHidden: !done || done.hidden,
      busy: f.getAttribute("aria-busy") || "",
      sendDisabled: send ? !!send.disabled : null,
      sendOpacity: send ? num(parseFloat(getComputedStyle(send).opacity)) : null,
      errorHidden: !error || error.hidden,
      errorText: error ? error.textContent.replace(/\\s+/g, " ").trim() : null,
      errorBox: error ? box(error) : null, errorRatio: error ? contrast(error) : null,
      errorLive: error ? [error.getAttribute("role"), error.getAttribute("aria-live")].join("|") : null,
      doneText: done ? done.textContent.replace(/\\s+/g, " ").trim() : null,
      doneRatio: done ? contrast(done) : null, sent: f.getAttribute("data-sent") || "",
      disabled: allFields.map(function (n) { return !!n.disabled; }),
      hp: hp ? { ariaHidden: hp.closest(".hp").getAttribute("aria-hidden"), tabIndex:hp.tabIndex, box:box(hp) } : null,
      messageValue: message ? message.value : null, contactValue: contact ? contact.value : null
    };
  }
  function askAbove(n) {
    var r = n.getBoundingClientRect(), top = n.elementFromPoint ? null : null;
    var hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    var pressable = !!hit && (n === hit || n.contains(hit) || hit.contains(n));
    var askTop = null, askText = "";
    [].slice.call(document.querySelectorAll("body *")).forEach(function (m) {
      var cs = getComputedStyle(m);
      if (cs.position !== "fixed" && cs.position !== "sticky") return;
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
      var b = m.getBoundingClientRect();
      if (b.height < 20 || b.height > window.innerHeight * 0.5) return;
      if (b.top > window.innerHeight - 4 || b.top < window.innerHeight * 0.5) return;
      if (askTop === null || b.top < askTop) {
        askTop = Math.round(b.top); askText = (m.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 30);
      }
    });
    return { sendTop:Math.round(r.top), sendBottom:Math.round(r.bottom), pressable:pressable,
             hits:hit ? hit.tagName.toLowerCase() : "nothing", askTop:askTop, askText:askText,
             gap:askTop === null ? null : Math.round(askTop - r.bottom),
             queueH:getComputedStyle(document.documentElement).getPropertyValue("--queue-h").trim() };
  }
  return { probe:probe, form:form, askAbove:askAbove, num:num, contrast:contrast };
})();`;

const MEASURE = `(function () {
  var q = function (s) { return document.querySelector(s); };
  var forms = [].slice.call(document.querySelectorAll(".feedback--answer"));
  var grid = q(".feedback__grid"), rail = q(".feedback__links"), support = q("#support");
  var intro = q("#support .section__head p"), heading = q("#support h2");
  var actions = [].slice.call(document.querySelectorAll(".help-support__actions a"));
  return JSON.stringify({
    lang: document.documentElement.lang, dir: document.documentElement.dir || "ltr",
    theme: document.documentElement.getAttribute("data-theme"),
    mode: document.documentElement.getAttribute("data-theme-mode"),
    title: document.title,
    overflow: { doc:document.documentElement.scrollWidth, client:document.documentElement.clientWidth },
    legacyVotes: document.querySelectorAll(".feedback__vote").length,
    legacyBand: !!q("#feedback"), support: !!support,
    grid: grid ? { display:getComputedStyle(grid).display, cols:getComputedStyle(grid).gridTemplateColumns, gap:getComputedStyle(grid).gap } : null,
    heading: heading ? { text:heading.textContent.trim(), ratio:window.__bhHelp.contrast(heading) } : null,
    intro: intro ? { text:intro.textContent.replace(/\\s+/g, " ").trim(), ratio:window.__bhHelp.contrast(intro) } : null,
    actions: actions.map(function (a) { return { text:a.textContent.replace(/\\s+/g, " ").trim(), href:a.getAttribute("href"), ratio:window.__bhHelp.contrast(a), box:window.__bhHelp.num(a.getBoundingClientRect().height) }; }),
    findUs: (function () { var h3 = [].slice.call(document.querySelectorAll(".rail-card h3")).filter(function (x) { return x.nextElementSibling && x.nextElementSibling.tagName === "ADDRESS"; })[0]; return h3 ? h3.textContent.trim() : null; })(),
    railY: rail ? window.__bhHelp.num(rail.getBoundingClientRect().y) : null,
    railLinks: [].slice.call(document.querySelectorAll(".feedback__links a")).map(function (a) { return { text:a.textContent.trim(), href:a.getAttribute("href") }; }),
    footerHelp: (function () { var a = q(".footer__legal a[href$='help.html']"); return a ? { text:a.textContent.trim(), href:a.getAttribute("href") } : null; })(),
    forms: forms.map(window.__bhHelp.probe),
    scripts: performance.getEntriesByType("resource").filter(function (r) { return /\\.js(\\?|$)/.test(r.name); })
      .map(function (r) { return { f:r.name.split("/").pop(), status:r.responseStatus, ms:Math.round(r.duration), bytes:r.transferSize }; })
      .filter(function (r) { return /feedback|translate|search|askqueue|chat/.test(r.f); }),
    cls: window.__bhHelp.num(window.__hf.cls * 1000) / 1000, errs: window.__hf.errs.slice(0, 6),
    shifts: window.__hf.shifts.slice(0, 8)
  });
})()`;

async function main() {
  let list = [];
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) { list = await r.json(); if (list.some((t) => t.type === "page")) break; }
    } catch (e) { /* Chrome still booting */ }
    await sleep(250);
  }
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = onMessage;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws failed")); });

  await send("Page.enable"); await send("Runtime.enable");
  await send("Network.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 2, mobile: VW < 700 });
  if (THEME === "light") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  else if (THEME === "dark") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  // A template that does not parse dies silently inside the page and shows up
  // hundreds of lines later as "undefined is not a function".
  for (const [name, src] of [["SEED", SEED], ["PAGE_TOOLS", PAGE_TOOLS], ["MEASURE", MEASURE]]) {
    try { new Function(src); } catch (e) { throw new Error(`${name} does not parse: ${e.message}`); }
  }
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_TOOLS });

  const urls = new Map(), failed = [], consoleEntries = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Network.requestWillBeSent") urls.set(m.params.requestId, m.params.request.url);
    else if (m.method === "Network.loadingFailed") {
      const u = urls.get(m.params.requestId) || "?";
      failed.push(m.params.errorText + " " + (m.params.type || "") + " " + u.split("/").slice(-2).join("/").split("?")[0]);
    } else if (m.method === "Log.entryAdded") {
      const en = m.params.entry;
      if (en.level === "error" || en.level === "warning") consoleEntries.push(en.source + " " + String(en.text).slice(0, 180));
    }
  });

  async function atRest() {
    let last = -1, stable = 0, y = -1;
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      y = Number(await ev("String(Math.round(window.scrollY))"));
      if (y === last) { if (++stable >= 3) break; } else { stable = 0; last = y; }
    }
    return y;
  }

  async function boot() {
    let facts = null, loads = [];
    for (let i = 0; i < 45; i++) {
      facts = JSON.parse(await ev(`(function () {
        var forms = document.querySelectorAll(".feedback--answer");
        var first = forms.length ? forms[0].querySelector(".feedback__star input") : null;
        return JSON.stringify({
          forms: forms.length, legacy: document.querySelectorAll(".feedback__vote").length,
          aria: first ? first.getAttribute("aria-label") : null,
          lang: document.documentElement.lang, dir: document.documentElement.dir || "ltr",
          nav: !!document.documentElement.style.getPropertyValue("--nav-h")
        });
      })()`));
      loads = JSON.parse(await ev(`JSON.stringify(performance.getEntriesByType("resource")
        .filter(function (r) { return /\\.js(\\?|$)/.test(r.name); })
        .map(function (r) { return { f:r.name.split("/").pop(), s:r.responseStatus }; }))`));
      const dead = loads.filter((r) => r.s !== 200).map((r) => `${r.f} http ${r.s}`);
      const translated = facts.aria === EXPECT.stars[0];
      if (facts.forms >= 7 && facts.legacy === 0 && translated && facts.nav && dead.length === 0) return { facts, loads, dead: [] };
      await sleep(dead.length ? 250 : 400);
    }
    return { facts, loads, dead: loads.filter((r) => r.s !== 200).map((r) => `${r.f} http ${r.s}`) };
  }

  const url = `${ORIGIN}/help.html${LIVE ? "" : "?rig=1"}`;
  let attempt = null;
  for (let n = 1; n <= 3; n++) {
    const nav = once("Page.loadEventFired", 120000);
    await send("Page.navigate", { url });
    await nav;
    attempt = await boot();
    attempt.tries = n;
    if (attempt.dead.length === 0) break;
  }
  if (attempt.facts.forms < 7) throw new Error("the per-answer forms never appeared: " + JSON.stringify(attempt.facts));
  if (attempt.dead.length) throw new Error("a script never loaded: " + JSON.stringify(attempt.dead));

  const measure = JSON.parse(await ev(MEASURE));
  const results = { arm: ARM, url, lang: LANG, theme: THEME, mode: measure.mode, vw: VW, vh: VH, attempt: { tries: attempt.tries, facts: attempt.facts }, measure, shots: {}, flows: {} };
  let firstProbe = measure.forms[0];

  async function shoot(tag, article) {
    if (!SHOTDIR) return;
    const clip = JSON.parse(await ev(`(function () {
      var f = document.querySelector('[data-article="${article}"]'), el = f.closest("details");
      el.scrollIntoView({ block: "start" }); var b = el.getBoundingClientRect();
      return JSON.stringify({ x:Math.max(0, Math.round(b.x + window.scrollX)), y:Math.max(0, Math.round(b.y + window.scrollY)),
        width:Math.round(b.width), height:Math.round(b.height), ink:el.querySelectorAll("p,button,label,textarea,input,h2,h3,summary").length,
        words:(el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 55) });
    })()`));
    await sleep(180);
    let reveal = "no [data-rv] here";
    for (let i = 0; i < 25; i++) {
      reveal = await ev(`(function () {
        var dim = [].slice.call(document.querySelectorAll('[data-article="${article}"] ~ *, details [data-rv]'))
          .filter(function (x) { return x.closest("details").getAttribute("data-article") === "${article}" && getComputedStyle(x).opacity !== "1"; });
        if (!dim.length) return "settled";
        return dim.length + " dim: " + dim.map(function (x) { return (x.className || x.tagName) + " op" + getComputedStyle(x).opacity; }).join(",");
      })()`);
      if (reveal === "settled") break;
      await sleep(120);
    }
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
      clip: { x:clip.x, y:clip.y, width:clip.width, height:clip.height, scale:1 } });
    const buf = Buffer.from(s.data, "base64");
    writeFileSync(join(SHOTDIR, `${ARM}-${LANG}-${THEME}-${VW}x${VH}-${tag}.png`), buf);
    results.shots[tag] = { ...clip, md5:createHash("md5").update(buf).digest("hex").slice(0, 12), bytes:buf.length, reveal };
  }

  async function waitForForm(index, wanted) {
    for (let i = 0; i < 30; i++) {
      const f = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${index})))`));
      if (!wanted || f.selected === wanted) return f;
      await sleep(100);
    }
    return JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${index})))`));
  }

  async function tapStar(index, value) {
    await ev(`(function () {
      var f = window.__bhHelp.form(${index}), input = f.querySelectorAll(".feedback__star input")[${value - 1}], root = f.closest("details");
      if (!root.open) root.open = true;
      var b = input.closest(".feedback__star").getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + b.top - window.innerHeight * 0.35 }); return "placed";
    })()`);
    const placedY = await atRest();
    const hit = JSON.parse(await ev(`(function () {
      var f = window.__bhHelp.form(${index}), n = f.querySelectorAll(".feedback__star")[${value - 1}];
      var r = n.getBoundingClientRect(), at = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return JSON.stringify({ y:Math.round(r.top), x:Math.round(r.left + r.width / 2), tag:at ? at.tagName.toLowerCase() : "nothing",
                              label:(at && at.closest && at.closest(".feedback__star")) === n });
    })()`));
    await ev(`(function () { window.__bhHelp.form(${index}).querySelectorAll(".feedback__star input")[${value - 1}].click(); return "tapped"; })()`);
    const probe = await waitForForm(index, String(value));
    return { placedY, hit, probe, calls: Number(await ev("String(window.__hf.calls.length)")) };
  }

  async function noteClearance(index) {
    await ev(`(function () {
      var f = window.__bhHelp.form(${index}), b = f.querySelector('.feedback__rest button[type="submit"]');
      window.scrollTo({ top: window.scrollY + b.getBoundingClientRect().top - window.innerHeight * 0.65 }); return "placed";
    })()`);
    const y = await atRest();
    const clearance = await ev(`(function () {
      var f = window.__bhHelp.form(${index});
      return JSON.stringify(window.__bhHelp.askAbove(f.querySelector(".feedback__rest button[type=submit]")));
    })()`);
    return Object.assign({ y }, JSON.parse(clearance));
  }

  /* data-selected lands the instant the radio is clicked, but the fill itself is a
     .16s transition. Probed before it ends, all five spans still report their
     from-colour and the gate cannot tell four stars from five. */
  async function armFilled(index) {
    await ev(`(function () {
      var span = window.__bhHelp.form(${index}).querySelector(".feedback__star span");
      window.__bhFilled = false;
      span.addEventListener("transitionend", function () { window.__bhFilled = true; }, { once: true });
      return "armed";
    })()`);
  }

  async function awaitFilled(index) {
    for (let i = 0; i < 24; i++) {
      if (await ev("window.__bhFilled === true")) return "filled";
      await sleep(50);
    }
    return "never fired";
  }

  /* A round trip is not a stopwatch. Every wait in this rig polls a fact the page states
     about itself, because the one thing already proved here is that a fixed sleep samples
     the panel before the answer lands. */
  async function pollUntil(expr, limit = 60, step = 50) {
    for (let i = 0; i < limit; i++) {
      if (await ev(expr)) return true;
      await sleep(step);
    }
    return false;
  }

  if (SHOTDIR) await shoot("idle", ARTICLES[RATE_FORM]);

  if (FLOW === "rate" || FLOW === "both") {
    await armFilled(RATE_FORM);
    const tapped = await tapStar(RATE_FORM, 4);
    const fill = await awaitFilled(RATE_FORM);
    const state = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${RATE_FORM})))`));
    results.flows.rate = { ...tapped, fill, state };
    if (SHOTDIR) await shoot("rated", ARTICLES[RATE_FORM]);
  }

  if (FLOW === "note" || FLOW === "both") {
    const opened = await tapStar(NOTE_FORM, 3);
    const send = await noteClearance(NOTE_FORM);
    await ev(`(function () {
      var f = window.__bhHelp.form(${NOTE_FORM});
      f.querySelector(".feedback-message").value = "The pricing is not here.";
      f.querySelector(".feedback-contact").value = "+233 53 558 3460";
      f.requestSubmit(); return "submitted";
    })()`);
    let doneProbe = null;
    for (let i = 0; i < 60; i++) {
      doneProbe = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${NOTE_FORM})))`));
      if (doneProbe.sent === "1" || (!doneProbe.restHidden && doneProbe.doneText && doneProbe.doneText !== EXPECT.thanks)) break;
      await sleep(120);
    }
    const beforeSecond = Number(await ev("String(window.__hf.calls.length)"));
    await ev(`(function () { window.__bhHelp.form(${NOTE_FORM}).requestSubmit(); return "again"; })()`);
    await sleep(350);
    const afterSecond = Number(await ev("String(window.__hf.calls.length)"));
    const finalProbe = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${NOTE_FORM})))`));
    const calls = JSON.parse(await ev("JSON.stringify(window.__hf.calls)"));
    const last = calls[calls.length - 1] || {};
    results.flows.note = { opened, send, doneProbe, finalProbe, beforeSecond, afterSecond, calls, last,
      otherForm: JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${FLOW === "both" ? RATE_FORM : NOTE_FORM + 1})))`)) };
    if (SHOTDIR) await shoot("sent", ARTICLES[NOTE_FORM]);
  }

  /* Only a browser knows what a refusal looks like. The static test can prove the line
     is in the markup; it cannot prove the note survives the failure, that Send is dead
     while the request is open, or that Arabic speaks when the send does not land. */
  if (FLOW === "reject") {
    const opened = await tapStar(REJECT_FORM, 2);
    await ev(`(function () {
      var f = window.__bhHelp.form(${REJECT_FORM});
      f.querySelector(".feedback-message").value = "Sizes are not listed.";
      f.requestSubmit(); return "submitted";
    })()`);
    const sawWaiting = await pollUntil(`window.__bhHelp.form(${REJECT_FORM}).getAttribute("aria-busy") === "true"`);
    const mid = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${REJECT_FORM})))`));
    const callsMid = Number(await ev("String(window.__hf.calls.length)"));
    await ev(`(function () { window.__bhHelp.form(${REJECT_FORM}).requestSubmit(); return "again"; })()`);
    await sleep(120);
    const callsHeld = Number(await ev("String(window.__hf.calls.length)"));
    const sawError = await pollUntil(`(function () { var e = window.__bhHelp.form(${REJECT_FORM}).querySelector(".feedback__error"); return !!e && !e.hidden; })()`, 80, 60);
    const after = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${REJECT_FORM})))`));
    await ev(`(function () { window.__bhHelp.form(${REJECT_FORM}).requestSubmit(); return "retried"; })()`);
    const retried = await pollUntil(`window.__bhHelp.form(${REJECT_FORM}).getAttribute("data-sent") === "1"`, 80, 60);
    const retryProbe = JSON.parse(await ev(`JSON.stringify(window.__bhHelp.probe(window.__bhHelp.form(${REJECT_FORM})))`));
    const calls = JSON.parse(await ev("JSON.stringify(window.__hf.calls)"));
    results.flows.reject = { opened, sawWaiting, mid, callsMid, callsHeld, sawError, after, retried, retryProbe,
      calls: calls.length, answer: (calls[0] || {}).answer || null };
    if (SHOTDIR) await shoot("rejected", ARTICLES[REJECT_FORM]);
  }

  const harvest = {
    muted: JSON.parse(await ev("JSON.stringify(window.__hf.muted)")),
    res: JSON.parse(await ev("JSON.stringify(window.__hf.res)")),
    errs: JSON.parse(await ev("JSON.stringify(window.__hf.errs)")),
    cls: Number(await ev("String(Math.round(window.__hf.cls * 10000) / 10000)")),
    shifts: JSON.parse(await ev("JSON.stringify(window.__hf.shifts.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, 8))")),
  };
  results.net = { failed, muted: harvest.muted, res: harvest.res };
  results.console = consoleEntries.slice(0, 14);
  results.cdp = { calls: timings.length, slow: timings.filter((t) => t.ms > 1500), last: timings.slice(-1)[0] };
  results.clsFinal = harvest.cls;
  results.errsFinal = harvest.errs;
  writeFileSync(OUT, JSON.stringify(results, null, 2));

  const fails = [];
  const m = results.measure;
  if (m.legacyVotes || m.legacyBand) fails.push("the old one-page Yes/No panel is still present");
  if (!m.support || m.grid.display !== "grid") fails.push("the support block is not a grid");
  if (m.overflow.doc > m.overflow.client + 1) fails.push("horizontal scroll");
  if (m.forms.length !== 7) fails.push(`expected seven answer forms, saw ${m.forms.length}`);
  if (m.forms.map((f) => f.article).join(",") !== ARTICLES.join(",")) fails.push("the answer articles changed");
  for (const [i, f] of m.forms.entries()) {
    const where = f.article || `form ${i}`;
    if (f.starBoxes.length !== 5) fails.push(`${where} does not offer five stars`);
    if (f.starMins.some((s) => s.w < 44 || s.h < 44)) fails.push(`${where} has a star target under 44px`);
    if (f.groupAria !== EXPECT.group) fails.push(`${where} group reads "${f.groupAria}", not "${EXPECT.group}"`);
    for (let s = 0; s < f.starValues.length; s++) {
      if (f.starValues[s].aria !== EXPECT.stars[s]) fails.push(`${where} star ${s + 1} reads "${f.starValues[s].aria}", not "${EXPECT.stars[s]}"`);
    }
    if (f.noteLabel !== EXPECT.note) fails.push(`${where} note label is not the dictionary's`);
    if (f.contactLabel !== EXPECT.contact) fails.push(`${where} contact label is not the dictionary's`);
    if (f.placeholder !== EXPECT.placeholder) fails.push(`${where} placeholder is not the dictionary's`);
    if (f.sendText !== EXPECT.send) fails.push(`${where} send label is not the dictionary's`);
    if (f.doneText !== EXPECT.thanks) fails.push(`${where} thank-you is not the dictionary's`);
    if (f.restHidden !== true) fails.push(`${where} opened its note before a star was chosen`);
    if (f.doneHidden !== true) fails.push(`${where} showed its thank-you before a submission`);
    if (!f.hp || f.hp.ariaHidden !== "true" || f.hp.tabIndex !== -1) fails.push(`${where} exposes its honeypot`);
    if (f.starRatios.some((r) => r < 3)) fails.push(`${where} has a star below 3:1 against the band`);
  }
  if (m.heading.text !== EXPECT.still) fails.push("the support heading is not localized");
  if (m.intro.text !== EXPECT.support) fails.push("the support intro is not localized");
  if (m.intro.ratio < 4.5) fails.push("the support intro fails AA");
  if (m.heading.ratio < 4.5) fails.push("the support heading fails AA");
  if (m.actions.length !== 3) fails.push("the support block does not offer contact, WhatsApp and directions");
  const wantActions = [EXPECT.contactBtn, EXPECT.whatsapp, EXPECT.directions];
  if (m.actions.map((a) => a.text).join("|") !== wantActions.join("|")) fails.push(`support actions read ${m.actions.map((a) => a.text).join("|")}`);
  /* 44px is the star row's contract, because five targets of one control sit side by
     side. The three actions are lone pills in the site's own .btn rhythm (38.5px tall
     on every page), and WCAG 2.5.8 asks 24px of those; raising only this band would
     buy a help button no other page has. */
  if (m.actions.some((a) => a.ratio < 4.5 || a.box < 24)) fails.push(`a support action fails AA or is under 24px: ${JSON.stringify(m.actions)}`);
  if (m.findUs !== EXPECT.find) fails.push("the location rail heading is not localized");
  if (m.railLinks.some((l) => /help\.html/.test(l.href))) fails.push("the rail links back at itself");
  if (!m.footerHelp) fails.push("the footer has no Help route");
  if (LANG === "ar" && m.dir !== "rtl") fails.push("Arabic did not flip the page");

  const r = results.flows.rate;
  if (r) {
    if (!r.hit.label) fails.push(`the rate tap at (${r.hit.x},${r.hit.y}) landed on ${r.hit.tag}, not the fourth star`);
    if (r.probe.selected !== "4") fails.push(`choosing four stars left data-selected at ${r.probe.selected}`);
    if (r.calls !== 0) fails.push("choosing a star submitted before Send was pressed");
    const accent = r.state.starColors[3];
    const filled = r.state.starColors.slice(0, 4);
    if (filled.some((c) => c !== accent)) fails.push("the first four stars did not fill alike: " + filled.join(" | "));
    if (r.state.starColors[4] === accent) fails.push("the fifth star filled with the fourth");
    if (r.state.starTransforms.slice(0, 4).every((x) => x === "none")) fails.push("chosen stars did not scale");
    if (r.fill !== "filled") fails.push(`the star fill never finished its transition (${r.fill})`);
    if (r.state.starColors[3] === firstProbe.starColors[0]) fails.push("a chosen star kept the unchosen colour: " + r.state.starColors.join(" | "));
    if (r.state.restHidden !== false) fails.push("choosing a star did not reveal the optional note");
    if (r.state.doneHidden !== true) fails.push("a rating-only tap falsely claimed the feedback was sent");
    if (r.state.disabled.some(Boolean)) fails.push("a rating-only tap locked the answer");
  }
  const n = results.flows.note;
  if (n) {
    if (n.opened.probe.selected !== "3") fails.push("the note branch did not choose three stars");
    if (n.opened.calls !== 0) fails.push("choosing a star in the note branch posted before Send");
    const sc = n.send;
    if (sc.sendTop < 0 || sc.sendBottom > VH) fails.push(`the note left Send offscreen (y ${sc.sendTop}..${sc.sendBottom} of ${VH})`);
    else if (!sc.pressable) fails.push(`the note opened with Send under ${sc.hits} (y ${sc.sendTop}..${sc.sendBottom}, ask ${sc.askTop} "${sc.askText}")`);
    else if (sc.gap !== null && sc.gap < 8) fails.push(`Send sits ${sc.gap}px from the bottom ask`);
    if (!n.last || !/capture\/feedback$/.test(n.last.url)) fails.push("the note did not aim at capture/feedback");
    if (n.last.method !== "POST" || !/^application\/json/.test(n.last.ctype) || n.last.credentials !== "omit") fails.push("the note is not an anonymous JSON POST");
    const body = n.last.body || {};
    if (body.rating !== 3 || body.topic !== "answer" || body.article !== "project-cost") fails.push("the note body lost its score or answer: " + JSON.stringify(body));
    if (body.message !== "The pricing is not here." || body.contact !== "+233 53 558 3460") fails.push("the typed note did not ride");
    if (body._site !== "" || body.page !== "/help.html" || body.lang !== m.lang) fails.push("the note body leaked the honeypot, page or language");
    if (LIVE && (n.last.door !== "live" || n.last.status !== 200 || n.last.ok !== true || !/"ok"\s*:\s*true/.test(String(n.last.answer)))) {
      fails.push("the live function did not accept the note: " + JSON.stringify({ door:n.last.door, status:n.last.status, ok:n.last.ok, answer:n.last.answer }));
    }
    if (n.finalProbe.sent !== "1") fails.push("a sent note did not lock its form: " + JSON.stringify(n.finalProbe.doneText));
    if (n.finalProbe.restHidden !== true) fails.push("a sent note stayed open");
    if (n.finalProbe.doneHidden !== false) fails.push("a sent note never showed its thank-you");
    if (n.finalProbe.doneText !== EXPECT.thanks) fails.push("the thank-you changed after submission instead of using the dictionary");
    if (n.finalProbe.disabled.some((x) => !x)) fails.push("a sent form remained editable");
    if (n.afterSecond !== n.beforeSecond) fails.push(`the sent form accepted a second submission (${n.afterSecond - n.beforeSecond} extra calls)`);
    if (n.finalProbe.doneRatio < 4.5) fails.push("the thank-you fails AA");
    if (FLOW === "both") {
      if (n.otherForm.selected !== "4" || n.otherForm.sent !== "") fails.push("one answer's submission affected another answer");
    }
  }
  const j = results.flows.reject;
  if (j) {
    if (j.opened.probe.selected !== "2") fails.push("the reject branch did not choose two stars");
    if (!j.sawWaiting) fails.push("an open send never announced a waiting state");
    if (j.mid.busy !== "true") fails.push("the form did not carry aria-busy while the request was open");
    if (j.mid.sendDisabled !== true) fails.push("Send stayed pressable for 3.5 seconds of round trip");
    if (!(j.mid.sendOpacity < 0.95)) fails.push(`the waiting Send looks identical to an idle one (opacity ${j.mid.sendOpacity})`);
    if (j.callsMid !== 1) fails.push(`one press of Send fired ${j.callsMid} requests`);
    if (j.callsHeld !== 1) fails.push(`a press during the round trip added ${j.callsHeld - 1} more requests`);
    if (!j.sawError) fails.push("a refused send never said so");
    if (j.after.errorHidden !== false) fails.push("the failure line stayed hidden after a refusal");
    if (j.after.errorText !== EXPECT.fail) fails.push(`the failure line is not the dictionary's: "${j.after.errorText}"`);
    if (!(j.after.errorBox.h > 0)) fails.push("the failure line occupies no box");
    if (j.after.errorRatio < 4.5) fails.push(`the failure line fails AA (${j.after.errorRatio})`);
    if (!/status\|polite/.test(String(j.after.errorLive))) fails.push("the failure line is not announced");
    if (j.after.sent !== "") fails.push("a refused send claimed the feedback reached the studio");
    if (j.after.doneHidden !== true) fails.push("a refused send showed the thank-you");
    if (j.after.restHidden !== false) fails.push("a refused send closed the note form");
    if (j.after.messageValue !== "Sizes are not listed.") fails.push(`a refused send lost what the visitor wrote: "${j.after.messageValue}"`);
    if (j.after.disabled.some(Boolean)) fails.push("a refused send left the form locked");
    if (j.after.busy === "true") fails.push("a refused send stayed busy forever");
    if (!j.retried) fails.push("the retry never landed, so \"try again\" was bad advice");
    if (j.retryProbe.sent !== "1") fails.push("a successful retry never locked its form");
    if (j.retryProbe.errorHidden !== true) fails.push("the stale failure line outlived the send that fixed it");
    if (j.retryProbe.doneHidden !== false) fails.push("a retry that landed never thanked the visitor");
    if (j.calls !== 2) fails.push(`the reject flow expected two posts, saw ${j.calls}`);
  }

  /* Boot CLS is the number a visitor is scored on. The shifts the flows add are the
     note panel opening under a click — and Chrome only forgives a shift that follows
     real user input, which a programmatic .click() is not. They are printed, not gated. */
  if (m.cls > 0.1) fails.push(`boot layout shift ${m.cls}`);
  if (results.errsFinal.length) fails.push("page errors: " + JSON.stringify(results.errsFinal.slice(0, 3)));
  const deadLoads = results.net.res.filter((f) => /\.(js|css)(\?|$)/.test(f));
  if (deadLoads.length) fails.push("an asset never loaded: " + JSON.stringify(deadLoads.slice(0, 5)));
  if (failed.length) fails.push("network failures: " + JSON.stringify(failed.slice(0, 5)));
  const noisy = results.console.filter((c) => /error|failed to load|refused|blocked|invalid/i.test(c));
  if (noisy.length) fails.push("console errors: " + JSON.stringify(noisy.slice(0, 4)));
  if (SHOTDIR) {
    Object.entries(results.shots).forEach(([tag, s]) => {
      if (s.ink < 4 || !s.words) fails.push(`${tag} cropped no meaningful help content`);
      if (!/^(settled|no \[data-rv\] here)$/.test(s.reveal)) fails.push(`${tag} was shot mid-reveal: ${s.reveal}`);
      if (tag === "idle") return;
      if (s.md5 === results.shots.idle.md5) fails.push(`${tag} is byte-identical to idle`);
    });
  }

  console.log(`\n### ${ARM} ${LANG} ${THEME} ${VW}x${VH}  ${url}`);
  console.log(`  forms        ${m.forms.length}, legacy ${m.legacyVotes}, overflow ${m.overflow.doc}/${m.overflow.client}`);
  console.log(`  language     ${m.lang}/${m.dir}, star "${m.forms[0].starValues[0].aria}", send "${m.forms[0].sendText}"`);
  console.log(`  support      "${m.heading.text}" / ${m.actions.map((a) => a.text).join(" | ")}, grid ${m.grid.cols}`);
  if (r) console.log(`  rate         selected ${r.state.selected}, fill ${r.fill}, colours ${r.state.starColors.join(" ")} rest ${r.state.restHidden} calls ${r.calls}`);
  if (n) console.log(`  note         body ${JSON.stringify(n.last.body)} sent ${n.finalProbe.sent} second calls ${n.beforeSecond}->${n.afterSecond}`);
  if (n) console.log(`  send clear   y ${n.send.y} send ${n.send.sendTop}..${n.send.sendBottom}/${VH} gap ${n.send.gap} tappable ${n.send.pressable} queue ${n.send.queueH}`);
  console.log(`  CLS          boot ${m.cls} run ${results.clsFinal}; worst shifts ${JSON.stringify(harvest.shifts.slice(0, 3))}`);
  console.log(`  scripts      ${JSON.stringify(m.scripts)}`);
  if (SHOTDIR) console.log("  shots        " + Object.entries(results.shots).map(([t, s]) => `${t} ${s.width}x${s.height} ${s.md5}`).join("  "));
  console.log("  written      " + OUT + (SHOTDIR ? " + " + SHOTDIR : ""));
  console.log("\n" + (fails.length ? "GATE FAILED:\n  - " + fails.join("\n  - ") : "all gates clean"));

  ws.close();
  await dispose();
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (e) => { console.error("rig died: " + e.stack); await dispose(); process.exit(2); });
