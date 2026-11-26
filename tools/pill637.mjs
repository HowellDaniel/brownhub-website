/*
  #637 — the problem-feedback pill, proven where it actually hangs.

  A pill bolted to 54 pages is only worth shipping if, on each of the shapes a visitor
  brings, it (a) paints, (b) does not sit on top of the chat bubble or the bottom asks,
  (c) opens and closes by hand and by key, and (d) can get its note to the studio under
  the page's own CSP. None of that is readable from markup, so this rig drives a real
  Blink frame and prints measured facts.

    node tools/pill637.mjs [--door=ok|fail] [--page=index.html|404.html|blog/index.html|gallery/flyer.html]

  The door is stubbed in every arm: `--door=fail` cannot be paid for with a real row, and
  a real row from this rig would be a lie in the owner's feedback table. What the stub can
  and cannot prove is printed with each run.
*/
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const DOOR = flag("door", "ok");
const PAGE = flag("page", "index.html");
const PORT = Number(flag("port", 9641));
const ORIGIN = `http://127.0.0.1:8123`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = `(() => {
  window.__pf = { calls: 0, door: "__DOOR__", bodies: [] };
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("/capture/feedback") > -1) {
      window.__pf.calls++;
      try { window.__pf.bodies.push(JSON.parse(init.body)); } catch (e) { window.__pf.bodies.push(null); }
      if (window.__pf.door === "fail") {
        return Promise.resolve(new Response("{}", { status: 500 }));
      }
      return Promise.resolve(new Response('{"ok":true}', { status: 200,
        headers: { "content-type": "application/json" } }));
    }
    return real.apply(this, arguments);
  };
  const cl = window.console;
  window.__pf.errors = [];
  ["error", "warn"].forEach((k) => { const f = cl[k]; cl[k] = function () {
    window.__pf.errors.push(k + ": " + Array.prototype.join.call(arguments, " ").slice(0, 160));
    return f.apply(this, arguments); }; });
})();`.replace("__DOOR__", DOOR);

const FACTS = `(() => {
  const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.top), w: Math.round(b.width),
             h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
  const cs = (n, p) => n ? getComputedStyle(n)[p] : null;
  const pair = document.querySelector(".report-pair");
  const pill = document.querySelector(".report-pill");
  const mark = document.querySelector(".report-pill__mark");
  const key = document.querySelector(".report-modal__key");
  const bubble = document.querySelector(".chat-widget__toggle");
  const modal = document.querySelector(".report-modal");
  const asks = Array.from(document.querySelectorAll(".install, .chat-widget__teaser, .cookie-notice, .leadask"))
    .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < innerHeight; });
  const overlap = (a, b) => !!(a && b) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  return {
    lang: document.documentElement.lang, dir: document.documentElement.dir,
    hasPair: !!pair, pair: r(pair), pill: r(pill),
    mark: mark ? mark.textContent : null,
    name: pill ? pill.getAttribute("aria-label") : null,
    round: pill ? { radius: cs(pill, "borderRadius"), square: r(pill).w === r(pill).h } : null,
    circles: document.querySelectorAll(".report-pair a, .report-pair button").length,
    keyShown: key ? cs(key, "display") !== "none" : null,
    helpLink: (() => { const a = document.querySelector("a.report__help");
      return a ? new URL(a.getAttribute("href"), document.baseURI).pathname : null; })(),
    bubble: r(bubble), pairOnBubble: overlap(pair, bubble),
    askCount: asks.length, pairOnAsk: asks.some((n) => overlap(pair, n)),
    askNames: asks.map((n) => n.className.split(" ")[0]),
    queueH: cs(document.documentElement, "--queue-h"),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    modalHidden: modal ? modal.hidden : null,
    sendDisabled: (document.querySelector(".report__send") || {}).disabled,
    askTile: !!document.querySelector(".report__ask"),
    errors: window.__pf.errors.slice(0, 4),
  };
})()`;

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "bh-pill-"));
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
    "--no-first-run", "--disable-extensions", "--disable-sync", "about:blank",
  ], { stdio: "ignore" });
  let ws, nextId = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++nextId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const ev = async (expression) => {
    const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error("probe: " + JSON.stringify(out.exceptionDetails.exception).slice(0, 200));
    return out.result.value;
  };
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((p) => p.type === "page");
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch (e) { /* still booting */ }
  }
  if (!ws) { chrome.kill(); throw new Error("no CDP page target"); }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const w = pending.get(m.id); pending.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  };
  await new Promise((res) => { ws.onopen = res; });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });

  const shot = async (name, clip) => {
    const out = await send("Page.captureScreenshot", { format: "png", clip: Object.assign({ scale: 2 }, clip) });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`/tmp/${name}.png`, Buffer.from(out.data, "base64"));
  };
  const frame = async (width, height, mobile) => {
    await send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false, maxTouchPoints: 1 });
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 3 : 2, mobile: !!mobile });
  };
  /* The install pill and the cookie notice are built by their own scripts on their own
     conditions, and the badge has to survive them. Rather than hope one is standing, the
     rig puts the site's own class on a fixture of the site's own markup: the geometry the
     CSS gives it is the geometry a visitor gets. */
  const armAsks = () => ev(`(() => {
    const i = document.createElement("div");
    i.className = "install install--in";
    const p = document.createElement("p"); p.textContent = "Install BrownHub Studio";
    i.appendChild(p);
    document.body.appendChild(i);
    const c = document.createElement("div");
    c.className = "cookie-notice";
    const cp = document.createElement("p"); cp.textContent = "We use cookies."; c.appendChild(cp);
    document.body.appendChild(c);
    return { install: !!document.querySelector(".install"), cookie: !!document.querySelector(".cookie-notice") };
  })()`);
  const load = async (url, settle) => {
    await send("Page.navigate", { url });
    await sleep(settle || 4200);
  };
  const until = async (expr, limit) => {
    for (let i = 0; i < (limit || 40); i++) { if (await ev(expr)) return true; await sleep(150); }
    return false;
  };

  /* A visitor presses the badge with a mouse, and a press is what puts focus on it. A
     programmatic .click() never does, so the focus-restore path has to be driven the way
     a hand drives it or it is never measured at all. */
  const press = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons: type === "mousePressed" ? 1 : 0 });
    }
  };
  const rows = [];
  const gate = (name, ok, fact) => { rows.push([ok ? "PASS" : "FAIL", name, fact]); return ok; };

  // ── desk ────────────────────────────────────────────────────────────────────
  await frame(1440, 900, false);
  await load(`${ORIGIN}/${PAGE}`);
  await until("!!document.querySelector('.report-pair')");
  const desk = await ev(FACTS);
  console.log("desk", PAGE, JSON.stringify(desk));
  gate("the corner holds one round mark", desk.hasPair && desk.pill.w === 44 && desk.round.square && desk.circles === 1,
    `pill ${desk.pill.w}x${desk.pill.h} radius=${desk.round.radius} pressables=${desk.circles}`);
  gate("the mark is a picture but is named in words", desk.mark === "?" && /feedback|مشكلة/.test(desk.name), `aria-label "${desk.name}"`);
  gate("the desk frame is shown the key hint inside the dialog", desk.keyShown === true, `key display shown=${desk.keyShown}`);
  gate("the badge clears the chat bubble", desk.pairOnBubble === false, `badge ${JSON.stringify(desk.pair)} bubble ${JSON.stringify(desk.bubble)}`);
  gate("the badge clears the asks already standing", desk.pairOnAsk === false, `asks=${desk.askCount} ${desk.askNames}`);
  gate("the help centre is one click inside the dialog", desk.helpLink === "/help.html", desk.helpLink);
  gate("nothing spilled sideways", desk.overflowX <= 0, `overflowX=${desk.overflowX}`);
  gate("the page console stayed clean", desk.errors.length === 0, JSON.stringify(desk.errors));
  await shot("pill637-desk", { x: 1000, y: 620, width: 440, height: 280 });

  // ── open, trap, close ───────────────────────────────────────────────────────
  /* The home page raises its arrival card on arrival, and that card dims the whole viewport
     two rungs above the corner mark. That is this site's own modal rule — the chat bubble
     parked in the same corner goes unreachable the same way — so the honest sequence is what
     a hand actually does: the first press lands on the dim and takes the studio's offer down,
     the second opens the dialog. Measuring one press and calling the badge broken would be
     the rig lying about the page. */
  const cardUp = await until("!document.getElementById('home-promo').hidden");
  const corner = await ev(`(() => { const box = document.getElementById("home-promo");
    const b = document.querySelector(".report-pair").getBoundingClientRect();
    const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { card: box ? !box.hidden : null, top: t ? t.className : null }; })()`);
  gate("the arrival card owns the corner while it is up", cardUp && corner.card === true && /promo__backdrop/.test(corner.top), JSON.stringify(corner));
  const cx = desk.pill.x + Math.round(desk.pill.w / 2), cy = desk.pill.y + Math.round(desk.pill.h / 2);
  await press(cx, cy);
  gate("a press on the dim takes the studio's offer down", await until("document.getElementById('home-promo').hidden"), "backdrop press");
  await press(cx, cy);
  await until(`!document.querySelector(".report-modal").hidden`);
  const opened = await ev(`(() => ({ hidden: document.querySelector(".report-modal").hidden,
    focus: document.activeElement.id, bodyLock: document.body.classList.contains("report-open"),
    role: document.querySelector(".report-modal").getAttribute("aria-modal"),
    card: (() => { const b = document.querySelector(".report-modal__card").getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; })(),
    overflow: document.documentElement.scrollWidth - innerWidth }))()`);
  console.log("open", JSON.stringify(opened));
  gate("the pill opens the dialog and hands focus to the note", opened.hidden === false && opened.focus === "report-note", JSON.stringify(opened));
  gate("the card fits the frame it is in", opened.card.top >= 0 && opened.card.bottom <= 900 && opened.overflow <= 0, JSON.stringify(opened.card));
  await ev(`document.querySelector(".report__note").value = ""; document.querySelector(".report__note").dispatchEvent(new Event("input"))`);
  gate("Send waits for words", (await ev(`document.querySelector(".report__send").disabled`)) === true, "empty note");
  await ev(`(() => { const n = document.querySelector(".report__note");
    n.value = "The price on the flyer card is wrong."; n.dispatchEvent(new Event("input")); })()`);
  await sleep(200);
  gate("typing lets Send through", (await ev(`document.querySelector(".report__send").disabled`)) === false, "note typed");
  const wrapped = await ev(`(async () => {
    const f = Array.from(document.querySelectorAll(".report-modal__card a[href], .report-modal__card button:not([disabled]), .report-modal__card textarea, .report-modal__card input:not([type=hidden])"))
      .filter((n) => n.offsetParent !== null && !n.closest(".hp"));
    f[f.length - 1].focus();
    const before = document.activeElement.className;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
    return { last: before, after: document.activeElement.className, n: f.length }; })()`);
  gate("Tab cannot walk out of the dialog", wrapped.after !== wrapped.last, JSON.stringify(wrapped));
  await ev(`document.querySelector(".report__send").click()`);
  const settled = await until(`!!document.querySelector(".report-form").dataset.sent || !document.querySelector(".report__error").hidden`, 60);
  const sent = await ev(`(() => ({ calls: window.__pf.calls, sent: document.querySelector(".report-form").dataset.sent || "",
    errorOpen: !document.querySelector(".report__error").hidden, note: document.querySelector(".report__note").value,
    noteLocked: document.querySelector(".report__note").disabled, done: !document.querySelector(".form-success").hidden,
    busy: document.querySelector(".report-form").getAttribute("aria-busy"),
    page: (window.__pf.bodies[0] || {}).page, topic: (window.__pf.bodies[0] || {}).topic,
    article: (window.__pf.bodies[0] || {}).article, hp: (window.__pf.bodies[0] || {}).hasOwnProperty("_site") }))()`);
  console.log("sent", settled, JSON.stringify(sent));
  gate("the note reached the capture endpoint once", settled && sent.calls === 1, `calls=${sent.calls}`);
  if (DOOR === "ok") {
    gate("a accepted send locks the form and thanks the visitor", sent.sent === "1" && sent.done && sent.noteLocked, JSON.stringify(sent));
  } else {
    gate("a refused send keeps every word the visitor typed", sent.errorOpen && sent.note.length > 10 && !sent.sent, JSON.stringify({ errorOpen: sent.errorOpen, len: sent.note.length, sent: sent.sent }));
  }
  gate("the row says which page it came from, as an answer about the site", sent.page === `/${PAGE}` && sent.topic === "other" && sent.article === "site" && sent.hp === true, `${sent.page} ${sent.topic}/${sent.article}`);
  await shot("pill637-dialog", { x: 400, y: 40, width: 640, height: 820 });

  await ev(`document.querySelector(".report-modal__close").click()`);
  await until(`document.querySelector(".report-modal").hidden`);
  const closed = await ev(`({ hidden: document.querySelector(".report-modal").hidden,
    focus: document.activeElement.className, lock: document.body.classList.contains("report-open"),
    pad: document.body.style.paddingRight })`);
  gate("closing hands focus back to the pill and lifts the page lock", closed.hidden && /report-pill/.test(closed.focus) && !closed.lock && closed.pad === "", JSON.stringify(closed));
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await until(`!document.querySelector(".report-modal").hidden`);
  gate("the key opens it with the dialog shut", (await ev(`document.querySelector(".report-modal").hidden`)) === false, "cmd-alt-F");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))`);
  await until(`document.querySelector(".report-modal").hidden`);
  gate("Escape leaves the visitor back on the page", (await ev(`document.querySelector(".report-modal").hidden`)) === true, "escape");

  /* The shortcut is the one way in that does not need the corner, so it has to prove it does
     not stack two dialogs. Reloaded, the arrival card is up again and nothing has pressed it
     away; after the key there must be exactly one live tab ring, and the caret in the note. */
  await load(`${ORIGIN}/${PAGE}`);
  await until("!document.getElementById('home-promo').hidden");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await until(`!document.querySelector(".report-modal").hidden`);
  const stacked = await ev(`(() => ({ dialog: !document.querySelector(".report-modal").hidden,
    card: !document.getElementById("home-promo").hidden, focus: document.activeElement.id,
    pad: document.body.style.paddingRight, trap: (() => {
      const f = Array.from(document.querySelectorAll(".report-modal__card a[href], .report-modal__card button:not([disabled]), .report-modal__card textarea"))
        .filter((n) => n.offsetParent !== null);
      f[f.length - 1].focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      return document.activeElement.closest(".report-modal__card") ? "dialog" : document.activeElement.className;
    })() }))()`);
  console.log("key over the arrival card", JSON.stringify(stacked));
  gate("the key retires the arrival card instead of stacking on it", stacked.dialog && !stacked.card && stacked.focus === "report-note", JSON.stringify(stacked));
  gate("one dialog owns the tab order", stacked.trap === "dialog", `Tab landed on ${stacked.trap}`);
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))`);
  await until(`document.querySelector(".report-modal").hidden`);

  // ── phone ───────────────────────────────────────────────────────────────────
  await frame(390, 844, true);
  await load(`${ORIGIN}/${PAGE}`, 5200);
  const phone = await ev(FACTS);
  console.log("phone", JSON.stringify(phone));
  gate("the badge paints on the phone too", phone.hasPair && phone.pill.w === 44, `pill ${phone.pill.w}x${phone.pill.h}`);
  gate("a phone is not shown a key combination it cannot press", phone.keyShown === false, `key shown=${phone.keyShown}`);
  gate("the badge clears the phone's chat bubble", phone.pairOnBubble === false, `badge ${JSON.stringify(phone.pair)} bubble ${JSON.stringify(phone.bubble)}`);
  gate("the phone does not scroll sideways for the badge", phone.overflowX <= 0, `overflowX=${phone.overflowX}`);
  const armed = await armAsks();
  await sleep(900);
  const crowded = await ev(FACTS);
  console.log("crowded", JSON.stringify({ armed: armed, pair: crowded.pair, asks: crowded.askNames,
    onAsk: crowded.pairOnAsk, queueH: crowded.queueH }));
  gate("the fixture put both asks on the screen", armed.install && armed.cookie && crowded.askNames.length >= 2, JSON.stringify(crowded.askNames));
  gate("the badge still clears an install pill and a cookie notice", crowded.pairOnAsk === false,
    `badge ${JSON.stringify(crowded.pair)} asks ${JSON.stringify(crowded.askNames)} queueH=${crowded.queueH}`);
  await shot("pill637-phone", { x: 0, y: 560, width: 390, height: 284 });

  // ── a page with no assistant, a page one directory down, a page in Arabic ────
  await frame(1440, 900, false);
  await load(`${ORIGIN}/404.html`);
  const bare = await ev(FACTS);
  gate("404.html gets the pill but no action that opens nothing", bare.hasPair && bare.askTile === false, `pair=${bare.hasPair} ask=${bare.askTile}`);
  await load(`${ORIGIN}/gallery/flyer.html`);
  const deep = await ev(FACTS);
  gate("a page one directory down still points its help link at /help.html", deep.hasPair && deep.helpLink === "/help.html", `${deep.helpLink}`);
  await load(`${ORIGIN}/index.html?lang=ar`);
  const rtl = await ev(FACTS);
  gate("the badge is named in the visitor's language", rtl.dir === "rtl" && /مشكلة/.test(rtl.name) === true, `${rtl.dir} "${rtl.name}"`);
  await ev(`document.querySelector(".report-pill").click()`);
  await until(`!document.querySelector(".report-modal").hidden`);
  const rtlCard = await ev(`(() => { const b = document.querySelector(".report-modal__card").getBoundingClientRect();
    const s = getComputedStyle(document.querySelector(".report__send"));
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width),
             overflow: document.documentElement.scrollWidth - innerWidth,
             ml: s.marginLeft, mr: s.marginRight, note: document.querySelector(".report__note").placeholder.slice(0, 30) }; })()`);
  gate("the dialog lays out right to left without spilling", rtlCard.overflow <= 0 && rtlCard.top >= 0 && rtlCard.ml === "0px" && /px/.test(rtlCard.mr), JSON.stringify(rtlCard));
  console.log("rtl card", JSON.stringify(rtlCard));

  // ── pages that must stay bare ───────────────────────────────────────────────
  for (const p of ["offline.html", "haul.html"]) {
    await load(`${ORIGIN}/${p}`, 2600);
    const f = await ev(FACTS);
    gate(`${p} carries no pill it cannot dress`, f.hasPair === false, `pair=${f.hasPair}`);
  }

  const failed = rows.filter((r) => r[0] === "FAIL");
  console.log("\n── gates ─────────────────────────────────────────────");
  rows.forEach((r) => console.log(`${r[0]}  ${r[1]}  ·  ${r[2]}`));
  console.log(`\ndoor=${DOOR} page=${PAGE} — the stub proves the client's contract, never that a row landed in public.feedback.`);
  console.log(failed.length ? `${failed.length} GATE(S) FAILED` : "all gates clean");
  chrome.kill();
  await sleep(250);
  rmSync(profile, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("RIG ERROR:", e.message); process.exit(2); });
