/*
  #638 — the feedback mark on a page that wears no stylesheet.

  haul.html deliberately links none of the site's CSS, so the pill and its dialog are dressed
  by a block inside the page's own <style>. Markup alone cannot show whether that block works:
  an undressed pill still exists in the DOM, still answers a click, and still fails to hide the
  file picker and the honeypot. So this rig reads painted facts out of a real Blink frame.

    node tools/pill638.mjs [--door=ok|fail] [--keep-fixtures]

  Three arms exist because three failures were plausible:
    · the dressing arm, which only makes sense on a page with no external stylesheet at all;
    · the veil arm, because this page opens behind the lights.js takeover, where a dialog the
      shortcut summons would sit UNDER a screen the visitor is still looking at;
    · the naked control, which loads the same page with the style block cut out and must score
      the paint gates as failures. Without it, every "dressed" gate below could be passing on
      a page that has no CSS, and a green run would certify nothing.

  The capture door is stubbed in every arm, so a rig run never files a row in public.feedback
  and never puts a picture in the owner's inbox. The stub proves the client's contract only.
*/
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const DOOR = flag("door", "ok");
const KEEP = argv.includes("--keep-fixtures");
const ORIGIN = "http://127.0.0.1:8123";
const PAGE = "haul.html";
// A throwaway copy of the page with the feedback style block removed. Same DOM, same script,
// none of the dressing: the control that shows each paint gate can actually fail.
const NAKED = ".rig638-naked.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let veilScript = null;

const SEED = `(() => {
  window.__pf = { calls: 0, door: "__DOOR__", bodies: [], errors: [] };
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf("formsubmit.co") > -1) return Promise.resolve(new Response('{"ok":true}',
      { status: 200, headers: { "content-type": "application/json" } }));
    if (url.indexOf("/capture/feedback") > -1) {
      window.__pf.calls++;
      try { window.__pf.bodies.push(JSON.parse(init.body)); } catch (e) { window.__pf.bodies.push(null); }
      if (window.__pf.door === "fail") return Promise.resolve(new Response("{}", { status: 500 }));
      return Promise.resolve(new Response('{"ok":true}', { status: 200,
        headers: { "content-type": "application/json" } }));
    }
    return real.apply(this, arguments);
  };
  const cl = window.console;
  window.addEventListener("error", (e) => {
    window.__pf.errors.push("uncaught: " + (e.message || "") + " @" + String(e.filename || "").split("/").pop());
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__pf.errors.push("rejected: " + String((e.reason && e.reason.message) || e.reason).slice(0, 120));
  });
  ["error", "warn"].forEach((k) => { const f = cl[k]; cl[k] = function () {
    window.__pf.errors.push(k + ": " + Array.prototype.join.call(arguments, " ").slice(0, 160));
    return f.apply(this, arguments); }; });
})();`.replace("__DOOR__", DOOR);

/* One probe, all measurements. rgba()/color parsing is done here rather than trusted from
   markup: the only question worth asking is what the engine computed after the cascade. */
const PAINT = `(() => {
  const cs = (n, p) => (n ? getComputedStyle(n)[p] : null);
  const box = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.top), top: Math.round(b.top), bottom: Math.round(b.bottom),
      w: Math.round(b.width), h: Math.round(b.height) }; };
  const rgba = (s) => {
    const m = String(s || "").match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    if (!top || !bottom) return bottom;
    const a = top.a + bottom.a * (1 - top.a);
    const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / (a || 1);
    return { r: mix("r"), g: mix("g"), b: mix("b"), a: a };
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (x, y) => { const a = lum(x), b = lum(y);
    return +(((a > b ? a + 0.05 : b + 0.05) / (a > b ? b + 0.05 : a + 0.05)).toFixed(2)); };
  const ownerAt = (x, y) => { const n = document.elementFromPoint(x, y);
    return n ? (n.className || n.tagName) : null; };
  const contains = (sel, node) => { const n = document.querySelector(sel);
    return !!(node && n && (node === n || n.contains(node))); };

  const pair = document.querySelector(".report-pair");
  const pill = document.querySelector(".report-pill");
  const mark = document.querySelector(".report-pill__mark");
  const modal = document.querySelector(".report-modal");
  const card = document.querySelector(".report-modal__card");
  const scrim = document.querySelector(".report-modal__scrim");
  const key = document.querySelector(".report-modal__key");
  const note = document.getElementById("report-note");
  const header = document.querySelector("header");
  const hp = Array.from(document.querySelectorAll(".hp")).map((n) => {
    const b = box(n);
    return { sel: n.id || n.tagName, op: cs(n, "opacity"), clip: cs(n, "clipPath"),
      pe: cs(n, "pointerEvents"), box: b, at: b ? ownerAt(b.x + b.w / 2, b.y + b.h / 2) : null };
  });
  const pillBox = box(pill);
  const cx = pillBox ? pillBox.x + Math.round(pillBox.w / 2) : 0;
  const cy = pillBox ? pillBox.y + Math.round(pillBox.h / 2) : 0;
  const page = rgba(cs(document.body, "backgroundColor"));
  const fill = over(rgba(cs(card, "backgroundColor")), over(rgba(cs(scrim, "backgroundColor")), page));
  const open = !!modal && !modal.hidden;
  return {
    theme: document.documentElement.getAttribute("data-theme"),
    lang: document.documentElement.lang, dir: document.documentElement.dir,
    sheets: Array.from(document.styleSheets).map((s) => s.href).filter(Boolean),
    hasPair: !!pair, pair: box(pair), pill: pillBox,
    mark: mark ? mark.textContent : null, name: pill ? pill.getAttribute("aria-label") : null,
    pillCss: pill ? { w: pillBox.w, h: pillBox.h, radius: cs(pill, "borderRadius"),
      blur: /blur\\(/.test(cs(pill, "backdropFilter") || cs(pill, "-webkit-backdrop-filter") || ""),
      shadow: cs(pill, "boxShadow") !== "none", fill: rgba(cs(pill, "backgroundColor")) } : null,
    hitPill: pillBox ? contains(".report-pill", document.elementFromPoint(cx, cy)) : false,
    hitOwner: ownerAt(cx, cy),
    headerZ: header ? cs(header, "zIndex") : null, pairZ: pair ? cs(pair, "zIndex") : null,
    modalDisplay: modal ? cs(modal, "display") : null,
    modalHidden: modal ? modal.hidden : null,
    keyShown: key ? cs(key, "display") !== "none" : null,
    helpLink: (() => { const a = document.querySelector("a.report__help");
      return a ? new URL(a.getAttribute("href"), document.baseURI).pathname : null; })(),
    askTile: !!document.querySelector(".report__ask"),
    hp,
    card: card ? { pos: cs(card, "position"), w: box(card).w, h: box(card).h,
      top: box(card).top, bottom: box(card).bottom, radius: cs(card, "borderRadius"),
      pad: cs(card, "paddingTop"), blur: /blur\\(/.test(cs(card, "backdropFilter") || cs(card, "-webkit-backdrop-filter") || ""),
      alpha: (rgba(cs(card, "backgroundColor")) || {}).a,
      scrimAlpha: (rgba(cs(scrim, "backgroundColor")) || {}).a,
      ink: cs(note, "color"), contrast: note && fill ? ratio(rgba(cs(note, "color")), fill) : null } : null,
    locked: document.body.classList.contains("report-open"),
    bodyOverflow: cs(document.body, "overflow"),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
    sendDisabled: (document.querySelector(".report__send") || {}).disabled,
    veil: (() => { const v = document.getElementById("light-overlay");
      if (!v) return null;
      const b = box(v); const mid = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      return { box: b, ownsCentre: !!(mid && mid.closest && mid.closest('[aria-modal="true"]')),
        modal: modal && !modal.hidden,
        dialogOnTop: modal && !modal.hidden ? contains(".report-modal",
          document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))) : null }; })(),
    overflowX: document.documentElement.scrollWidth - innerWidth,
    overflowY: document.documentElement.scrollHeight - innerHeight,
    errors: window.__pf.errors.slice(0, 5),
    calls: window.__pf.calls,
  };
})()`;

async function main() {
  /* The control fixture is built from the real page so it can never drift away from it. */
  const source = readFileSync(join(process.cwd(), PAGE), "utf8");
  const cut = source.indexOf("/* ── feedback mark ──");
  const end = source.indexOf("</style>");
  if (cut < 0 || end < cut) throw new Error("the feedback block moved; the control cannot be built");
  writeFileSync(join(process.cwd(), NAKED), source.slice(0, cut) + source.slice(end));

  const profile = mkdtempSync(join(tmpdir(), "bh-pill638-"));
  /* Any free port, read back out of OUR profile directory: a fixed port lets a leftover browser
     from an earlier run answer, and that browser carries its own stored language and consent. */
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--headless=new",
    "--no-first-run", "--disable-extensions", "--disable-sync", "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  let PORT = 0;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { PORT = Number(readFileSync(portFile, "utf8").split("\n")[0].trim()); if (PORT) break; } catch (e) { /* not yet */ }
  }
  const cleanup = () => {
    try { chrome.kill(); } catch (e) { /* gone */ }
    if (!KEEP) { try { unlinkSync(join(process.cwd(), NAKED)); } catch (e) { /* never written */ } }
  };
  process.on("exit", cleanup);
  if (!PORT) { cleanup(); throw new Error("chrome never published a debugging port"); }
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
  /* The macOS truth: Option+F arrives as key "ƒ", never "f", so the chord goes through Chrome's
     own input layer and the page receives what a finger produces. Alt=1, Ctrl=2, Meta=4. */
  const typeKey = async (key, code, win, mac, modifiers) => {
    const legs = [{ type: "rawKeyDown", key, code, windowsVirtualKeyCode: win, nativeVirtualKeyCode: mac, modifiers }];
    if (key.length === 1) legs.push({ type: "keyDown", key, code, text: key, unmodifiedText: key,
      windowsVirtualKeyCode: win, nativeVirtualKeyCode: mac, modifiers });
    legs.push({ type: "keyUp", key, code, windowsVirtualKeyCode: win, nativeVirtualKeyCode: mac, modifiers });
    for (const leg of legs) await send("Input.dispatchKeyEvent", leg);
  };
  const optionF = () => typeKey("ƒ", "KeyF", 70, 3, 1 | 4);
  const escape = () => typeKey("Escape", "Escape", 27, 53, 0);
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const hit = list.find((p) => p.type === "page");
      if (hit) { ws = new WebSocket(hit.webSocketDebuggerUrl); break; }
    } catch (e) { /* still booting */ }
  }
  if (!ws) { cleanup(); throw new Error("no CDP page target"); }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const w = pending.get(m.id); pending.delete(m.id);
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
  };
  await new Promise((res) => { ws.onopen = res; });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });

  const frame = async (width, height, mobile) => {
    await send("Emulation.setTouchEmulationEnabled", mobile
      ? { enabled: true, maxTouchPoints: 5 } : { enabled: false, maxTouchPoints: 1 });
    await send("Emulation.setDeviceMetricsOverride", { width, height,
      deviceScaleFactor: mobile ? 3 : 2, mobile: !!mobile });
  };
  const load = async (url, settle) => { await send("Page.navigate", { url }); await sleep(settle || 4200); };
  const until = async (expr, limit) => {
    for (let i = 0; i < (limit || 40); i++) { if (await ev(expr)) return true; await sleep(150); }
    return false;
  };
  const press = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1,
        buttons: type === "mousePressed" ? 1 : 0 });
    }
  };
  const shot = async (name, clip) => {
    const out = await send("Page.captureScreenshot", { format: "png", clip: Object.assign({ scale: 2 }, clip) });
    writeFileSync(`/tmp/${name}.png`, Buffer.from(out.data, "base64"));
  };
  const rows = [];
  const gate = (name, ok, fact) => { rows.push([ok ? "PASS" : "FAIL", name, fact]); return ok; };

  // ── desk: the mark paints, and paints as the studio's own glass ──────────────
  await frame(1440, 900, false);
  await load(`${ORIGIN}/${PAGE}`);
  await until("!!document.querySelector('.report-pair')");
  const desk = await ev(PAINT);
  console.log("desk", JSON.stringify(desk));
  /* If an external sheet were linked, every dressed fact below could be credited to
     css/style.min.css instead of the page. On this page there must be none. */
  gate("the page dressed its own dialog, with no stylesheet linked", desk.sheets.length === 0,
    `external sheets: ${JSON.stringify(desk.sheets)}`);
  gate("the mark is one round 44px button named in words", desk.hasPair && desk.pillCss &&
    desk.pillCss.w === 44 && desk.pillCss.h === 44 && desk.mark === "?" && /feedback|مشكلة/.test(desk.name || ""),
    `${desk.pillCss && desk.pillCss.w}x${desk.pillCss && desk.pillCss.h} radius=${desk.pillCss && desk.pillCss.radius} "${desk.name}"`);
  gate("the mark is glass, not a flat dot", desk.pillCss && desk.pillCss.blur &&
    desk.pillCss.shadow && desk.pillCss.fill && desk.pillCss.fill.a > 0 && desk.pillCss.fill.a < 1,
    JSON.stringify({ blur: desk.pillCss && desk.pillCss.blur, shadow: desk.pillCss && desk.pillCss.shadow,
      fill: desk.pillCss && desk.pillCss.fill }));
  /* The pointer test, not the number: a sticky header, a light overlay or a stray fixed layer
     all clear a z-index reading and still swallow the click. */
  gate("the mark answers where it is painted", desk.hitPill === true, `elementFromPoint → ${desk.hitOwner}`);
  gate("the closed dialog is genuinely gone, not a grid over the page",
    desk.modalHidden === true && desk.modalDisplay === "none",
    `hidden=${desk.modalHidden} display=${desk.modalDisplay}`);
  gate("the hidden picker and the honeypot are present but painted nowhere", desk.hp.length >= 2 &&
    desk.hp.every((n) => Number(n.op) === 0 && n.box.w <= 1 && n.box.h <= 1 && n.pe === "none" &&
      !/hp|report-shots/i.test(String(n.at))), JSON.stringify(desk.hp.map((n) => [n.sel, n.op, n.box.w, n.box.h, n.pe, String(n.at).slice(0, 24)])));
  gate("the desk frame is shown the printed key", desk.keyShown === true, `key display shown=${desk.keyShown}`);
  gate("the help centre is one click inside the dialog", desk.helpLink === "/help.html", String(desk.helpLink));
  gate("a page with no assistant offers no assistant", desk.askTile === false, `askTile=${desk.askTile}`);
  gate("nothing spilled sideways or down", desk.overflowX <= 0, `overflowX=${desk.overflowX}`);
  gate("the page console stayed clean", desk.errors.length === 0, JSON.stringify(desk.errors));
  await shot("pill638-desk", { x: 1000, y: 600, width: 440, height: 300 });

  // ── open by hand ────────────────────────────────────────────────────────────
  await press(desk.pill.x + Math.round(desk.pill.w / 2), desk.pill.y + Math.round(desk.pill.h / 2));
  const openedOk = await until("!document.querySelector('.report-modal').hidden");
  const openF = await ev(PAINT);
  console.log("open", JSON.stringify(openF.card));
  gate("a press on the mark opens it", openedOk && openF.modalHidden === false, `hidden=${openF.modalHidden}`);
  gate("the words sit on a card, not on the scrim", openF.card && openF.card.pos === "relative" &&
    openF.card.alpha > 0 && openF.card.alpha < 1 && openF.card.blur && openF.card.scrimAlpha > 0 &&
    Number.parseInt(openF.card.radius, 10) > 0 && Number.parseInt(openF.card.pad, 10) >= 16,
    JSON.stringify(openF.card));
  gate("the card fits the frame it opens in", openF.card && openF.card.top >= 0 &&
    openF.card.bottom <= 900 && openF.card.w > 300 && openF.overflowX <= 0, JSON.stringify(openF.card));
  gate("the caret lands in the note and the page stops scrolling behind it",
    openF.focus === "report-note" && openF.locked && openF.bodyOverflow === "hidden",
    `focus=${openF.focus} lock=${openF.locked} overflow=${openF.bodyOverflow}`);
  await ev(`document.querySelector(".report__note").value="";document.querySelector(".report__note").dispatchEvent(new Event("input",{bubbles:true}))`);
  gate("Send waits for words", (await ev(`document.querySelector(".report__send").disabled`)) === true, "empty note");
  await ev(`(() => { const n = document.querySelector(".report__note");
    n.value = "The pickup window on the Luggage page reads wrong."; n.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(200);
  gate("typing lets Send through", (await ev(`document.querySelector(".report__send").disabled`)) === false, "note typed");
  const wrapped = await ev(`(async () => {
    const f = Array.from(document.querySelectorAll(".report-modal__card a[href], .report-modal__card button:not([disabled]), .report-modal__card textarea, .report-modal__card input:not([type=hidden])"))
      .filter((n) => n.offsetParent !== null && !n.closest(".hp"));
    if (!f.length) return { last: "nothing focusable", after: "nothing focusable", n: 0 };
    f[f.length - 1].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 120));
    return { last: f[f.length - 1].className, after: document.activeElement.className, n: f.length }; })()`);
  gate("Tab cannot walk out of the dialog", wrapped.n > 3 && wrapped.after !== wrapped.last, JSON.stringify(wrapped));
  await shot("pill638-dialog", { x: 400, y: 30, width: 640, height: 840 });

  // ── send, against the stubbed door ──────────────────────────────────────────
  await ev(`document.querySelector(".report__send").click()`);
  const settled = await until(`!!document.querySelector(".report-form").dataset.sent || !document.querySelector(".report__error").hidden`, 60);
  const sent = await ev(`(() => ({ calls: window.__pf.calls, sent: document.querySelector(".report-form").dataset.sent || "",
    done: !document.querySelector(".form-success").hidden, errorOpen: !document.querySelector(".report__error").hidden,
    note: document.querySelector(".report__note").value,
    page: (window.__pf.bodies[0] || {}).page, topic: (window.__pf.bodies[0] || {}).topic,
    article: (window.__pf.bodies[0] || {}).article, hp: (window.__pf.bodies[0] || {}).hasOwnProperty("_site") }))()`);
  console.log("sent", settled, JSON.stringify(sent));
  gate("the note reached the capture endpoint once", settled && sent.calls === 1, `calls=${sent.calls}`);
  gate("the row names this page, as an answer about the site",
    sent.page === `/${PAGE}` && sent.topic === "other" && sent.article === "site" && sent.hp === true,
    `${sent.page} ${sent.topic}/${sent.article} hp=${sent.hp}`);
  if (DOOR === "ok") {
    gate("an accepted send thanks the visitor", sent.sent === "1" && sent.done, JSON.stringify(sent));
  } else {
    gate("a refused send keeps every word the visitor typed", sent.errorOpen && sent.note.length > 10 && !sent.sent,
      JSON.stringify({ errorOpen: sent.errorOpen, len: sent.note.length, sent: sent.sent }));
  }

  // ── the key, typed the way a Mac types it ───────────────────────────────────
  await ev(`document.querySelector(".report-modal__close").click()`);
  await until("document.querySelector('.report-modal').hidden");
  const closed = await ev(`({ hidden: document.querySelector(".report-modal").hidden,
    focus: document.activeElement.className, lock: document.body.classList.contains("report-open"),
    pad: document.body.style.paddingRight })`);
  gate("closing hands focus back to the mark and lifts the page lock",
    closed.hidden && /report-pill/.test(closed.focus) && !closed.lock && closed.pad === "", JSON.stringify(closed));
  await optionF();
  const byKey = await until("!document.querySelector('.report-modal').hidden");
  gate("⌘⌥F opens it with the dialog shut", byKey === true, "input layer sent key=ƒ code=KeyF meta+alt");
  await escape();
  await until("document.querySelector('.report-modal').hidden");
  gate("Escape leaves the visitor back on the page",
    (await ev("document.querySelector('.report-modal').hidden")) === true, "escape");
  await typeKey("f", "KeyF", 70, 3, 0);
  gate("the bare letter never opens a dialog nobody asked for",
    (await ev("document.querySelector('.report-modal').hidden")) === true, "plain f opened it");
  await typeKey("f", "KeyF", 70, 3, 1 | 2);
  const byCtrl = await until("!document.querySelector('.report-modal').hidden");
  gate("Ctrl+Alt+F opens it where there is no Option key", byCtrl === true, "ctrl+alt+f");
  await escape();
  await until("document.querySelector('.report-modal').hidden");

  /* Where the dialog would appear is measured, not assumed: the card's own centre has to answer
     the pointer, or the visitor is typing into a dialog sitting under something else. */
  const midAt = `(() => { const n = document.elementFromPoint(Math.round(innerWidth/2), Math.round(innerHeight/2));
    return n && n.closest(".report-modal") ? "dialog" : (n ? String(n.className || n.tagName) : null); })()`;

  // ── the lights veil: this page's own boot takeover ──────────────────────────
  /* lights.js returns early for a machine (navigator.webdriver, or a HeadlessChrome UA), so the
     default arms never see the veil at all. This arm hands the page a person's UA and an idle
     session, which is exactly what a first visit to haul.html is. */
  await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    `Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
     try { sessionStorage.clear(); } catch (e) {}` }).then((r) => { veilScript = r.identifier; });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await load(`${ORIGIN}/${PAGE}`, 3000);
  const veilUp = await until("!!document.getElementById('light-overlay')", 40);
  const veiled = await ev(PAINT);
  console.log("veil", JSON.stringify(veiled.veil));
  gate("the veil arm really stood the takeover up", veilUp && veiled.veil && veiled.veil.ownsCentre,
    JSON.stringify(veiled.veil));
  await optionF();
  await sleep(600);
  const during = await ev(PAINT);
  console.log("during", JSON.stringify({ veil: during.veil, hidden: during.modalHidden, focus: during.focus }));
  /* The wanted answer is not "it opened on top of the veil" — it is "it left the visitor
     exactly where they were". Both halves are asserted, because a dialog that refuses to open
     and still steals the caret is the same broken keyboard in a different costume. */
  gate("the key waits while a takeover owns the screen",
    during.modalHidden === true && during.veil && during.veil.ownsCentre === true,
    `hidden=${during.modalHidden} centre=${during.veil && during.veil.dialogOnTop ? "dialog" : "the veil"}`);
  gate("the caret stayed with the takeover that owns the screen",
    /light/.test(String(during.focus)), `focus=${during.focus}`);
  await ev(`document.querySelector(".light-overlay__btn").click()`);
  const lifted = await until("!document.getElementById('light-overlay')", 60);
  await optionF();
  const afterVeil = await until("!document.querySelector('.report-modal').hidden", 30);
  const lit = await ev(PAINT);
  console.log("lit", JSON.stringify({ lifted: lifted, centre: await ev(midAt) }));
  gate("once the room is lit, the key works", lifted && afterVeil === true && (await ev(midAt)) === "dialog",
    `lifted=${lifted} opened=${afterVeil} centre=${await ev(midAt)}`);
  await escape();
  await until("document.querySelector('.report-modal').hidden");
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: veilScript });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36" });

  // ── phone ───────────────────────────────────────────────────────────────────
  await frame(390, 844, true);
  await load(`${ORIGIN}/${PAGE}`, 5200);
  const phone = await ev(PAINT);
  console.log("phone", JSON.stringify({ pill: phone.pill, key: phone.keyShown, hit: phone.hitPill, ox: phone.overflowX }));
  gate("the mark paints on the phone too", phone.hasPair && phone.pillCss && phone.pillCss.w === 44,
    `pill ${phone.pillCss && phone.pillCss.w}x${phone.pillCss && phone.pillCss.h}`);
  gate("a phone is not shown a key combination it cannot press", phone.keyShown === false, `shown=${phone.keyShown}`);
  gate("the thumb reaches it", phone.hitPill === true, `elementFromPoint → ${phone.hitOwner}`);
  gate("the phone does not scroll sideways for the mark", phone.overflowX <= 0, `overflowX=${phone.overflowX}`);
  const phoneHp = phone.hp;
  gate("the hidden controls stay hidden on the phone", phoneHp.length >= 2 &&
    phoneHp.every((n) => Number(n.op) === 0 && n.box.w <= 1), JSON.stringify(phoneHp.map((n) => [n.sel, n.op, n.box.w])));
  await ev(`document.querySelector(".report-pill").click()`);
  await until("!document.querySelector('.report-modal').hidden");
  const phoneOpen = await ev(PAINT);
  gate("the phone dialog fits its screen and its card is a card", phoneOpen.card &&
    phoneOpen.card.top >= 0 && phoneOpen.card.bottom <= 844 && phoneOpen.card.alpha > 0 &&
    phoneOpen.overflowX <= 0, JSON.stringify(phoneOpen.card));
  await shot("pill638-phone", { x: 0, y: 0, width: 390, height: 844 });
  await ev(`document.querySelector(".report-modal__close").click()`);

  // ── light theme: no dark plate under light-ink words, and no dark words on a white plate ──
  await frame(1440, 900, false);
  await load(`${ORIGIN}/${PAGE}`, 4200);
  await ev(`document.documentElement.setAttribute("data-theme","light")`);
  await ev(`document.querySelector(".report-pill").click()`);
  await until("!document.querySelector('.report-modal').hidden");
  const light = await ev(PAINT);
  console.log("light", JSON.stringify({ card: light.card, pill: light.pillCss }));
  gate("the light plate is a light plate", light.theme === "light" && light.card &&
    light.card.alpha >= 0.5, JSON.stringify({ alpha: light.card && light.card.alpha }));
  gate("the note is readable on it", light.card && light.card.contrast >= 4.5,
    `contrast ${light.card && light.card.contrast} (${light.card && light.card.ink})`);
  gate("the mark still reads on the light page", light.pillCss && light.pillCss.blur &&
    light.pillCss.fill && light.pillCss.fill.a > 0, JSON.stringify(light.pillCss));
  await ev(`document.querySelector(".report-modal__close").click()`);

  // ── Arabic ──────────────────────────────────────────────────────────────────
  await load(`${ORIGIN}/${PAGE}?lang=ar`, 4600);
  const rtl = await ev(PAINT);
  gate("the mark is named in the visitor's language", rtl.dir === "rtl" && /مشكلة/.test(rtl.name || ""),
    `${rtl.dir} "${rtl.name}"`);
  await ev(`document.querySelector(".report-pill").click()`);
  await until("!document.querySelector('.report-modal').hidden");
  const rtlCard = await ev(`(() => { const b = document.querySelector(".report-modal__card").getBoundingClientRect();
    const s = getComputedStyle(document.querySelector(".report__send"));
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), overflow: document.documentElement.scrollWidth - innerWidth,
      ml: s.marginLeft, mr: s.marginRight }; })()`);
  const rtlPaint = await ev(PAINT);
  gate("the Arabic dialog really opened before it was measured", rtlPaint.modalHidden === false,
    `hidden=${rtlPaint.modalHidden}`);
  gate("the dialog lays out right to left without spilling",
    rtlCard.overflow <= 0 && rtlCard.top >= 0 && rtlCard.ml === "0px" && /px/.test(rtlCard.mr), JSON.stringify(rtlCard));
  gate("Arabic keeps the mark reachable", rtl.hitPill === true, `elementFromPoint → ${rtl.hitOwner}`);
  console.log("rtl card", JSON.stringify(rtlCard));

  // ── the naked control: every paint gate above must be able to fail ──────────
  await load(`${ORIGIN}/${NAKED}`, 4200);
  await until("!!document.querySelector('.report-pair')");
  await ev(`document.querySelector(".report-pill").click()`);
  await until("!document.querySelector('.report-modal').hidden");
  const naked = await ev(PAINT);
  console.log("naked", JSON.stringify({ pill: naked.pillCss, card: naked.card, hp: naked.hp.map((n) => [n.sel, n.op, n.box.w]) }));
  const nakedRound = naked.pillCss && naked.pillCss.w === 44 && naked.pillCss.h === 44;
  const nakedHidden = naked.hp.length >= 2 && naked.hp.every((n) => Number(n.op) === 0 && n.box.w <= 1);
  const nakedCard = naked.card && naked.card.alpha > 0 && Number.parseInt(naked.card.radius, 10) > 0 &&
    Number.parseInt(naked.card.pad, 10) >= 16;
  gate("the control proves the size gate can fail", nakedRound === false,
    `undressed pill measured ${naked.pillCss && naked.pillCss.w}x${naked.pillCss && naked.pillCss.h}`);
  gate("the control proves the hidden-control gate can fail", nakedHidden === false,
    `undressed hidden nodes: ${JSON.stringify(naked.hp.map((n) => [n.sel, n.op, n.box.w]))}`);
  gate("the control proves the card gate can fail", nakedCard === false,
    `undressed card: radius=${naked.card && naked.card.radius} pad=${naked.card && naked.card.pad} alpha=${naked.card && naked.card.alpha}`);
  if (!KEEP) { try { unlinkSync(join(process.cwd(), NAKED)); } catch (e) { /* already gone */ } }

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

main().catch((e) => {
  try { unlinkSync(join(process.cwd(), NAKED)); } catch (err) { /* never written */ }
  console.error("RIG ERROR:", e.message);
  process.exit(2);
});
