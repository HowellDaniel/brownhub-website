/* Phone rig for issue #581: how many asks may stand at the bottom of the screen at once.

   node tools/ask581.mjs [--arm=live|local] [--page=/index.html] [--hold=4000]
                         [--out=/tmp/bh581/<arm>.json] [--shot=/tmp/bh581]

   Measured live at 390x844 for #581: on a first visit a phone was handed the cookie notice,
   the install pill, the quote card and the assistant's teaser together — 623px of an 844px
   screen. js/askqueue.js now hands out the right to stand there, so this run walks a visitor
   through the four in the order they actually arrive (notice, then answer it, then say not now
   to the pill, then close the quote card) and counts, a hundred times a second, how many asks
   are on screen and who owns the edge. `live` measures the build that is published today and
   `local` the working tree, so the same timeline gives the before and the after.
*/
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const ARM = ARG.arm || "local";
const ORIGIN = ARG.origin || (ARM === "local" ? "http://127.0.0.1:8123" : "https://www.brownhub283.com");
const PAGE = ARG.page || "/index.html";
const URL = ORIGIN + PAGE + (PAGE.includes("?") ? "&" : "?") + "app=1";
const VW = Number(ARG.vw || 390);
const VH = Number(ARG.vh || 844);
const PORT = Number(ARG.port || 9413);
const OUT = ARG.out || `/tmp/bh581/${ARM}.json`;
const SHOTDIR = ARG.shot || null;
const BOOT_HOLD = Number(ARG.hold || 4000);
mkdirSync(OUT.replace(/[^/]*$/, ""), { recursive: true });
if (SHOTDIR) mkdirSync(SHOTDIR, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bh581-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
  "--window-size=390,900", "about:blank",
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

/* The observer. `standing` is what a visitor can see, on the same tests js/app.js charges the
   bottom edge with, so a claim counted here is a claim the page is being made to pay for. The
   chat bubble is deliberately not in ASKS — it is a control, not an ask; #581 is about the
   notices that cover the words. */
const INSTRUMENT = `
(function () {
  var ASKS = [["consent", ".cookie-notice"], ["build", ".install--build"],
              ["install", ".install:not(.install--build)"], ["quote", ".leadask"],
              ["teaser", ".chat-widget__teaser"]];
  var Q = window.__q = { t0: performance.now(), samples: [], hands: [], errs: [], cls: 0, seen: {} };
  addEventListener("error", function (e) {
    Q.errs.push(String(e.message) + " @" + (e.filename || "").split("/").pop() + ":" + (e.lineno || 0));
  }, true);
  new PerformanceObserver(function (l) {
    for (var e of l.getEntries()) if (!e.hadRecentInput) Q.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  function standing() {
    var out = [];
    ASKS.forEach(function (a) {
      var n = document.querySelector(a[1]);
      if (!n || n.hidden || n.getAttribute("aria-hidden") === "true") return;
      if (n.classList.contains("is-gone")) return;
      if (getComputedStyle(n).visibility === "hidden") return;
      var r = n.getBoundingClientRect();
      if (r.height <= 1 || r.top >= innerHeight) return;
      out.push({ k: a[0], top: Math.round(r.top), h: Math.round(r.height),
                 room: Math.round(innerHeight - r.top) });
    });
    return out;
  }
  var owner = "-";
  setInterval(function () {
    var st = standing();
    var o = (window.bhAsk && window.bhAsk.owner()) || "-";
    var q = Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--queue-h")) || 0);
    if (o !== owner) { Q.hands.push({ t: Math.round(performance.now()), was: owner, now: o, up: st.length }); owner = o; }
    Q.samples.push({ t: Math.round(performance.now()), o: o, q: q, n: st.length, a: st.map(function (s) { return s.k; }),
                     room: st.reduce(function (m, s) { return Math.max(m, s.room); }, 0) });
    st.forEach(function (s) { if (!Q.seen[s.k]) Q.seen[s.k] = { t: s.top >= 0 ? Math.round(performance.now()) : 0, h: s.h }; });
  }, 100);
})();`;

const SUMMARY = `
(function () {
  var Q = window.__q;
  var stack = Q.samples.filter(function (s) { return s.n > 1; });
  var pairs = {};
  stack.forEach(function (s) { pairs[s.a.slice().sort().join("+")] = (pairs[s.a.slice().sort().join("+")] || 0) + 1; });
  return {
    ownerApi: !!window.bhAsk,
    ranks: (window.BHAskQueue && window.BHAskQueue.RANKS) || null,
    samples: Q.samples.length,
    maxStanding: Q.samples.reduce(function (m, s) { return Math.max(m, s.n); }, 0),
    stackedSamples: stack.length,
    stackedCombos: pairs,
    peakQueueH: Q.samples.reduce(function (m, s) { return Math.max(m, s.q); }, 0),
    peakRoom: Q.samples.reduce(function (m, s) { return Math.max(m, s.room); }, 0),
    seen: Q.seen,
    hands: Q.hands,
    cls: Number(Q.cls.toFixed(4)),
    errs: Q.errs.slice(0, 6),
    storage: { consent: localStorage.getItem("brownhub-consent"), install: localStorage.getItem("brownhub-install") }
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

  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setCPUThrottlingRate", { rate: Number(ARG.cpu ?? 4) });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });

  const nav = once("Page.loadEventFired", 120000);
  await send("Page.navigate", { url: URL });
  await nav;
  const marks = { boot: {} };
  async function shot(tag) {
    if (!SHOTDIR) return;
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${SHOTDIR}/${ARM}-${tag}.png`, Buffer.from(data, "base64"));
  }
  async function phase(tag, ms) {
    await sleep(ms);
    marks[tag] = await ev(SUMMARY);
    await shot(tag);
  }

  /* 1. Arrive and read the top of the page: the notice claims the edge, and the pill, the
         quote card and the teaser all ask for it behind. */
  await phase("boot", BOOT_HOLD);

  /* 2. Read down the page, which is how js/leads.js earns the quote card (45% and four
         seconds), then come back up. The card is now waiting for the edge. */
  await ev(`(function(){var m=document.documentElement.scrollHeight-innerHeight;scrollTo(0,Math.round(m*0.55))})()`);
  await sleep(1400);
  await ev("scrollTo(0,0)");
  await sleep(600);
  await phase("read", 1200);

  /* 3. Answer the notice. The edge must pass to the install pill, not to a stack. */
  const accept = await ev(`(function(){var b=[].slice.call(document.querySelectorAll('.cookie-notice button')).find(function(x){return /accept/i.test(x.textContent)});if(!b)return 'no notice';b.click();return 'accepted'})()`);
  await sleep(900);
  await phase("afterConsent", 2500);

  /* 4. Say not now to the pill. */
  const pillNo = await ev(`(function(){var b=document.querySelector('.install:not(.install--build) .install__no');if(!b)return 'no pill';b.click();return 'dismissed'})()`);
  await sleep(900);
  await phase("afterInstall", 3000);

  /* 5. Close whatever holds the edge next (the quote card), so the teaser's turn comes. */
  const nextNo = await ev(`(function(){
    var n=document.querySelector('.leadask .leadask__x');
    if(!n)return 'no card';
    n.click(); return (n.getAttribute('aria-label')||n.textContent||'').trim()})()`);
  await sleep(1200);
  await phase("afterQuote", 4000);

  /* 6. A dismissed notice that never released its claim is the deadlock this queue can cause,
         so take one off the DOM by hand and check the measured pass sweeps it. */
  const swept = await ev(`(function(){
    var o = window.bhAsk ? window.bhAsk.owner() : null;
    var n = document.querySelector('.leadask');
    if (n) n.remove();
    if (window.bhAsk) window.bhAsk.sweep();
    return { was: o, now: window.bhAsk ? window.bhAsk.owner() : null } })()`);
  await sleep(900);
  await phase("afterSweep", 1500);

  const final = await ev(SUMMARY);
  const timeline = await ev("JSON.stringify(window.__q.samples)");
  marks.accept = accept; marks.pillNo = pillNo; marks.nextNo = nextNo; marks.swept = swept;
  writeFileSync(OUT, JSON.stringify({ ARM, url: URL, view: VW + "x" + VH, marks, final, samples: JSON.parse(timeline) }, null, 1));
  console.log(JSON.stringify({
    arm: ARM, url: URL, ownerApi: final.ownerApi, ranks: final.ranks,
    maxStanding: final.maxStanding, stackedSamples: final.stackedSamples, stackedCombos: final.stackedCombos,
    peakQueueH: final.peakQueueH, peakRoom: final.peakRoom,
    seen: Object.keys(final.seen).map((k) => `${k}@${final.seen[k].t}ms/${final.seen[k].h}px`),
    hands: final.hands, cls: final.cls, errs: final.errs,
    steps: { accept, pillNo, nextNo, swept }, out: OUT
  }, null, 1));
  ws.close(); chrome.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED " + e.message);
  try { ws && ws.close(); } catch (_) { /* already gone */ }
  chrome.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch (_) { console.error("left behind: " + profile); }
  process.exit(1);
});
