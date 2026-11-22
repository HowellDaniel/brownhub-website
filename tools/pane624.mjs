/* Phone rig for #624: the assistant panel's own box, and what it collides with.

   node tools/pane624.mjs [--arm=live|local] [--page=/index.html] [--vw=390] [--vh=844]
                          [--consent=1|0] [--sheet=1] [--out=/tmp/bh624/<arm>.json]

   The panel is a flex column whose height is one clamp over three tokens, so the number a
   visitor sees is the product of --chat-h, --chat-clear and --chat-queue — and none of those
   are the box. This measures the box: where its top and bottom actually land, how the column
   spends its room between the conversation, the quick suggestions and the composer, and which
   page text and which bottom asks end up underneath it. --consent=0 leaves the cookie notice
   up, which is the state that eats 333px of the lane.
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
const CONSENT = ARG.consent !== "0";
const SHEET = ARG.sheet === "1";
const PORT = Number(ARG.port || 9424);
const OUT = ARG.out || `/tmp/bh624/${ARM}-${VW}x${VH}.json`;
mkdirSync(OUT.replace(/[^/]*$/, ""), { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "bh624-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
  /* The window has to be at least as big as the viewport being emulated: asked for
     390x844 inside a window hardcoded to 390x900, Blink clamped the override and this
     rig measured a 407x881 phone while calling it 390x844. */
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
async function ev(expr, awaitPromise) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
  if (r.exceptionDetails) throw new Error("page threw " + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
}

const SEED = `(function(){localStorage.setItem("brownhub-consent", ${JSON.stringify(CONSENT ? JSON.stringify({ necessary: true, analytics: true, advertising: false, decided: true, at: new Date().toISOString() }) : "null")})})();`;

/* --spy=1 arms a witness before any of the page's own scripts run: it logs every
   write to the panel's `hidden` with the stack that wrote it. A phone panel that
   measures 0 is a panel that is closed, and the only answer worth having is who
   closed it — or proof that opening it was never attempted. */
const SPYON = ARG.spy === "1";
const SPY = `(function () {
  window.__spy = { writes: [], errs: [] };
  addEventListener("error", function (e) { window.__spy.errs.push("error " + e.message + " @" + String(e.filename).split("/").pop() + ":" + e.lineno); });
  addEventListener("unhandledrejection", function (e) { window.__spy.errs.push("reject " + String(e.reason && e.reason.message || e.reason)); });
  function arm() {
    var p = document.getElementById("chatPanel");
    if (!p || p.__armed) return !!p;
    p.__armed = 1;
    var d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden");
    Object.defineProperty(p, "hidden", {
      configurable: true,
      get: function () { return d.get.call(p); },
      set: function (v) { window.__spy.writes.push({ to: !!v, at: Math.round(performance.now()), stack: new Error().stack.split("\\n").slice(1, 4).join(" | ") }); d.set.call(p, v); }
    });
    return true;
  }
  var iv = setInterval(function () { if (arm()) clearInterval(iv); }, 5);
})();`;

/* One pass over the open panel. Every number is what Blink painted, not what a
   rule asked for. */
const MEASURE = `
(function () {
  function box(sel) {
    var n = document.querySelector(sel);
    if (!n) return null;
    var r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    var vis = n.hidden === false || n.hidden === undefined;
    if (n.hasAttribute("hidden") || cs.display === "none" || cs.visibility === "hidden") return { gone: true };
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
             w: Math.round(r.width), scrollH: n.scrollHeight, clip: n.scrollHeight - Math.round(r.height),
             ox: n.scrollWidth - Math.round(r.width), pad: cs.padding };
  }
  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  var p = document.querySelector(".chat-widget__panel");
  if (!p) return { noPanel: true };
  var pr = p.getBoundingClientRect();
  var inter = function (r) {
    return Math.max(0, Math.min(pr.right, r.right) - Math.max(pr.left, r.left)) *
           Math.max(0, Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top));
  };
  var nav = document.querySelector(".site-header");
  var navr = nav && nav.getBoundingClientRect();
  var texts = [].slice.call(document.querySelectorAll("main p, main h2, main h3, h1, .hero p"))
    .filter(function (n) {
      var r = n.getBoundingClientRect();
      return r.height > 8 && r.top < innerHeight && r.bottom > 0 && getComputedStyle(n).visibility !== "hidden";
    });
  var covered = 0, partly = 0, coveredWords = [];
  texts.forEach(function (n) {
    var r = n.getBoundingClientRect();
    var a = inter(r);
    if (a <= 0) return;
    var own = Math.max(1, r.width * r.height);
    if (a / own > 0.6) { covered++; } else { partly++; }
    if (coveredWords.length < 6) coveredWords.push((n.tagName + " " + n.textContent.trim().slice(0, 34)));
  });
  var asks = [["teaser", ".chat-widget__teaser"], ["quote", ".leadask"], ["install", ".install"],
              ["consent", ".cookie-notice"], ["welcome", ".promo:not([hidden])"]];
  var hits = asks.map(function (a) {
    var n = document.querySelector(a[1]);
    if (!n) return null;
    var cs = getComputedStyle(n);
    if (n.hasAttribute("hidden") || cs.display === "none" || cs.visibility === "hidden") return null;
    var r = n.getBoundingClientRect();
    var area = inter(r);
    if (area <= 0) return null;
    return { k: a[0], px: Math.round(area), top: Math.round(r.top), h: Math.round(r.height) };
  }).filter(Boolean);
  /* An ask that is not overlapping the panel and an ask that was never raised look
     identical in the hits list. The bottom queue decides when each one appears, so a run
     that reports a clean lane has to say which of the two it actually measured. */
  var askEls = asks.map(function (a) {
    var n = document.querySelector(a[1]);
    if (!n) return a[0] + ":never-raised";
    var cs = getComputedStyle(n);
    return a[0] + (n.hasAttribute("hidden") || cs.display === "none" ? ":hidden" : cs.visibility === "hidden" ? ":invisible" : ":standing");
  }).join(" ");
  /* Who owns the bottom edge right now. An ask that never got the edge is queued, not
     cancelled, so the state a run measured is decided here and nowhere else. */
  var askOwner = window.bhAsk && window.bhAsk.owner ? window.bhAsk.owner() : "no-queue";
  var chips = [].slice.call(document.querySelectorAll(".chat-widget__chips button"))
    .map(function (b) { var r = b.getBoundingClientRect();
      return { t: b.textContent.trim().slice(0, 18), top: Math.round(r.top), h: Math.round(r.height),
               under: Math.round(pr.bottom - r.bottom) }; });
  return {
    view: innerWidth + "x" + innerHeight,
    tokens: { h: token("--chat-h"), min: token("--chat-min"), clear: token("--chat-clear"),
              queue: token("--chat-queue"), navH: token("--nav-h"), cookieH: token("--cookie-h"),
              leadH: token("--lead-h"), railLane: token("--rail-lane"), queueH: token("--queue-h"),
              /* The computed --nav-h cannot tell a published height from the stylesheet's
                 72px default, and the two behave differently: an unpublished one means
                 js/scroll.js had not measured the header yet, so the sheet parks itself
                 under a header that is already painted taller. */
              navInline: document.documentElement.style.getPropertyValue("--nav-h"),
              navPaint: (function () { var n = document.querySelector(".site-header");
                return n ? Math.round(n.getBoundingClientRect().height) : null; })() },
    panel: { hidden: p.hidden, top: Math.round(pr.top), bottom: Math.round(pr.bottom), h: Math.round(pr.height),
             w: Math.round(pr.width), left: Math.round(pr.left), right: Math.round(pr.right),
             maxH: getComputedStyle(p).maxHeight, minH: getComputedStyle(p).minHeight,
             pos: getComputedStyle(p).position },
    parts: { head: box(".chat-widget__head"), msgs: box(".chat-widget__messages"),
             chips: box(".chat-widget__chips"), files: box(".chat-widget__files"),
             emoji: box(".chat-widget__emoji"), handoff: box(".chat-widget__handoff"),
             voice: box(".chat-widget__voice"), form: box(".chat-widget__form") },
    chips: chips,
    room: { aboveNav: navr ? Math.round(pr.top - navr.bottom) : null,
            belowEdge: Math.round(innerHeight - pr.bottom) },
    collide: { textFullyCovered: covered, textPartlyCovered: partly, samples: coveredWords,
               asks: hits, askEls: askEls, askOwner: askOwner },
    consent: localStorage.getItem("brownhub-consent"),
    errs: []
  };
})();`;

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
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });
  if (SPYON) await send("Page.addScriptToEvaluateOnNewDocument", { source: SPY });

  const nav = once("Page.loadEventFired", 120000);
  await send("Page.navigate", { url: URL });
  await nav;
  await sleep(4500);

  /* Wait on the two facts the sheet is measured against, not on the clock. The grip span
     is created by js/chat.js's own setup pass, so a page whose chat script never got that
     far has no grip — and a rig that measures such a page reports a 0px panel and blames
     the stylesheet. js/scroll.js publishes --nav-h from a ResizeObserver on the header;
     until it has, var(--nav-h, 72px) resolves to the stylesheet default while the phone
     header paints 117px, so the sheet looks like it is tucked under the nav. Both states
     cost this pass "regressions" that were never in the CSS. */
  const FACTS = `(function () {
    var out = { grip: !!document.querySelector(".chat-widget__grip"),
                nav: !!document.documentElement.style.getPropertyValue("--nav-h"),
                ids: {}, res: [], readyState: document.readyState, now: Math.round(performance.now()) };
    ["chatToggle", "chatPanel", "chatMessages", "chatChips", "chatForm", "chatInput", "chatClose"]
      .forEach(function (id) { out.ids[id] = !!document.getElementById(id); });
    /* The resource-timing buffer is the only witness that distinguishes "the browser
       never got chat.js" from "it got it and the script bailed". Report the raw names:
       a regex that silently matches nothing is how this question stayed open for
       eleven runs — and scroll.js belongs in the pattern, because it is the script that
       publishes --nav-h and its absence is the only explanation for a sheet parked
       under the header. Never use HTMLScriptElement.complete as a "ran yet" witness:
       measured here, it reported all thirty deferred scripts PENDING on a page where
       chat.js had plainly built the panel. Ask the buffer instead. */
    out.fetched = {};
    performance.getEntriesByType("resource").forEach(function (r) {
      out.fetched[r.name.replace(/^https?:\\/\\/[^/]+/, "").split("?")[0]] = true;
      if (/chat\\.js|assistant-shared\\.js|app\\.js|scroll\\.js|style\\.min\\.css/.test(r.name))
        out.res.push(r.name.replace(/^https?:\\/\\/[^/]+/, "") + " end " + Math.round(r.responseEnd) +
                     " status " + r.responseStatus + " bytes " + r.transferSize);
    });
    /* Compare whole paths against the buffer. Matching with indexOf on a name that
       starts with a slash is how this witness declared all thirty scripts unfetched
       on a page that had fetched every one of them. */
    out.served = [].slice.call(document.querySelectorAll("script[src]")).map(function (s) {
      return s.getAttribute("src").split("?")[0];
    });
    out.notFetched = out.served.filter(function (src) { return !out.fetched["/" + src]; });
    return out; })()`;
  let ready = null;
  const waited = [];
  for (let i = 0; i < 24; i++) {
    ready = await ev(FACTS);
    if (ready.grip && ready.nav) break;
    waited.push(ready.now);
    await sleep(500);
  }
  ready.waitedMs = waited.length * 500;
  ready.pendingFetch = await ev(`(fetch("js/chat.js?v=45",{cache:"no-store"}).then(function(r){return "chat.js " + r.status + " " + r.headers.get("content-type")}).catch(function(e){return "FETCH THREW " + e.message}))`, true);
  if (!ready.grip) console.log("NOT WIRED: js/chat.js never built the panel chrome —", JSON.stringify(ready, null, 1));
  if (!ready.nav) console.log("NAV UNPUBLISHED: js/scroll.js has not measured the header, so --nav-h is still the 72px stylesheet default —", JSON.stringify(ready, null, 1));
  if (ready.notFetched && ready.notFetched.length) console.log("STILL OUT OF THE PIPE at " + ready.now + "ms: " + ready.notFetched.join(", "));

  /* The welcome card is a modal and owns the screen first; dismiss it so the
     measurement sees the chat lane, not the overlay. */
  const promo = await ev(`(function(){
    var x=document.querySelector(".promo:not([hidden]) [data-promo-close]");
    if(!x) return "none"; x.click(); return "closed"})()`);
  await sleep(700);

  const opened = await ev(`(function(){
    var b=document.querySelector(".chat-widget__toggle");
    var p=document.querySelector(".chat-widget__panel");
    if (p && !p.hidden) return "already open";
    if (!b) return "no toggle";
    b.click();
    /* Read the box in the same tick the click was dispatched: an openChat that ran
       and a panel that was reopened by nothing are different failures, and only the
       first one can be traced to whoever closed it. */
    window.__click = { hiddenSync: p.hidden, aria: b.getAttribute("aria-expanded"),
                       grip: !!document.querySelector(".chat-widget__grip"),
                       t: Math.round(performance.now()) };
    return "clicked"})()`);
  await sleep(1200);
  const beforeSend = await ev(MEASURE);
  const typed = await ev(`(function(){
    var i=document.querySelector(".chat-widget__panel input");
    if(!i) return "no field";
    i.value="I need a flyer for a launch event";
    i.dispatchEvent(new Event("input",{bubbles:true}));
    var f=document.querySelector(".chat-widget__form");
    if(f) f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    return "sent"})()`);
  await sleep(1500);
  if (SHEET) {
    await ev(`(function(){var b=document.querySelector(".chat-widget__emoji-btn");
      if(b){b.click();return "emoji"}var c=[].slice.call(document.querySelectorAll(".chat-widget__comp"));
      if(c.length>1)c[1].click();return "comp"})()`);
    await sleep(600);
  }

  const m = await ev(MEASURE);
  if (m.view !== VW + "x" + VH) {
    console.error(`VIEW MISMATCH: asked for ${VW}x${VH}, the page measured ${m.view} — every number in this run belongs to a different phone.`);
    throw new Error("viewport not emulated");
  }
  m.beforeSend = beforeSend;
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/bh624/shot-${ARM}-${VW}x${VH}${SHEET ? "-sheet" : ""}.png`, Buffer.from(shot.data, "base64"));
  const spy = SPYON ? await ev(`(function(){var p=document.getElementById("chatPanel");
    return { armed: !!(p && p.__armed), click: window.__click || null,
             writes: (window.__spy || { writes: [] }).writes, errs: (window.__spy || { errs: [] }).errs };})()`) : null;
  writeFileSync(OUT, JSON.stringify({ ARM, url: URL, promo, opened, typed, spy, ready, m }, null, 1));
  console.log(JSON.stringify({
    arm: ARM, view: m.view, promo, wired: ready.grip, navH: ready.nav, waitedMs: ready.waitedMs,
    panel: m.panel, room: m.room,
    panelBeforeSend: beforeSend.panel, chipsBeforeSend: beforeSend.chips,
    partsBeforeSend: beforeSend.parts, asksBeforeSend: beforeSend.collide.asks,
    textBeforeSend: beforeSend.collide.textFullyCovered + "f/" + beforeSend.collide.textPartlyCovered + "p",
    parts: m.parts, asksHit: m.collide.asks, text: `${m.collide.textFullyCovered}f/${m.collide.textPartlyCovered}p`,
    tokens: m.tokens, chips: m.chips, out: OUT
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
