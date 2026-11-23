/*
  Blink proof for #625 and #626: the two-tap answer rating on help.html, measured in a real
  engine rather than reasoned about from the stylesheet.

  node tools/help625.mjs [--arm=local|live] [--lang=en|ar] [--vw=1440] [--vh=900]
                         [--port=9425] [--out=/tmp/bh625/<arm>-<lang>-<vw>x<vh>.json]
                         [--shot=/tmp/bh625] [--flow=yes|no|both]

  Why the network is stubbed, and where it is not. The local arm never lets a request out:
  a rating on a test page is not a fact about a customer, and the studio's feedback table is
  business data, so the local arm mutes capture/feedback and every other *.supabase.co call
  this page can make (the assistant, the chat transcript log), then asserts the client's own
  contract — the URL it aims at, the shape of the body it hands fetch, the states it paints
  when the answer comes back ok or does not. The live arm lets the one feedback POST leave
  the browser for real, because that is the request a curl cannot prove: the page's own CSP
  has to admit the functions origin, the Origin header has to be the site, and the deployed
  function has to answer. The server's status and body are filed with the call and gated, and
  the rows the live arm leaves behind are read back and deleted on the SQL rail afterwards.
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
const ORIGIN = ARG.origin || (ARM === "local" ? "http://127.0.0.1:8123" : "https://www.brownhub283.com");
const LANG = ARG.lang || "en";
const VW = Number(ARG.vw || 1440);
const VH = Number(ARG.vh || 900);
const PORT = Number(ARG.port || 9425);
const FLOW = ARG.flow || "both";
const OUT = ARG.out || `/tmp/bh625/${ARM}-${LANG}-${VW}x${VH}-${FLOW}.json`;
const SHOTDIR = ARG.shot || null;
mkdirSync(OUT.replace(/[^/]*$/, ""), { recursive: true });
if (SHOTDIR) mkdirSync(SHOTDIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bh625-"));
/* Chrome keeps writing into the profile after the kill, so a plain rmSync can hit
   ENOTEMPTY. A leftover temp profile is only disk, never a claim — never let it
   change the rig's exit code. */
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
  /* The window must be at least as tall as the viewport being emulated or Blink clamps
     the override and this rig measures a different phone than it names. */
  `--window-size=${VW},${VH + 120}`, "about:blank",
], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
const waits = [];
function fire(method, m) {
  for (const w of waits.slice()) if (w.method === method) { waits.splice(waits.indexOf(w), 1); w.resolve(m); }
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
/* The rig's own clock: when a proof hangs, this says whether the page or the wire
   is the one that stopped answering. */
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
function once(method, ms) {  return new Promise((resolve) => {
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

/* Installed before the page's own scripts. In the local arm nothing reaches the project. */
const LIVE = ARM === "live";
const SEED = `
(function () {
  try { localStorage.setItem("brownhub-lang", ${JSON.stringify(LANG)}); } catch (e) {}
  /* Consent is answered before the page reads it, exactly as on a second visit: the
     cookie notice is a fixed strip, and while it was open it sat over the top of every
     screenshot and the rating's own heading went out of the frame. */
  try { localStorage.setItem("brownhub-consent", JSON.stringify({ necessary: true, analytics: false, advertising: false, decided: true, at: new Date().toISOString() })); } catch (e) {}
  var S = window.__hf = { calls: [], muted: [], errs: [], res: [], cls: 0 };
  /* A capture-phase "error" catches failed <img> and <script> loads too, whose
     message is undefined. Those belong with the network report, not with the
     page's own exceptions — mixing them makes a 404 look like a crash. */
  addEventListener("error", function (e) {
    if (e instanceof ErrorEvent) S.errs.push(e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno);
    else if (e.target && e.target.src) S.res.push(String(e.target.src).split("/").pop());
  }, true);
  new PerformanceObserver(function (l) {
    for (var e of l.getEntries()) if (!e.hadRecentInput) S.cls += e.value;
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
      /* The local arm answers its own: a rating left on a test page is not a fact about a
         customer, and the studio's feedback table is business data. */
      if (c.door === "stubbed") {
        return new Promise(function (res) {
          setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve({}); } }); }, 30);
        });
      }
      /* The live arm sends the real request and files the answer the server actually gave.
         The clone is read so the page still gets an unconsumed body. */
      return real.apply(this, arguments).then(function (r) {
        c.status = r.status; c.ok = r.ok;
        return r.clone().text().then(function (t) { c.answer = String(t).slice(0, 200); return r; },
                                      function () { c.answer = "unread"; return r; });
      }, function (e) { c.status = 0; c.ok = false; c.answer = "blocked: " + (e && e.message || e); throw e; });
    }
    if (/supabase\\.co/.test(u)) {
      S.muted.push(u.split("?")[0].replace(/^https:\\/\\/[^/]*\\//, "/"));
      return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ data: null, error: null }); } });
    }
    return real.apply(this, arguments);
  };
})();`;

/* One pass that reads every fact the gates need out of the live paint. */
const MEASURE = `
(function () {
  function num(n) { return Math.round(n * 100) / 100; }
  function box(n) { var r = n.getBoundingClientRect(); return { w: num(r.width), h: num(r.height), x: num(r.x), y: num(r.y) }; }
  function rgb(s) { var m = /rgba?\\(([^)]*)\\)/.exec(s); if (!m) return null;
    var p = m[1].split(",").map(function (v) { return parseFloat(v); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  /* A tinted pill is rgba(accent, .13) sitting on the alt band, which sits on the
     page. Reading the pill's own rgba as if it were opaque reports a colour nobody
     sees, so the stack is composited down to the first opaque layer instead. */
  function paint(n) {
    var stack = [], opaque = null;
    for (var c = n; c; c = c.parentElement) {
      var b = rgb(getComputedStyle(c).backgroundColor);
      if (b && b.a > 0) { if (b.a >= 1) { opaque = b; break; } stack.push(b); }
    }
    var base = opaque || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = over(base, { r: 255, g: 255, b: 255, a: 1 });
    for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function over(fg, bg) { var a = fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; }
  function ratio(n) {
    var cs = getComputedStyle(n), bg = paint(n);
    var fg = over(rgb(cs.color) || { r: 0, g: 0, b: 0, a: 1 }, bg);
    var hi = Math.max(lum(fg), lum(bg)), lo = Math.min(lum(fg), lum(bg));
    return num((hi + 0.05) / (lo + 0.05));
  }
  var q = function (s) { return document.querySelector(s); };
  var votes = [].slice.call(document.querySelectorAll(".feedback__vote"));
  var main = q(".feedback__main"), rail = q(".feedback__links"), band = q("#feedback");
  var intro = q(".feedback__main .section__head p");
  var out = {
    lang: document.documentElement.lang, dir: document.documentElement.dir || "ltr",
    title: document.title,
    overflow: { doc: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    band: band ? box(band) : null,
    grid: { cols: getComputedStyle(q(".feedback__grid")).gridTemplateColumns,
            gap: getComputedStyle(q(".feedback__grid")).gap,
            display: getComputedStyle(q(".feedback__grid")).display },
    railY: rail ? num(rail.getBoundingClientRect().y) : null,
    mainW: main ? box(main).w : null,
    intro: intro ? { text: intro.textContent.trim().slice(0, 60), ratio: ratio(intro) } : null,
    votes: votes.map(function (b) {
      var cs = getComputedStyle(b);
      return { label: b.textContent.trim(), box: box(b), aria: b.getAttribute("aria-label"),
               pressed: b.getAttribute("aria-pressed"), disabled: b.disabled,
               minHeight: num(parseFloat(cs.minHeight)), bgAlpha: (rgb(cs.backgroundColor) || { a: 0 }).a,
               bgComposite: [Math.round(paint(b).r), Math.round(paint(b).g), Math.round(paint(b).b)].join(","),
               bgImage: cs.backgroundImage.slice(0, 24),
               ratio: ratio(b) };
    }),
    /* The driver's own witness: aria-pressed is only ever set by js/feedback.js, so a
       null here means the script never ran — which no amount of markup would show. */
    armed: votes.length ? String(votes[0].getAttribute("aria-pressed")) : null,
    scripts: performance.getEntriesByType("resource")
      .filter(function (r) { return /\\.js(\\?|$)/.test(r.name); })
      .map(function (r) { return { f: r.name.split("/").pop(), status: r.responseStatus, ms: Math.round(r.duration), bytes: r.transferSize }; })
      .filter(function (r) { return /feedback|chat|translate|search|askqueue/.test(r.f); }),
    votesRow: votes.length ? num(votes[0].getBoundingClientRect().y) : null,
    sameRow: votes.length === 2 ? Math.abs(votes[0].getBoundingClientRect().y - votes[1].getBoundingClientRect().y) < 1 : null,
    restHidden: q("#feedback-rest") ? q("#feedback-rest").hidden : "absent",
    restBox: q("#feedback-rest") && !q("#feedback-rest").hidden ? box(q("#feedback-rest")) : null,
    doneHidden: q("#feedback-done") ? q("#feedback-done").hidden : "absent",
    hp: (function () { var h = q("[name='_site']"); if (!h) return null; var b = box(h);
      return { w: b.w, h: b.h, ariaHidden: h.closest(".hp").getAttribute("aria-hidden"), tabIndex: h.tabIndex }; })(),
    railLinks: [].slice.call(document.querySelectorAll(".feedback__links a")).map(function (a) {
      return { text: a.textContent.trim(), href: a.getAttribute("href") }; }),
    footerHelp: (function () { var a = q(".footer__legal a[href$='help.html']");
      return a ? { text: a.textContent.trim(), href: a.getAttribute("href") } : null; })(),
    cls: num(window.__hf.cls * 1000) / 1000, errs: window.__hf.errs.slice(0, 6)
  };
  return JSON.stringify(out);
})();`;

const CLICK = `(function (which) {
  var b = document.querySelector('.feedback__vote[data-vote="' + which + '"]');
  if (!b) return "no button";
  b.scrollIntoView({ block: "center" });
  b.click();
  return "clicked";
})`;

const NOTE = `(function (text, phone, submit) {
  var m = document.getElementById("feedback-message"), c = document.getElementById("feedback-contact");
  if (!m || !c) return "no fields";
  m.value = text; c.value = phone;
  var f = document.getElementById("feedback-form");
  if (submit) f.requestSubmit();
  return "typed";
})`;

const STATE = `(function () {
  var votes = [].slice.call(document.querySelectorAll(".feedback__vote"));
  var done = document.getElementById("feedback-done");
  var rest = document.getElementById("feedback-rest");
  return JSON.stringify({
    pressed: votes.map(function (b) { return b.getAttribute("data-vote") + "=" + b.getAttribute("aria-pressed") + (b.disabled ? "/off" : "/on"); }),
    ratios: votes.map(function (b) {
      var cs = getComputedStyle(b);
      var m = /rgba?\\(([^)]*)\\)/.exec(cs.color); var f = m && m[1].split(",").map(parseFloat);
      var mb = /rgba?\\(([^)]*)\\)/.exec(cs.backgroundColor); var g = mb && mb[1].split(",").map(parseFloat);
      return { fg: f && f.slice(0, 3).join(","), bg: g && g.slice(0, 3).join(","), alpha: g ? g[3] : 1 };
    }),
    restHidden: rest.hidden, doneHidden: done.hidden, doneText: done.textContent.trim(),
    focused: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
    calls: window.__hf.calls.length, muted: window.__hf.muted.slice(0, 8)
  });
})();`;

/* Where the note leaves its Send button. Two readings, because they answer two different
   questions: elementFromPoint at the button's own centre is the only thing that says
   whether a tap would land on it, and the top edge of any fixed/sticky bottom bar says how
   little room was left. The bars filter skips a full-viewport layer — .interactive-
   background is fixed and covers everything with pointer-events:none, and counting its top
   edge as a blocker made every clearance read a huge negative number while the tap landed
   on the button. */
const SENDCLEAR = `(function () {
  var send = document.querySelector('#feedback-rest button[type="submit"]');
  if (!send) return JSON.stringify({ error: "no send button in the open note" });
  var r = send.getBoundingClientRect();
  var top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  var pressable = !!top && (send === top || send.contains(top) || top.contains(send));
  var askTop = null, askText = "";
  [].slice.call(document.querySelectorAll("body *")).forEach(function (n) {
    var cs = getComputedStyle(n);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
    var b = n.getBoundingClientRect();
    if (b.height < 20 || b.height > window.innerHeight * 0.5) return;
    if (b.top > window.innerHeight - 4 || b.top < window.innerHeight * 0.5) return;
    if (askTop === null || b.top < askTop) {
      askTop = Math.round(b.top);
      askText = (n.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 26);
    }
  });
  return JSON.stringify({
    sendTop: Math.round(r.top), sendBottom: Math.round(r.bottom),
    pressable: pressable, hits: top ? top.tagName.toLowerCase() : "nothing",
    askTop: askTop, askText: askText,
    gap: askTop === null ? null : Math.round(askTop - r.bottom),
    queueH: getComputedStyle(document.documentElement).getPropertyValue("--queue-h").trim()
  });
})();`;

/* Pressed-pill contrast has to be read against the band it sits on, and the "answered"
   pill is white on the brand fill — the one state a visitor sees after a tap. */
const CONTRAST = `(function () {
  function rgb(s) { var m = /rgba?\\(([^)]*)\\)/.exec(s); if (!m) return null;
    var p = m[1].split(",").map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function over(fg, bg) { var a = fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }; }
  function paint(n) {
    var stack = [], opaque = null;
    for (var c = n; c; c = c.parentElement) {
      var b = rgb(getComputedStyle(c).backgroundColor);
      if (b && b.a > 0) { if (b.a >= 1) { opaque = b; break; } stack.push(b); }
    }
    var base = opaque || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = over(base, { r: 255, g: 255, b: 255, a: 1 });
    for (var i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  var out = [];
  [].slice.call(document.querySelectorAll(".feedback__vote")).forEach(function (b) {
    var cs = getComputedStyle(b), bg = paint(b);
    var fg = over(rgb(cs.color) || { r: 0, g: 0, b: 0, a: 1 }, bg);
    var hi = Math.max(lum(fg), lum(bg)), lo = Math.min(lum(fg), lum(bg));
    out.push({ vote: b.getAttribute("data-vote"), pressed: b.getAttribute("aria-pressed"),
               disabled: b.disabled, ratio: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100,
               opacity: cs.opacity });
  });
  var d = document.getElementById("feedback-done");
  var bgd = paint(d), fgd = over(rgb(getComputedStyle(d).color) || { r: 0, g: 0, b: 0, a: 1 }, bgd);
  var hi2 = Math.max(lum(fgd), lum(bgd)), lo2 = Math.min(lum(fgd), lum(bgd));
  return JSON.stringify({ votes: out, done: Math.round((hi2 + 0.05) / (lo2 + 0.05) * 100) / 100,
                          doneVisible: !d.hidden });
})();`;

async function main() {
  let list = [];
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) { list = await r.json(); if (list.some((t) => t.type === "page")) break; }
    } catch (e) { /* still booting */ }
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
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });

  /* A bare "net::ERR_… Script" says nothing about which file died, so the id is
     mapped back to its url, and the console is kept because a CSP refusal only ever
     shows itself there. */
  const urls = new Map(), failed = [], consoleEntries = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Network.requestWillBeSent") urls.set(m.params.requestId, m.params.request.url);
    else if (m.method === "Network.loadingFailed") {
      const u = urls.get(m.params.requestId) || "?";
      failed.push(m.params.errorText + " " + (m.params.type || "") + " " + u.split("/").slice(-2).join("/").split("?")[0]);
    } else if (m.method === "Log.entryAdded") {
      const en = m.params.entry;
      if (en.level === "error" || en.level === "warning") {
        consoleEntries.push(en.source + " " + String(en.text).slice(0, 160));
      }
    }
  });

  /* Wait on the page's own facts, not the clock: the rating is useless if feedback.js
     never reached the form, and the strings are useless if the dictionary never landed.
     A script that failed to load is not the product's failure — it is this server or
     this network — so the page is reloaded rather than measured half-loaded. English
     cannot be caught by its text alone (the markup already IS English), so every .js
     on the page has to answer 200 before the reading counts. */
  async function boot() {
    let facts = null;
    let translated = false;
    let loads = [];
    for (let i = 0; i < 40; i++) {
      facts = JSON.parse(await ev(`(function () {
        var f = document.getElementById("feedback-form");
        var v = document.querySelectorAll(".feedback__vote");
        return JSON.stringify({ form: !!f, votes: v.length,
          head: v.length ? v[0].textContent.trim() : "-",
          label: !!document.querySelector(".footer__legal a[href$='help.html']"),
          lang: document.documentElement.lang,
          nav: !!document.documentElement.style.getPropertyValue("--nav-h"),
          pressed: v.length ? String(v[0].getAttribute("aria-pressed")) : "none" });
      })()`));
      loads = JSON.parse(await ev(`(function () {
        return JSON.stringify(performance.getEntriesByType("resource")
          .filter(function (r) { return /\\.js(\\?|$)/.test(r.name); })
          .map(function (r) { return { f: r.name.split("/").pop(), s: r.responseStatus }; }));
      })()`));
      const dead = loads.filter((r) => r.s !== 200).map((r) => r.f + " http " + r.s);
      translated = LANG === "en" ? facts.head === "Yes" && dead.length === 0 : facts.head !== "Yes" && dead.length === 0;
      /* aria-pressed is only ever written by js/feedback.js. Requiring it here is the
         difference between "the markup is there" and "the rating actually works". */
      if (facts.form && facts.votes === 2 && translated && facts.nav && facts.pressed === "false")
        return { facts, loads, dead: [] };
      if (dead.length) await sleep(250);
      await sleep(500);
    }
    return { facts, loads, dead: loads.filter((r) => r.s !== 200).map((r) => r.f + " http " + r.s) };
  }

  let attempt = null;
  const url = `${ORIGIN}/help.html${ARM === "local" ? "?rig=1" : ""}`;
  for (let n = 1; n <= 3; n++) {
    const nav = once("Page.loadEventFired", 120000);
    await send("Page.navigate", { url });
    await nav;
    attempt = await boot();
    attempt.tries = n;
    if (attempt.dead.length === 0) break;
  }
  const { facts, loads } = attempt;
  const bootDead = attempt.dead;
  if (!facts.form || facts.votes !== 2) throw new Error("the rating never appeared: " + JSON.stringify(facts));
  if (facts.pressed !== "false") {
    /* "It never armed" is worthless without the three things that explain it: whether
       the driver was fetched at all, whether it threw, and whether the seed ran. */
    const why = JSON.parse(await ev(`(function () {
      var rs = performance.getEntriesByType("resource").filter(function (r) {
        return /feedback\\.js/.test(r.name);
      }).map(function (r) { return r.name.split("/").pop() + " http " + r.responseStatus + " " + r.transferSize + "b"; });
      return JSON.stringify({ seed: typeof window.__hf, errs: (window.__hf || {}).errs || [],
        res: (window.__hf || {}).res || [], fb: rs, tries: ${attempt.tries}, dead: ${JSON.stringify(bootDead)} });
    })()`));
    throw new Error("js/feedback.js never armed the form: " + JSON.stringify(facts) + " | " + JSON.stringify(why));
  }

  const measure = JSON.parse(await ev(MEASURE));
  const shots = {};
  async function shoot(tag) {
    if (!SHOTDIR) return;
    /* getBoundingClientRect is viewport-relative; the clip Page.captureScreenshot takes
       is in DOCUMENT coordinates. Without adding the scroll every shot was a blank strip
       of the page top — and a blank crop is byte-identical to another blank crop, so the
       pictures agreed with each other while proving nothing. The md5 and the ink count
       are kept so a flat capture fails the run instead of passing it. */
    const clip = JSON.parse(await ev(`(function () {
      var el = document.getElementById("feedback");
      el.scrollIntoView({ block: "start" });
      var b = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.max(0, Math.round(b.x + window.scrollX)),
        y: Math.max(0, Math.round(b.y + window.scrollY)),
        width: Math.round(b.width), height: Math.round(b.height),
        ink: el.querySelectorAll("p,button,label,textarea,input,h2,h3").length,
        words: (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 48) });
    })()`));
    /* The site's own reveal layer (js/scroll.js:15) marks .section__head and .card with
       data-rv, parks them at opacity 0, and fades them in only once IntersectionObserver
       has seen them. A rig that scrolls and captures in the same breath photographs the
       heading mid-fade: every DOM gate stays green, innerText still holds the words, and
       the picture is a blank strip of cream. Wait for the fade to land, and say so in the
       record — a shot that never settled is a failed run, not a quiet picture. */
    let reveal = "no [data-rv] here";
    for (let i = 0; i < 25; i++) {
      reveal = await ev(`(function () {
        var dim = [].slice.call(document.querySelectorAll("#feedback [data-rv]"))
          .filter(function (e) { return getComputedStyle(e).opacity !== "1"; });
        if (!dim.length) return "settled";
        return dim.length + " dim: " + dim.map(function (e) {
          return ((e.getAttribute("class") || "").split(" ")[0]) + " op" + getComputedStyle(e).opacity;
        }).join(",");
      })()`);
      if (reveal === "settled") break;
      await sleep(120);
    }
    const s = await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 } });
    const buf = Buffer.from(s.data, "base64");
    writeFileSync(join(SHOTDIR, `${ARM}-${LANG}-${VW}x${VH}-${tag}.png`), buf);
    shots[tag] = { ...clip, md5: createHash("md5").update(buf).digest("hex").slice(0, 12),
                   bytes: buf.length, reveal };
  }

  /* js/feedback.js files one submission per page read on purpose — busy never resets
     after a success — so the two paths cannot share one document. Asking for "both"
     means a fresh read between them, not a rig that measures a latched form. */
  let load = 1;
  const perLoad = [];
  async function harvest() {
    return { load,
             muted: JSON.parse(await ev(`JSON.stringify(window.__hf.muted)`)),
             res: JSON.parse(await ev(`JSON.stringify(window.__hf.res)`)),
             errs: JSON.parse(await ev(`JSON.stringify(window.__hf.errs)`)),
             cls: Number(await ev(`String(Math.round(window.__hf.cls * 10000) / 10000)`)) };
  }

  let before = JSON.parse(await ev(`(function () { var c = window.__hf.calls;
    document.getElementById("feedback-message").scrollIntoView({ block: "center" });
    return JSON.stringify({ calls: c.length, restHidden: document.getElementById("feedback-rest").hidden }); })()`));
  await shoot("l1-idle");
  const results = { arm: ARM, url, lang: LANG, vw: VW, vh: VH, facts, measure, shots, flows: {} };

  /* A geometry read only means something with the page standing still: the site sets
     scroll-behavior:smooth, so a read taken right after scrollTo reports the OLD position. */
  async function atRest() {
    let last = -1, stable = 0, y = -1;
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      y = Number(await ev(`String(Math.round(window.scrollY))`));
      if (y === last) { if (++stable >= 3) break; } else { stable = 0; last = y; }
    }
    return y;
  }

  /* Read the way a thumb reaches it: the pill already on screen, the page at rest, then a
     bare tap. The CLICK below pairs scrollIntoView with an immediate click, so its rect is
     sampled mid-animation — that measures the harness, not the visitor. */
  async function sendClear() {
    await ev(`(function () { var b = document.querySelector('.feedback__vote[data-vote="no"]');
      if (!b) return "no pill";
      window.scrollTo({ top: window.scrollY + (b.getBoundingClientRect().top - window.innerHeight * 0.4) });
      return "scrolled"; })()`);
    const pillY = await atRest();
    await ev(`(function () { document.querySelector('.feedback__vote[data-vote="no"]').click(); return "tapped"; })()`);
    const y = await atRest();
    return Object.assign({ pillY, y }, JSON.parse(await ev(SENDCLEAR)));
  }

  /* The local arm's stub answers in 30 ms; the live arm's answer is a round-trip. A fixed
     sleep read the panel while the reply was still in the air and a note the studio had
     already filed looked like it never closed, so wait on the door and then breathe. */
  async function answered(ms) {
    if (!LIVE) { await sleep(ms); return; }
    for (let i = 0; i < 60; i++) {
      const done = Number(await ev(`(function () { var c = window.__hf.calls, l = c[c.length - 1];
        return l && l.status !== undefined ? 1 : 0; })()`));
      if (done === 1) break;
      await sleep(150);
    }
    await sleep(250);
  }

  /* "No" is the branch that must ask rather than post. */
  async function runNo() {
    await ev(`${CLICK}("no")`);
    await sleep(400);
    const afterNo = JSON.parse(await ev(STATE));
    /* The note is the state a visitor actually reads and types into, and until it was
       photographed the only pictures of this branch were the closed form and the
       thank-you. Shoot it open, before anything is submitted. */
    await shoot(`l${load}-note-open`);
    const send = await sendClear();
    await ev(`${NOTE}("The pricing is not here.","+233 53 558 3460", true)`);
    await answered(600);
    const afterNote = JSON.parse(await ev(STATE));
    const body = JSON.parse(await ev(`JSON.stringify(window.__hf.calls)`));
    const lastCall = body[body.length - 1] || {};
    results.flows.no = { afterNo, afterNote, body, send, door: lastCall.door, status: lastCall.status, answer: lastCall.answer };
    await shoot(`l${load}-after-no-note`);
  }

  /* "Yes" is the branch that must post immediately and leave a record on screen. */
  async function runYes() {
    const n = await ev(`window.__hf.calls.length`);
    await ev(`${CLICK}("yes")`);
    await answered(700);
    const state = JSON.parse(await ev(STATE));
    const calls = await ev(`JSON.stringify(window.__hf.calls.slice(${n}))`);
    const contrast = JSON.parse(await ev(CONTRAST));
    results.flows.yes = { state, calls: JSON.parse(calls), contrast };
    await shoot(`l${load}-after-yes`);
  }

  async function reboot() {
    perLoad.push(await harvest());
    const nav2 = once("Page.loadEventFired", 120000);
    await send("Page.navigate", { url });
    await nav2;
    const again = await boot();
    if (again.dead.length) throw new Error("a script never loaded on the second read: " + JSON.stringify(again.dead));
    load += 1;
    Object.assign(results, { facts2: again.facts });
    before = JSON.parse(await ev(`(function () { var c = window.__hf.calls;
      document.getElementById("feedback-message").scrollIntoView({ block: "center" });
      return JSON.stringify({ calls: c.length, restHidden: document.getElementById("feedback-rest").hidden }); })()`));
    await shoot(`l${load}-idle`);
  }

  if (FLOW === "no" || FLOW === "both") await runNo();
  if (FLOW === "both") await reboot();
  if (FLOW === "yes" || FLOW === "both") await runYes();

  const last = await harvest();
  perLoad.push(last);
  results.net = { failed, muted: perLoad.reduce((a, p) => a.concat(p.muted), []),
                  res: perLoad.reduce((a, p) => a.concat(p.res), []) };
  results.console = consoleEntries.slice(0, 14);
  results.cdp = { calls: timings.length, slow: timings.filter((t) => t.ms > 1500),
                  last: timings.slice(-1)[0] };
  results.clsFinal = last.cls;
  results.errsFinal = perLoad.reduce((a, p) => a.concat(p.errs), []);

  writeFileSync(OUT, JSON.stringify(results, null, 2));

  /* The table. A gate that prints nothing is a gate that was not run. */
  const m = results.measure;
  const rows = [];
  rows.push(["paint", `${m.overflow.doc}/${m.overflow.client} ${m.overflow.doc <= m.overflow.client + 1 ? "no h-scroll" : "H-SCROLL"}`]);
  rows.push(["grid", `${m.grid.display} ${m.grid.cols} gap ${m.grid.gap}`]);
  rows.push(["main/rail", `${m.mainW}px main, rail at y ${m.railY}`]);
  m.votes.forEach((v) => rows.push([`vote ${v.label}`, `${v.box.w}x${v.box.h} minH ${v.minHeight} bgA ${v.bgAlpha} AA ${v.ratio}`]));
  rows.push(["one row", String(m.sameRow)]);
  rows.push(["intro AA", `${m.intro && m.intro.ratio}`]);
  rows.push(["rest", `hidden ${m.restHidden}, honeypot ${JSON.stringify(m.hp)}`]);
  rows.push(["links", `${m.railLinks.length} ` + m.railLinks.map((l) => l.text).join(" / ").slice(0, 90)]);
  rows.push(["footer Help", JSON.stringify(m.footerHelp)]);
  rows.push(["lang/dir", `${m.lang}/${m.dir} heading "${m.votes[0].label}"`]);
  rows.push(["CLS boot", `${m.cls}`]);
  rows.push(["armed", `aria-pressed ${m.armed} ` + JSON.stringify(m.scripts)]);
  rows.push(["boot", `${attempt.tries} page load${attempt.tries === 1 ? "" : "s"}, dead scripts ${JSON.stringify(bootDead)}`]);
  const y = results.flows.yes;
  if (y) {
    const c0 = y.calls[0];
    rows.push(["yes call", (c0 ? `${c0.method} ${c0.url.split("/v1/")[1]} ct=${c0.ctype} cred=${c0.credentials} body=${JSON.stringify(c0.body)}` : "NO CALL") +
      ` (${y.calls.length} call${y.calls.length === 1 ? "" : "s"})`]);
    rows.push(["yes door", `${c0 ? c0.door : "-"}${c0 && c0.door === "live" ? ` status ${c0.status} ok ${c0.ok} answer ${JSON.stringify(c0.answer)}` : ""}`]);
    rows.push(["yes states", `${y.state.pressed.join(" ")} rest ${y.state.restHidden} done ${y.state.doneHidden} "${y.state.doneText.slice(0, 40)}"`]);
    rows.push(["yes contrast", y.contrast.votes.map((v) => `${v.vote}:${v.pressed}${v.disabled ? "/off" : "/on"} AA ${v.ratio} op ${v.opacity}`).join("  ") + `  done AA ${y.contrast.done}`]);
  }
  const n = results.flows.no;
  if (n) {
    rows.push(["no asks", `rest open ${n.afterNo.restHidden === false}, calls after tap ${n.afterNo.calls} (was ${before.calls}), focus ${n.afterNo.focused}, pills ${JSON.stringify(n.afterNo.pressed)}`]);
    rows.push(["note call", JSON.stringify(n.body && n.body[n.body.length - 1] && n.body[n.body.length - 1].body)]);
    rows.push(["note done", `"${n.afterNote.doneText.slice(0, 40)}" rest ${n.afterNote.restHidden}` +
      ` door ${n.door}${LIVE ? ` status ${n.status} answer ${JSON.stringify(n.answer)}` : ""}`]);
    if (n.send) rows.push(["send clear", `y ${n.send.y} send ${n.send.sendTop}..${n.send.sendBottom} of ${VH} ask ${n.send.askTop} "${n.send.askText}" gap ${n.send.gap} tappable ${n.send.pressable} (${n.send.hits}) queue ${n.send.queueH}`]);
  }
  rows.push(["net", `${results.net.failed.length} failed ${JSON.stringify(results.net.failed.slice(0, 6))}`]);
  rows.push(["bad loads", `${results.net.res.length} ${JSON.stringify(results.net.res.slice(0, 6))}`]);
  rows.push(["console", `${results.console.length} ${JSON.stringify(results.console.slice(0, 4))}`]);
  rows.push(["cdp", `${results.cdp.calls} calls, slow ${JSON.stringify(results.cdp.slow)}, last ${JSON.stringify(results.cdp.last)}`]);
  rows.push(["muted", `${results.net.muted.length} ${JSON.stringify(results.net.muted.slice(0, 4))}`]);
  rows.push(["page errors", `${results.errsFinal.length} ${JSON.stringify(results.errsFinal.slice(0, 3))}`]);
  if (SHOTDIR) {
    rows.push(["shots", Object.entries(shots).map(([t, s]) =>
      `${t} ${s.width}x${s.height} y${s.y} ${s.bytes}b ${s.md5} ink ${s.ink} rv:${s.reveal} "${s.words}"`).join("  |  ")]);
  }
  console.log(`\n### ${ARM} ${LANG} ${VW}x${VH}  ${url}`);
  rows.forEach((r) => console.log("  " + r[0].padEnd(13) + (r[1] === undefined ? "" : r[1])));
  console.log("  written " + OUT + (SHOTDIR ? " + shots " + SHOTDIR : ""));

  const fails = [];
  if (m.overflow.doc > m.overflow.client + 1) fails.push("horizontal scroll");
  if (m.votes.length !== 2) fails.push("vote pills missing");
  if (m.votes.some((v) => v.box.h < 44 || v.minHeight < 44)) fails.push("a vote is under 44px tall");
  if (m.votes.some((v) => v.bgAlpha <= 0)) fails.push("a vote has no background — the rule did not apply");
  if (m.votes.some((v) => v.ratio < 4.5)) fails.push("a vote label fails AA");
  if (m.intro && m.intro.ratio < 4.5) fails.push("the intro fails AA");
  if (m.restHidden !== true) fails.push("the note opened on its own");
  if (!m.hp || m.hp.ariaHidden !== "true" || m.hp.tabIndex !== -1) fails.push("the honeypot is exposed");
  if (!m.footerHelp) fails.push("no Help row in this page's footer");
  if (m.railLinks.some((l) => /help\.html/.test(l.href))) fails.push("the rail links back at itself");
  /* Measure each pill against the dictionary itself, not against the English word.
     The gate that was here asked only whether the FIRST pill had moved off "Yes", so the
     untranslated "No" — a key no dictionary carried — painted Latin letters onto an Arabic
     page for a whole review cycle while the rig stayed green. A value that legitimately
     equals the English source (Italian and Spanish both say "No") still passes: this
     checks that the page shows what the studio's own translation says, nothing more. */
  if (LANG !== "en") {
    const dict = JSON.parse(readFileSync(join(ROOT, "i18n", `${LANG}.json`), "utf8"));
    [["Yes", "Yes, this answered my question"], ["No", "No, this did not answer my question"]]
      .forEach(([word, label], i) => {
        const v = m.votes[i];
        if (!v) return;
        if (!(word in dict)) fails.push(`${LANG}.json carries no "${word}" key for the ${word} pill`);
        else if (v.label !== dict[word]) fails.push(`the ${word} pill reads "${v.label}" while ${LANG}.json says "${dict[word]}"`);
        if (!(label in dict)) fails.push(`${LANG}.json carries no key for the ${word} pill's aria-label`);
        else if (v.aria !== dict[label]) fails.push(`the ${word} pill's aria-label reads "${String(v.aria).slice(0, 40)}", not the dictionary's`);
      });
  }
  if (LANG === "ar" && m.dir !== "rtl") fails.push("Arabic did not flip the page");
  if (y) {
    const c = y.calls[0];
    if (!c || !/capture\/feedback$/.test(c.url)) fails.push("the yes tap did not aim at capture/feedback");
    if (!c || c.method !== "POST" || !/^application\/json/.test(c.ctype)) fails.push("the yes tap is not a JSON POST");
    if (!c || c.credentials !== "omit") fails.push("the yes tap sends credentials");
    if (!c || c.body.vote !== "yes" || c.body.topic !== "answer" || c.body.article !== "questions") fails.push("the yes body is wrong");
    if (!c || c.body.page !== "/help.html" || c.body.lang !== m.lang) fails.push("the yes body names the wrong page or language");
    if (!c || c.body.message !== "" || c.body.contact !== "") fails.push("a tap alone sent words or a number");
    /* In the live arm the thank-you is only worth something if the studio's own function
       said so: the page's CSP has to admit the functions origin and the Origin has to be
       the site. A 200 the rig handed itself proves neither. */
    if (LIVE && c) {
      if (c.door !== "live") fails.push("the live arm stubbed the tap it was meant to send");
      if (c.status !== 200 || c.ok !== true) fails.push(`the deployed function answered ${c.status} ${JSON.stringify(c.answer)}`);
      else if (!/"ok":true/.test(String(c.answer))) fails.push("the function answered without ok: " + JSON.stringify(c.answer));
    }
    if (y.state.doneHidden !== false) fails.push("the thank-you never appeared");
    if (y.contrast.votes.some((v) => v.pressed === "true" && v.ratio < 4.5)) fails.push("the pressed pill fails AA");
    if (y.contrast.doneVisible && y.contrast.done < 4.5) fails.push("the thank-you fails AA");
    /* The record of the tap has to survive it: the answer stays lit and readable,
       the pill that was not tapped goes inert so a second tap cannot double-file. */
    const pm = Object.fromEntries(y.state.pressed.map((s) => s.split("=")));
    const shown = y.state.pressed.join(" ");
    if (pm.yes !== "true/on") fails.push("the tap that was made is not the tap still shown: " + shown);
    if (pm.no !== "false/off") fails.push("the pill that was not tapped stayed live: " + shown);
  }
  if (n) {
    if (n.afterNo.calls !== before.calls) fails.push("the no tap posted before it was asked");
    if (n.afterNo.restHidden !== false) fails.push("the no tap did not open the note");
    /* The tap has to leave a mark the visitor can still read after focus has moved into
       the note. While js/feedback.js wrote aria-pressed only once the post came back, the
       open form was the whole answer, and scrolling back up showed two identical pills for
       a question that had already been answered. */
    if (!n.afterNo.pressed || !n.afterNo.pressed.some((p) => p.indexOf("no=true") === 0)) {
      fails.push("the no tap left no mark on its own pill: " + JSON.stringify(n.afterNo.pressed));
    }
    /* Opening the note is only useful if the visitor can send it. Focusing the textarea
       scrolls the TEXTAREA into view and never the button below it, so before js/feedback.js
       read --queue-h a 390x844 frame left the Send at y 773..811 while the install ask held
       740..832, and elementFromPoint at its own centre returned the ask's paragraph. */
    const sc = n.send;
    if (sc) {
      if (sc.error) fails.push("the open note had no Send to measure: " + sc.error);
      else {
        if (sc.sendTop < 0 || sc.sendBottom > VH) {
          fails.push(`the note left its Send off the screen (y ${sc.sendTop}..${sc.sendBottom} in a ${VH}px frame)`);
        } else if (!sc.pressable) {
          fails.push(`the note opened with its Send under ${sc.hits} (y ${sc.sendTop}..${sc.sendBottom}, ask top ${sc.askTop} "${sc.askText}")`);
        } else if (sc.gap !== null && sc.gap < 8) {
          fails.push(`the Send sits ${sc.gap}px from the bottom ask (y ${sc.sendBottom} against ${sc.askTop})`);
        }
      }
    }
    const last = n.body[n.body.length - 1];
    if (!last || last.body.message !== "The pricing is not here.") fails.push("the note did not ride");
    if (!last || last.body.contact !== "+233 53 558 3460") fails.push("the number did not ride");
    if (!last || last.body._site !== "") fails.push("the honeypot was sent filled");
    /* Sending the note has to close the form it was sent from, and in the live arm it has to
       close it because the studio's function answered, not because the rig said so. */
    if (n.afterNote.restHidden !== true) fails.push("the sent note left its form open");
    if (LIVE && (!last || last.status !== 200 || last.ok !== true)) {
      fails.push("the deployed function answered the note " + (last ? `${last.status} ${JSON.stringify(last.answer)}` : "nothing"));
    }
  }
  if (results.errsFinal.length) { fails.push("page errors"); console.log("  " + JSON.stringify(results.errsFinal)); }
  /* A driver that never arrived is not a note to read later — half the page's
     behaviour would be silently missing while every other gate still passes. */
  const deadLoads = results.net.res.filter((f) => /\.(js|css)(\?|$)/.test(f));
  if (deadLoads.length) fails.push("a script or sheet never loaded: " + JSON.stringify(deadLoads));
  if (bootDead.length) fails.push(`still dead scripts after ${attempt.tries} page loads: ` + JSON.stringify(bootDead));
  if (results.console.some((c) => /error|failed to load|refused|blocked/i.test(c))) fails.push("console errors: " + JSON.stringify(results.console.filter((c) => /error|failed to load|refused|blocked/i.test(c)).slice(0, 4)));
  /* A file that exists is not a picture of something. Every state shot has to differ from
     its own load's idle shot, and the idle crop has to carry words — a blank cream strip is
     byte-identical to another blank cream strip and would have sworn the widget was on screen. */
  if (SHOTDIR) {
    Object.entries(shots).forEach(([tag, s]) => {
      if (s.ink < 3 || !s.words) fails.push(`${tag} cropped no words — the widget never painted`);
      /* Words in the DOM and no words on screen is exactly what the reveal layer produces
         when the capture beats the fade. A shot taken while the band is still transparent
         proves nothing about what a visitor sees, so it fails the run instead of passing it. */
      if (s.reveal && !/^(settled|no \[data-rv\] here)$/.test(s.reveal)) {
        fails.push(`${tag} was shot while the reveal layer had it closed: ${s.reveal}`);
      }
      if (tag.endsWith("-idle")) return;
      const idleTag = "l" + (/^l(\d+)/.exec(tag) || [, "1"])[1] + "-idle";
      const idle = shots[idleTag];
      if (!idle) fails.push(`${tag} has no idle shot to compare against`);
      else if (s.md5 === idle.md5) fails.push(`${tag} is byte-identical to ${idleTag}`);
    });
  }
  console.log("\n" + (fails.length ? "GATE FAILED:\n  - " + fails.join("\n  - ") : "all gates clean"));

  ws.close();
  await dispose();
  process.exit(fails.length ? 1 : 0);
}

main().catch(async (e) => { console.error("rig died: " + e.stack); await dispose(); process.exit(2); });
