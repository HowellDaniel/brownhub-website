/* A/B for issue #617: does an apology for a failed model call stay in what the visitor
   remembers?

     node tools/memory617.mjs --arm=live      the published chat.js, as a visitor gets it
     node tools/memory617.mjs --arm=patch     js/chat.js from this working tree, served in
                                              place of the published copy

   Both arms do the same thing on the same live origin: park two failing answers on the
   provider call, put one question, read what the browser filed away, then ask a second
   question for real and read the thread that rode to the model with it. The only variable
   is which chat.js ran, so a difference in `stored` is the fix and nothing else.

   A fresh profile means no service worker controls the page, and logChat is stubbed the
   moment the panel is touched — an answer logged here would otherwise land in the owner's
   live chat_logs table over the committed publishable key.
*/
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const ARM = ARG.arm || "patch";
const ROOT = "/Users/brownhub/Documents/Qoder/2026-09-16/5bb3bd1c";
const ORIGIN = "https://www.brownhub283.com";
const PAGE = ARG.page || "/catalog.html";
const PORT = Number(ARG.port || 9421);
const OUT = ARG.out || `/tmp/bh617/${ARM}.json`;
const Q1 = "Hi, I am Kwame. I need 500 flyers.";
const Q2 = "And how long would that take?";
/* The published copy gives up after one failing call, so one 502 is enough to see its
   apology; the fixed copy puts the question once more and needs two to reach the same
   apology. Both arms therefore end the first turn in exactly the same visible place.
   --fails=0 asks for no injected failure at all, which is how the remembering of an answer
   that really did arrive is measured. */
const FAILS = ARG.fails !== undefined ? Number(ARG.fails) : (ARM === "patch" ? 2 : 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(require_dir(OUT), { recursive: true });
function require_dir(p) { return p.slice(0, p.lastIndexOf("/")); }

const profile = mkdtempSync(join(tmpdir(), "bh617-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
  "about:blank",
], { stdio: "ignore" });

let ws, browserWs, nextId = 0, sessionId = null;
const pending = new Map(), subs = [];
function fire(method, m) { for (const s of subs) if (s.method === method) s.fn(m); }
function route(m) {
  if (m.method === "Target.receivedMessageFromTarget") {
    const inner = JSON.parse(m.params.message);
    if (inner.id && pending.has(inner.id)) {
      const w = pending.get(inner.id); pending.delete(inner.id);
      inner.error ? w.reject(new Error(inner.method + ": " + inner.error.message)) : w.resolve(inner.result);
      return;
    }
    fire(inner.method, inner);
    return;
  }
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
    ws.send(JSON.stringify(sessionId ? { id: nextId, method, params: params || {}, sessionId }
      : { id: nextId, method, params: params || {} }));
  });
}
function once(method, ms) {
  return new Promise((resolve) => {
    const s = { method, fn: (m) => { clearTimeout(t); subs.splice(subs.indexOf(s), 1); resolve(m); } };
    const t = setTimeout(() => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); resolve(null); }, ms);
    subs.push(s);
  });
}
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("page threw " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, ms, label) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await ev(expr)) return true;
    await sleep(500);
  }
  throw new Error("waited out: " + label);
}

const INSTALL = `(() => {
  if (window.BHAccounts) window.BHAccounts.logChat = function () {};
  localStorage.removeItem("brownhub-chat-history");
  window.__N = { calls: [], times: [], fail: 0, asks: 0 };
  const real = window.fetch;
  window.fetch = function (url, opt) {
    if (String(url).indexOf("brownhub-assistant") < 0) return real.apply(this, arguments);
    var h = null;
    try { h = JSON.parse(opt.body.get("h")); } catch (e) {}
    window.__N.calls.push(h ? h.map(function (t) { return t.role + ":" + t.text.slice(0, 20); }) : ["(no readable h)"]);
    var timing = { at: window.__N.calls.length, from: Date.now(), ms: null, status: null, err: null };
    window.__N.times.push(timing);
    if (window.__N.fail > 0) {
      window.__N.fail--;
      timing.ms = 0; timing.status = 502;
      return Promise.resolve(new Response(JSON.stringify({ error: "The assistant is not answering right now." }),
        { status: 502, headers: { "content-type": "application/json" } }));
    }
    return real.apply(this, arguments).then(
      function (r) { timing.ms = Date.now() - timing.from; timing.status = r.status; window.__N.lastStatus = r.status; return r; },
      function (err) { timing.ms = Date.now() - timing.from; timing.err = String(err && err.message || err); throw err; }
    );
  };
  return { send: typeof (window.BROWNHUB_CHAT || {}).send, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };
})()`;

/* `settled` is the page's own answer to "has this turn finished": the typing bubble is gone
   and there is at least one bot bubble per question asked. lastStatus is set the moment the
   network answers, which is before chat.js has filed anything, so waiting on it alone reads
   a turn still in mid-air. */
/* A turn has settled when the page is no longer showing its waiting state and has put up at
   least one reply for each question asked. lastStatus is set the instant the network answers,
   which is before chat.js has rendered or filed anything, so waiting on it alone reads a
   turn still in mid-air — that is what made a turn-2 answer look missing last run. */
const SETTLED = `(() => { var n = window.__N || { asks: 0 };
  return document.querySelectorAll(".chat-msg--typing").length === 0
    && document.querySelectorAll(".chat-msg--bot:not(.chat-msg--typing)").length >= n.asks; })()`;

const READ = `(() => {
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem("brownhub-chat-history") || "null"); } catch (e) {}
  var bot = [].slice.call(document.querySelectorAll(".chat-msg--bot:not(.chat-msg--typing)"))
      .map(function (b) { return b.textContent.trim().replace(/\\s+/g, " ").slice(0, 46); });
  return {
    calls: window.__N ? window.__N.calls : null,
    times: window.__N ? window.__N.times.map(function (t) { return { at: t.at, ms: t.ms, status: t.status, err: t.err }; }) : null,
    failLeft: window.__N ? window.__N.fail : null,
    lastStatus: window.__N ? window.__N.lastStatus || null : null,
    stored: stored ? stored.turns.map(function (t) { return t.role + ":" + t.text.slice(0, 30); }) : null,
    bubbles: bot,
  };
})()`;

async function boot(url) {
  const nav = once("Page.loadEventFired", 90000);
  await send("Page.navigate", { url });
  await nav;
  await sleep(4500);
}

(async () => {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
    catch (e) { await sleep(300); }
  }
  if (!version) throw new Error("chrome never came up on " + PORT);
  browserWs = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => { browserWs.onopen = r; });
  ws = browserWs;
  ws.onmessage = (e) => route(JSON.parse(e.data));

  const target = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  if (ARM === "patch") {
    const text = readFileSync(join(ROOT, "js/chat.js"), "utf8");
    subs.push({
      method: "Fetch.requestPaused",
      fn: (m) => {
        const p = m.params || m;
        if (!/\/js\/chat\.js(\?|$)/.test(p.request.url)) {
          send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
          return;
        }
        send("Fetch.fulfillRequest", {
          requestId: p.requestId, responseCode: 200,
          responseHeaders: [{ name: "content-type", value: "application/javascript; charset=utf-8" },
            { name: "cache-control", value: "no-store" }],
          body: Buffer.from(text, "utf8").toString("base64"),
        }).catch(() => {});
      },
    });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/js/chat.js*", requestStage: "Request" }] });
  }

  await boot(ORIGIN + PAGE);
  const armed = await ev(INSTALL);

  await ev(`window.__N.asks = 1; window.__N.fail = ${FAILS}; window.BROWNHUB_CHAT.send(${JSON.stringify(Q1)}); "sent"`);
  await waitFor(SETTLED, 90000, "the first turn to settle");
  const turn1 = await ev(READ);

  await ev(`window.__N.asks = 2; window.__N.fail = 0; window.BROWNHUB_CHAT.send(${JSON.stringify(Q2)}); "sent"`);
  await waitFor(SETTLED, 150000, "the second turn to settle");
  const turn2 = await ev(READ);

  await boot(ORIGIN + PAGE);
  const reopened = await ev(READ);

  const poison = (o) => (o.stored || []).filter((t) => /didn't quite catch|not answering|could not process/.test(t));
  const verdict = {
    arm: ARM, failForTurn1: FAILS, armed,
    turn1: { attempts: turn1.calls.length, ms: turn1.times.map((t) => `${t.ms}ms/${t.status ?? "x"}`), said: turn1.bubbles[turn1.bubbles.length - 1], stored: turn1.stored, apologyInMemory: poison(turn1) },
    turn2: { attempts: turn2.calls.length - turn1.calls.length, ms: turn2.times.slice(turn1.times.length).map((t) => `${t.ms}ms/${t.status ?? "x"}`), hSentToModel: turn2.calls[turn1.calls.length], said: turn2.bubbles[turn2.bubbles.length - 1], stored: turn2.stored, apologyInMemory: poison(turn2) },
    afterReload: { replayed: reopened.bubbles, stored: reopened.stored, apologyInMemory: poison(reopened) },
  };
  writeFileSync(OUT, JSON.stringify({ verdict, turn1, turn2, reopened }, null, 1));
  console.log(JSON.stringify(verdict, null, 1));
  ws.close(); chrome.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (_) { /* left */ }
  process.exit(0);
})().catch(async (e) => {
  console.error("FAILED " + e.message);
  try { ws && ws.close(); } catch (_) { /* gone */ }
  chrome.kill("SIGKILL");
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (_) { /* left */ }
  process.exit(1);
});
