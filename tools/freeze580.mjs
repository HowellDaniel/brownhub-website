/* Phone rig for issue #580: stand inside a paged phone band, let the studio's own quote
   card grow the bottom queue, and read what Chrome bills for the correction.

   node tools/freeze580.mjs --arm=live|patch [--hold=30000] [--out=/tmp/bh580/live.json]

   A fresh profile every run, so no service worker controls the page and every request is
   the page's own — which is what lets the `patch` arm answer for js/pinband.js.
*/
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const ARM = ARG.arm || "live";
const HOLD = Number(ARG.hold || 30000);
const ROOT = "/Users/brownhub/Documents/Qoder/2026-09-16/5bb3bd1c";
const ORIGIN = ARG.origin || "https://www.brownhub283.com";
const BAND = ARG.band || "#customer-experience";
const VW = Number(ARG.vw || 390);
const VH = Number(ARG.vh || 844);
const MOBILE = ARG.desktop ? false : true;
const PORT = Number(ARG.port || 9411);
const OUT = ARG.out || `/tmp/bh580/${ARM}.json`;
const SHOTDIR = ARG.shot || null;
const shots = [];
mkdirSync(dirname(OUT), { recursive: true });
if (SHOTDIR) mkdirSync(SHOTDIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bh580-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
  "--window-size=390,900", "about:blank",
], { stdio: "ignore" });

let ws, nextId = 0;
const pending = new Map();
const waits = [];
const subs = [];
function fire(method, m) {
  for (const s of subs) if (s.method === method) s.fn(m);
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
function send(method, params) {
  return new Promise((resolve, reject) => {
    pending.set(++nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params: params || {} }));
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
  if (r.exceptionDetails) throw new Error("page threw " + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
}

/* Experiment flag (--lock=root|band): hold the stage's own queue charge on the band while
   the reader stands inside it. The stage's height is not written by the driver at all — CSS
   computes it, `--stage-h:max(52svh, calc(100svh - var(--nav-h) - var(--queue-h)))` — so a
   JS freeze has nothing to hold. A value declared on the band beats the one inherited from
   :root without a specificity contest, so this is the smallest thing that could work.

   `root` holds one number for the whole page while any paged band is in sight and releases
   it otherwise. `band` is the shipped rule: every stage band is asked ONCE, the first time
   it is in sight, and is never asked again — a band that has already been read keeps the
   height it was read with, because letting it go is what the l6 run billed at 0.75.

   Written as inline custom properties rather than a <style> element because the site's CSP
   is `style-src 'self'` with no 'unsafe-inline' for style elements — an injected sheet is
   blocked — while `style-src-attr 'unsafe-inline'` lets the driver write the band's own
   style. Production will put these expressions in css/style.css and let the driver name
   only the number; the substitution is the same either way. */
const TOKENS = `
  var TOKENS = {
    '--stage-queue': 'var(--queue-lock)',
    '--stage-h': 'max(52svh, calc(100svh - var(--nav-h) - var(--stage-queue)))',
    '--stage-seen': 'max(0px, calc(100svh - var(--nav-h) - var(--stage-queue)))',
    '--stage-dug': 'calc(var(--stage-h) - var(--stage-seen))',
    '--stage-pay': 'min(var(--stage-dug), max(0px, calc(var(--stage-h) - 268px)))'
  };`;
const LOCK = ARG.lock === "band" ? `
(function () {
${TOKENS}
  /* The stage layer, whichever driver owns it: a [data-pin] band through pinband.js,
     the process story through pstory.js. Both read the same root tokens. */
  function stageBands() {
    return [].slice.call(document.querySelectorAll('[data-pin], #process'));
  }
  var room = innerWidth + "x" + innerHeight;
  setInterval(function () {
    var live = String(Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--queue-h')) || 0));
    if (room !== innerWidth + "x" + innerHeight) {
      /* A real room change is not a notice: the whole page is re-laid out anyway, so
         every band is asked again and the locks are taken back. */
      room = innerWidth + "x" + innerHeight;
      stageBands().forEach(function (b) {
        Object.keys(TOKENS).forEach(function (k) { b.style.removeProperty(k); });
        b.style.removeProperty('--queue-lock');
        b.__bhLocked = 0;
      });
    }
    stageBands().forEach(function (b) {
      if (b.__bhLocked) return;
      var r = b.getBoundingClientRect();
      if (!(r.top < innerHeight && r.bottom > 0)) return;
      b.__bhLocked = live;
      b.style.setProperty('--queue-lock', live + 'px');
      Object.keys(TOKENS).forEach(function (k) { b.style.setProperty(k, TOKENS[k]); });
    });
  }, 40);
})()` : ARG.lock ? `
(function () {
${TOKENS}
  var held = 0;
  var on = false;
  setInterval(function () {
    var live = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--queue-h')) || 0;
    /* The release rule the shipped fix will use: the stage layer holds its shape
       while ANY paged band is in sight, because the bands above the reader are what
       shoves the band he is standing in. In a gap between bands, drop the lock. */
    var bands = [].slice.call(document.querySelectorAll('[data-pin]'));
    var standing = bands.some(function (b) {
      if (!b.classList.contains('pinband--paged')) return false;
      var r = b.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0;
    });
    if (!held || live <= held) held = live;
    if (standing && live > held) {
      if (!on) {
        on = true;
        document.documentElement.style.setProperty('--queue-lock', held + 'px');
        for (var k in TOKENS) document.documentElement.style.setProperty(k, TOKENS[k]);
      }
    } else if (on) {
      on = false;
      for (var k in TOKENS) document.documentElement.style.removeProperty(k);
      document.documentElement.style.removeProperty('--queue-lock');
    }
  }, 100);
})()` : "";

const INSTRUMENT = `
window.__bh = { shifts: [], queue: [], morphs: [], seen: [], watchers: [], ignore: false, err: [] };
addEventListener("error", function (e) {
  window.__bh.err.push(String(e.message) + " @" + (e.filename || "").split("/").pop() + ":" + (e.lineno || 0));
}, true);
window.__bh.ro = new ResizeObserver(function () {});
new PerformanceObserver(function (l) {
  for (var e of l.getEntries()) {
    if (e.hadRecentInput) continue;
    window.__bh.shifts.push({
      v: Number(e.value.toFixed(4)), t: Math.round(performance.now()),
      src: (e.sources || []).slice(0, 5).map(function (s) {
        return {
          move: Math.round(Math.abs(s.previousRect.top - s.currentRect.top) + Math.abs(s.previousRect.left - s.currentRect.left)),
          w: Math.round(s.previousRect.width), h: Math.round(s.previousRect.height),
          top: Math.round(s.previousRect.top),
          node: String((s.node && (s.node.id || s.node.className || s.node.tagName)) || "?")
        };
      })
    });
  }
}).observe({ type: "layout-shift", buffered: true });
addEventListener("queue-change", function () {
  window.__bh.queue.push({ t: Math.round(performance.now()), q: getComputedStyle(document.documentElement).getPropertyValue('--queue-h') });
});
/* The shift lasts one frame, and a sample every second only ever reads its
   aftermath. Record the morph where it happens: which stage boxes were resized,
   and where the browser put the reader while it did. */
function label(n) {
  var sec = n.closest ? (n.closest('section[id]') || {}) : {};
  return (sec.id || '?') + '.' + (n.className || n.tagName).toString().split(' ')[0];
}
function snap(n) {
  var r = n.getBoundingClientRect();
  return [Math.round(r.width), Math.round(r.height), Math.round(r.top + scrollY)];
}
function watch(n, tag) {
  if (!n || window.__bh.seen.indexOf(n) >= 0) return;
  window.__bh.seen.push(n);
  var last = snap(n);
  var rec = function () {
    var now = snap(n);
    /* Size only: a rect that merely travelled with the scroll is not a re-fit. */
    if (now[0] === last[0] && now[1] === last[1]) { last = now; return; }
    window.__bh.morphs.push({ t: Math.round(performance.now()), k: tag, n: label(n),
      from: last, to: now, y: Math.round(scrollY) });
    last = now;
  };
  window.__bh.watchers.push({ el: n, fn: rec });
  return true;
}
window.__bh.timer = setInterval(function () {
  [].slice.call(document.querySelectorAll('section[id]')).forEach(function (s) {
    watch(s, 'sec');
    ['.pinband__pin', '.pinband__run', '.pinband__window', '.pinband__body'].forEach(function (sel) {
      var e = s.querySelector(sel); if (e) watch(e, 'box');
    });
  });
  window.__bh.watchers.forEach(function (w) { w.fn(); });
}, 60);
window.__bh.ro = new ResizeObserver(function () {});
addEventListener('scroll', function () {
  window.__bh.lastY = Math.round(scrollY);
  if (performance.now() < (window.__bh.ignoreUntil || 0)) return;
  window.__bh.morphs.push({ t: Math.round(performance.now()), k: 'anchor', y: Math.round(scrollY) });
}, true);
/* Our own scrollTo is not evidence; a scroll the browser chose is. */
window.__bh.go = function (y) {
  window.__bh.ignoreUntil = performance.now() + 500;
  scrollTo({ top: y, behavior: 'auto' });
  window.__bh.lastY = Math.round(scrollY);
};`;

const READ = `
(function () {
  var r = getComputedStyle(document.documentElement);
  var band = document.querySelector('${BAND}');
  var block = band.querySelector(band.dataset.pin) || band.querySelector('.pstory__run');
  var strip = band.dataset.pinCards ? block.querySelector(band.dataset.pinCards) : block;
  var pin = band.querySelector('.pinband__pin') || band.querySelector('.pstory__pin') || block;
  var body = band.querySelector('.pinband__body') || band.querySelector('.pstory__body') || pin;
  var win = band.querySelector('.pinband__window') || pin;
  var run = band.querySelector('.pinband__run') || body;
  var q = Math.round(parseFloat(r.getPropertyValue('--queue-h')) || 0);
  var bs = getComputedStyle(band);
  var lead = document.querySelector('.leadask');
  var cls = 0; (window.__bh.shifts || []).forEach(function (s) { cls += s.v || 0; });
  var wr = win.getBoundingClientRect(), br = band.getBoundingClientRect();
  return {
    t: Math.round(performance.now()), y: Math.round(scrollY), cls: Number(cls.toFixed(4)),
    q: q, rail: Math.round(parseFloat(r.getPropertyValue('--rail-h')) || 0),
    inSight: br.top < innerHeight && br.bottom > 0, below: br.top >= innerHeight,
    bandTop: Math.round(br.top), run: run.offsetHeight, pin: pin.offsetHeight,
    body: body.offsetHeight, win: win.offsetHeight, winBottom: Math.round(wr.bottom),
    room: Math.round(innerHeight - q), covered: Math.round(wr.bottom - (innerHeight - q)),
    media: (strip && strip.style.getPropertyValue('--pin-media-h')) || '-',
    /* A frozen stage is only a cure if what it holds is still somewhere a reader can see
       it. These are the pixels each standing notice lays over the stage box — and the raw
       rects underneath, because "clear" is only worth anything if the boxes say so. */
    notices: (function () {
      var st = pin.getBoundingClientRect(), out = [];
      ['.leadask', '.install', '.chat-widget__toggle', '.cookie-notice', '.promo'].forEach(function (sel) {
        [].slice.call(document.querySelectorAll(sel)).forEach(function (n) {
          var r = n.getBoundingClientRect();
          if (!(r.height > 0) || getComputedStyle(n).visibility === "hidden") return;
          var oy = Math.min(st.bottom, r.bottom) - Math.max(st.top, r.top);
          var ox = Math.min(st.right, r.right) - Math.max(st.left, r.left);
          out.push({ sel: sel.slice(1), top: Math.round(r.top), bottom: Math.round(r.bottom),
            h: Math.round(r.height), over: oy > 0 && ox > 0 ? Math.round(oy) : 0 });
        });
      });
      return { stage: [Math.round(st.top), Math.round(st.bottom)], list: out };
    })(),
    /* Reachability, not tidiness: the two things a reader acts on inside the stage — the
       page rail and the card's own buttons — measured against what is painted over them. */
    parts: (function () {
      var out = [];
      ['.pstory__rail', '.pstory__skip'].concat((function () {
        var c = band.querySelector('.pinband__window .card__actions, .pinband__window .card');
        return c ? [c.className.split(' ')[0]] : [];
      })()).forEach(function (sel) {
        var n = band.querySelector(sel); if (!n) return;
        var a = n.getBoundingClientRect(); if (!(a.height > 0)) return;
        var buried = 0, by = "";
        ['.leadask', '.install', '.chat-widget__toggle', '.promo', '.cookie-notice'].forEach(function (s2) {
          [].slice.call(document.querySelectorAll(s2)).forEach(function (m) {
            if (m.hidden || getComputedStyle(m).visibility === 'hidden') return;
            var r = m.getBoundingClientRect();
            var oy = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
            var ox = Math.min(a.right, r.right) - Math.max(a.left, r.left);
            if (oy > 0 && ox > 0 && oy > buried) { buried = Math.round(oy); by = s2.slice(1); }
          });
        });
        out.push({ sel: sel.split('.').pop(), top: Math.round(a.top), bottom: Math.round(a.bottom),
          h: Math.round(a.height), buried: buried, by: by });
      });
      return out;
    })(),
    /* The lock is asked per band, so it is read per band: the root number is the live
       queue and tells nothing; these three tell what this band was built with. */
    lock: bs.getPropertyValue('--queue-lock').trim() || '-',
    sq: bs.getPropertyValue('--stage-queue').trim() || '-',
    stageH: bs.getPropertyValue('--stage-h').trim() || '-',
    rootLock: r.getPropertyValue('--queue-lock').trim() || '-',
    pages: run.style.getPropertyValue('--pin-pages') || '-',
    pageH: run.style.getPropertyValue('--pin-page-h') || '-',
    /* The process story is a stage too, and it is the band whose fit is decided by
       owed(): these two say whether it is standing and which step it is on. */
    pstep: band.style.getPropertyValue('--pstep') || '-',
    jsPstory: document.documentElement.classList.contains('js-pstory'),
    paged: band.classList.contains('pinband--paged'),
    plain: !!(strip && strip.classList.contains('pinband--plain')),
    lead: !!lead, leadH: lead ? lead.offsetHeight : 0,
    /* The bands above the reader are what pushes him: every paged stage and its
       body padding is derived from the same root queue number — including the
       process story, which is not a [data-pin] band at all. */
    bands: [].slice.call(document.querySelectorAll('section[id]')).map(function (b) {
      var bb = b.querySelector('.pinband__body, .pstory__body');
      return {
        id: b.id, paged: b.classList.contains('pinband--paged') ? 1 : 0,
        lock: b.style.getPropertyValue('--queue-lock') || '-',
        top: Math.round(b.getBoundingClientRect().top + scrollY),
        h: b.offsetHeight,
        pad: bb ? Math.round(parseFloat(getComputedStyle(bb).paddingBottom)) : 0
      };
    })
  };
})()`;

(async () => {
  let list = [];
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { list = await r.json(); if (list.some((t) => t.type === "page")) break; } } catch (e) { /* still booting */ }
    await sleep(250);
  }
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = onMessage;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws failed")); });

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: Number(ARG.dpr || 3), mobile: MOBILE });
  await send("Network.emulateNetworkConditions", { offline: false, latency: Number(ARG.latency ?? 150), downloadThroughput: Number(ARG.net ?? 200 * 1024), uploadThroughput: Number(ARG.up ?? 64 * 1024) });
  await send("Emulation.setCPUThrottlingRate", { rate: Number(ARG.cpu ?? 4) });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
  if (LOCK) await send("Page.addScriptToEvaluateOnNewDocument", { source: LOCK });

  let patchedFrom = null, patchBytes = 0;
  const patched = {};
  if (ARM === "patch") {
    /* The shipped cure is two files: JS names the band's number, CSS spends it. Serving only
       the driver would measure a half-fix against a live sheet that still computes the stage
       from :root, so every file the stage is made of comes from the working tree. */
    const PATCHES = [
      ["*pinband.js", "js/pinband.js", "application/javascript; charset=utf-8"],
      ["*pstory.js", "js/pstory.js", "application/javascript; charset=utf-8"],
      ["*style.min.css", "css/style.min.css", "text/css; charset=utf-8"],
    ];
    subs.push({
      method: "Fetch.requestPaused", fn: (m) => {
        const url = m.params.request.url;
        const hit = PATCHES.find(([needle]) => url.includes(needle.slice(1)));
        if (!hit) return;
        const text = readFileSync(join(ROOT, hit[1]), "utf8");
        patched[hit[1]] = text.length;
        patchBytes = Object.values(patched).reduce((a, b) => a + b, 0);
        patchedFrom = url;
        send("Fetch.fulfillRequest", {
          requestId: m.params.requestId, responseCode: 200,
          responseHeaders: [{ name: "content-type", value: hit[2] },
            { name: "cache-control", value: "no-store" }],
          body: Buffer.from(text, "utf8").toString("base64")
        }).catch(() => { /* page moved on */ });
      }
    });
    await send("Fetch.enable", {
      patterns: PATCHES.map(([needle]) => ({ urlPattern: needle + "*", requestStage: "Request" }))
    });
  }

  const nav = once("Page.loadEventFired", 120000);
  await send("Page.navigate", { url: ORIGIN + "/" });
  await nav;
  await sleep(3500);
  const boot = await ev(`(function(){var c=0;(window.__bh.shifts||[]).forEach(function(s){c+=s.v||0});return {cls:Number(c.toFixed(4)),q:getComputedStyle(document.documentElement).getPropertyValue('--queue-h'),n:(window.__bh.shifts||[]).length}})()`);

  const accepted = await ev(`(function(){var b=[].slice.call(document.querySelectorAll('.cookie-notice button')).find(function(x){return /accept/i.test(x.textContent)});if(!b)return 'no notice';b.click();return b.textContent.trim()})()`);
  await sleep(1200);
  /* The arrival offer is a modal that covers the whole stage by design, so a frame taken
     under it proves nothing about the queue. A visitor closes it; the rig does the same. */
  const promo = ARG.promo ? "kept" : await ev(`(function(){var box=document.querySelector('.promo');if(!box||box.hidden)return 'none';var c=box.querySelector('.promo__close');if(!c)return 'no close';c.click();return 'closed'})()`);
  await sleep(900);

  const target = await ev(`(function(){var band=document.querySelector('${BAND}');var top=Math.round(band.getBoundingClientRect().top+scrollY);var y=Math.round(top+560);window.__bh.go(y);return {bandTop:top,y:y,doc:Math.round(document.documentElement.scrollHeight),part:Number((y/document.documentElement.scrollHeight).toFixed(3)),vh:innerHeight}})()`);
  await sleep(1200);
  const before = await ev(READ);
  const beforeShift = await ev("window.__bh.shifts.length");

  const samples = [];
  /* A freeze that hides the picture is not a cure, so the frame itself gets kept. */
  async function shot(tag) {
    if (!SHOTDIR) return;
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const file = `${SHOTDIR}/${ARM}-${tag}.png`;
    writeFileSync(file, Buffer.from(data, "base64"));
    shots.push(file);
  }
  const t0 = Date.now();
  let firstGrowth = null, nudged = false, shotTaken = false, frozenRead = null;
  while (Date.now() - t0 < HOLD) {
    /* The quote ask is earned by a scroll that says the visitor is reading (js/leads.js
       needs 45% of the page plus four seconds). Once we are standing in the band the page
       is deliberately still, so on the runs where the ask has not come by six seconds the
       rig takes two steps down and back — the reader's own motion, through the driver's
       own listener, not a fake event. */
    if (!firstGrowth && !nudged && Date.now() - t0 > 6000) {
      nudged = true;
      await ev(`window.__bh.go(${target.y + 40})`);
      await sleep(700);
      await ev(`window.__bh.go(${target.y})`);
      await sleep(700);
    }
    await sleep(500);
    const s = await ev(READ);
    samples.push(s);
    if (!firstGrowth && s.q > before.q) firstGrowth = s;
    if (firstGrowth && !shotTaken && s.t - firstGrowth.t > 3500) {
      shotTaken = true;
      frozenRead = s;
      await shot("frozen");
    }
    if (firstGrowth && s.t - firstGrowth.t > 12000) break;
  }
  const during = await ev(`JSON.stringify(window.__bh.shifts.slice(${beforeShift}))`);
  const after = await ev(READ);

  /* Repayment: leave the band behind, then come back above it and see whether the
     corrected numbers land where nobody is reading them. */
  await ev(`(function(){var band=document.querySelector('${BAND}');window.__bh.go(Math.round(band.getBoundingClientRect().top+scrollY+band.offsetHeight+500))})()`);
  await sleep(2500);
  const past = await ev(READ);
  await ev(`(function(){var band=document.querySelector('${BAND}');window.__bh.go(Math.round(band.getBoundingClientRect().top+scrollY-1400))})()`);
  await sleep(3000);
  const above = await ev(READ);
  await sleep(3000);
  const repaid = await ev(READ);
  const allShifts = await ev("JSON.stringify(window.__bh.shifts)");
  const queueLog = await ev("JSON.stringify(window.__bh.queue)");
  const morphs = await ev("JSON.stringify((window.__bh.morphs||[]).slice(0, 400))");
  /* Why did the ask arrive in one run and not another? These are the gates js/leads.js
     works through before it builds the card, plus every page error the rig saw. */
  const leadProbe = await ev(`(function(){return {
    card: !!document.querySelector('.leadask'),
    attr: document.documentElement.getAttribute('data-leadask'),
    store: localStorage.getItem('brownhub-leadask'),
    answered: localStorage.getItem('brownhub-leadanswered'),
    install: !!document.querySelector('.install'),
    teaser: !!document.querySelector('.chat-widget__teaser'),
    cookie: !!document.querySelector('.cookie-notice'),
    leadH: getComputedStyle(document.documentElement).getPropertyValue('--lead-h'),
    scroll: Math.round(scrollY) + "/" + (document.documentElement.scrollHeight - innerHeight),
    errs: (window.__bh.err || []).slice(0, 8)
  }})()`);

  const out = { ARM, origin: ORIGIN, band: BAND, patched, patchedFrom, patchBytes, boot, accepted, target, before, samples, firstGrowth, frozen: frozenRead, after, past, above, repaid, during: JSON.parse(during), allShifts: JSON.parse(allShifts), queueLog: JSON.parse(queueLog), morphs: JSON.parse(morphs), leadProbe, shots };
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  const brief = (s) => s && { y: s.y, t: s.t, q: s.q, lock: s.lock, sq: s.sq, win: s.win, run: s.run, media: s.media, pages: s.pages, pstep: s.pstep, jsPstory: s.jsPstory, room: s.room, covered: s.covered, inSight: s.inSight, below: s.below, lead: s.lead, paged: s.paged, plain: s.plain, cls: s.cls, notices: s.notices };
  console.log(JSON.stringify({
    arm: ARM, view: VW + "x" + VH + (MOBILE ? " mobile" : " desktop"), bootCls: boot.cls, accepted, target, patched,
    before: brief(before),
    firstGrowth: brief(firstGrowth),
    after: brief(after),
    shiftAfterScroll: JSON.parse(during).filter((s) => s.v > 0.001),
    repay: { past: brief(past), above: brief(above), repaid: brief(repaid) },
    queueLog, out: OUT
  }, null, 1));
  ws.close(); chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true });
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED " + e.message);
  try { ws && ws.close(); } catch (_) { /* already gone */ }
  chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true });
  process.exit(1);
});
