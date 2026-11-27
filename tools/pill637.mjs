/*
  #637 — the problem-feedback pill, proven where it actually hangs.

  A pill bolted to 54 pages is only worth shipping if, on each of the shapes a visitor
  brings, it (a) paints, (b) does not sit on top of the chat bubble or the bottom asks,
  (c) opens and closes by hand and by key, and (d) can get its note to the studio under
  the page's own CSP. None of that is readable from markup, so this rig drives a real
  Blink frame and prints measured facts.

    node tools/pill637.mjs [--door=ok|fail] [--shots=ok|fail] [--page=index.html|404.html|blog/index.html|gallery/flyer.html]

  The door is stubbed in every arm: `--door=fail` cannot be paid for with a real row, and
  a real row from this rig would be a lie in the owner's feedback table. What the stub can
  and cannot prove is printed with each run.

  `--shots=fail` refuses the mail rail the same way, so the "your words arrived, the
  pictures did not" copy is observable without putting a screenshot in the owner's inbox.
  Every formsubmit.co call is answered inside the page; the numbers the arms read are the
  stub's counters.
*/
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const DOOR = flag("door", "ok");
const SHOTS = flag("shots", "ok");
const PAGE = flag("page", "index.html");
const ORIGIN = `http://127.0.0.1:8123`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = `(() => {
  window.__pf = { calls: 0, door: "__DOOR__", shots: "__SHOTS__", bodies: [], mails: [], mail: 0 };
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    /* The screenshots ride the mail rail, and a rig run must never put a picture in the
       owner's inbox. Everything aimed at formsubmit.co is caught here, and the fields are
       read back so the arms prove one POST per picture rather than trust it. */
    if (url.indexOf("formsubmit.co") > -1) {
      window.__pf.mail++;
      const rec = { url: url, keys: [], subject: null, name: null, bytes: 0,
        answer: window.__pf.shots === "fail" ? 500 : 200 };
      try {
        const fd = init && init.body;
        if (fd && typeof fd.entries === "function") {
          for (const pair of fd.entries()) {
            rec.keys.push(pair[0]);
            if (pair[0] === "_subject") rec.subject = pair[1];
            if (pair[0] === "picture") { rec.name = pair[1].name; rec.bytes = pair[1].size; }
          }
        }
      } catch (e) { rec.error = String(e).slice(0, 80); }
      window.__pf.mails.push(rec);
      /* --shots=fail has to reach the page or the arm tests a rail that never refused:
         without this substitution the stub answers 200 in both modes and the retry and the
         "your words arrived, the pictures did not" copy are certified by a flow that ran
         the success path twice. */
      if (window.__pf.shots === "fail") {
        return Promise.resolve(new Response("{}", { status: 500 }));
      }
      return Promise.resolve(new Response('{"ok":true}', { status: 200,
        headers: { "content-type": "application/json" } }));
    }
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
  // console.error alone misses a script that throws: promo.js going quiet was invisible
  // until the page itself was asked to report an uncaught error.
  window.addEventListener("error", (e) => {
    window.__pf.errors.push("uncaught: " + (e.message || "") + " @" + String(e.filename || "").split("/").pop());
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__pf.errors.push("rejected: " + String((e.reason && e.reason.message) || e.reason).slice(0, 120));
  });
  ["error", "warn"].forEach((k) => { const f = cl[k]; cl[k] = function () {
    window.__pf.errors.push(k + ": " + Array.prototype.join.call(arguments, " ").slice(0, 160));
    return f.apply(this, arguments); }; });
})();`.replace("__DOOR__", DOOR).replace("__SHOTS__", SHOTS);

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
  /* Ask Chrome for any free debugging port and read it back out of OUR profile directory.
     A fixed port is a trap: if a browser from an earlier run is still holding it, the new
     Chrome cannot bind, the rig attaches to the leftover one, and every page it measures
     carries that profile's stored language and consent — which is how a run came up fluent
     in Arabic without any arm asking for Arabic. */
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--headless=new",
    "--no-first-run", "--disable-extensions", "--disable-sync", "about:blank",
  ], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  let PORT = 0;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { PORT = Number(readFileSync(portFile, "utf8").split("\n")[0].trim()); if (PORT) break; } catch (e) { /* not written yet */ }
  }
  if (!PORT) { chrome.kill(); throw new Error("chrome never published a debugging port"); }
  // An aborted run must not leave a browser standing: a survivor is precisely what a later
  // run would attach to and certify against the wrong profile.
  process.on("exit", () => { try { chrome.kill(); } catch (e) { /* already gone */ } });
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
  /* Holding Option on a Mac changes what the page is told: Option+F arrives as the glyph
     "ƒ", and only the physical position still reads KeyF. The old arm fabricated
     new KeyboardEvent({ key: "f", altKey: true }) — a shape no macOS browser ever
     produces — and that is exactly how a shortcut nobody could press passed review.
     These go through Chrome's own input layer, so the page receives the bytes a finger
     on the keyboard would give it. Modifiers: Alt=1, Ctrl=2, Meta(Command)=4. */
  // One faithful keydown then its keyup. `text` is only legal for a single character —
  // CDP answers a multi-char one with "Invalid 'text' parameter" — so a named key like
  // Escape travels as a bare rawKeyDown, which is exactly the shape a real one has.
  const typeKey = async (key, code, win, mac, modifiers) => {
    const legs = [{ type: "rawKeyDown", key, code, windowsVirtualKeyCode: win,
      nativeVirtualKeyCode: mac, modifiers }];
    if (key.length === 1) legs.push({ type: "keyDown", key, code, text: key,
      unmodifiedText: key, windowsVirtualKeyCode: win, nativeVirtualKeyCode: mac, modifiers });
    legs.push({ type: "keyUp", key, code, windowsVirtualKeyCode: win,
      nativeVirtualKeyCode: mac, modifiers });
    for (const leg of legs) await send("Input.dispatchKeyEvent", leg);
  };
  // Option+F on a Mac types "ƒ": modifiers are Alt=1, Ctrl=2, Meta=4.
  const optionF = (mods) => typeKey("ƒ", "KeyF", 70, 3, mods === undefined ? 1 | 4 : mods);
  const escape = () => typeKey("Escape", "Escape", 27, 53, 0);
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
    /* js/cookies.js builds the notice at opacity:0 / translateY(110%) and only adds is-in
       when it stands. A fixture without that class paints below the viewport, so the badge
       would be measured against a bar no visitor ever sees. */
    c.className = "cookie-notice is-in";
    const inner = document.createElement("div"); inner.className = "cookie-notice__inner";
    const cp = document.createElement("p"); cp.className = "cookie-notice__text";
    cp.textContent = "This site keeps your own settings and your chat with our assistant in your browser.";
    const btns = document.createElement("div"); btns.className = "cookie-notice__btns";
    for (const t of ["Accept all", "Reject non-essential", "Cookie preferences"]) {
      const b = document.createElement("button"); b.className = "btn btn--primary btn--sm";
      b.type = "button"; b.textContent = t; btns.appendChild(b);
    }
    inner.append(cp, btns);
    c.appendChild(inner);
    document.body.appendChild(c);
    return { install: !!document.querySelector(".install"),
      cookie: !!document.querySelector(".cookie-notice.is-in") };
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
  const cardUp = await until("!document.getElementById('home-promo').hidden", 80);
  const corner = await ev(`(() => { const box = document.getElementById("home-promo");
    const b = document.querySelector(".report-pair").getBoundingClientRect();
    const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { card: box ? !box.hidden : null, top: t ? t.className : null }; })()`);
  gate("the arrival card owns the corner while it is up", cardUp && corner.card === true && /promo__backdrop/.test(corner.top), JSON.stringify(corner));
  const cx = desk.pill.x + Math.round(desk.pill.w / 2), cy = desk.pill.y + Math.round(desk.pill.h / 2);
  if (cardUp) {
    await press(cx, cy);
    gate("a press on the dim takes the studio's offer down", await until("document.getElementById('home-promo').hidden"), "backdrop press");
  } else {
    gate("a press on the dim takes the studio's offer down", false, "the card never rose, so there was no dim to press");
  }
  /* Press by measurement, not by counting. The card does not always arrive inside the settle
     window, and when it does not, the first press below is the one that opens the dialog — a
     scripted second press then lands on the open dialog's own dim and shuts it again, which is
     how this arm once reported a dead pill. Three bounded tries still cannot hide a pill that
     never answers. */
  let tries = 0;
  while ((await ev(`document.querySelector(".report-modal").hidden`)) && tries++ < 3) {
    await press(cx, cy);
    await sleep(400);
  }
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
    // No focusables means the dialog is shut — say so as a fact instead of throwing and
    // taking the whole run down with it.
    if (!f.length) return { last: "nothing focusable", after: "nothing focusable", n: 0 };
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
  await optionF();
  await until(`!document.querySelector(".report-modal").hidden`);
  gate("⌘⌥F opens it with the dialog shut, typed the way a Mac types it",
    (await ev(`document.querySelector(".report-modal").hidden`)) === false, "input layer sent key=ƒ code=KeyF meta+alt");
  await escape();
  await until(`document.querySelector(".report-modal").hidden`);
  gate("Escape leaves the visitor back on the page", (await ev(`document.querySelector(".report-modal").hidden`)) === true, "escape");
  await typeKey("f", "KeyF", 70, 3, 0);
  gate("the bare letter never opens a dialog nobody asked for",
    (await ev(`document.querySelector(".report-modal").hidden`)) === true, "plain f opened it");
  /* Windows and Linux have no Option, and the handler takes Ctrl+Alt as the same intent.
     There the glyph is still "f", so this arm travels the other half of the branch. */
  await typeKey("f", "KeyF", 70, 3, 1 | 2);
  await until(`!document.querySelector(".report-modal").hidden`);
  gate("Ctrl+Alt+F opens it where there is no Option key",
    (await ev(`document.querySelector(".report-modal").hidden`)) === false, "ctrl+alt+f");
  await escape();
  await until(`document.querySelector(".report-modal").hidden`);

  /* ── the screenshots tile ──────────────────────────────────────────────────────
     The tile used to read "open with the next release" on pages whose own CSP already
     allowed the mail rail the assistant ships voice notes over. So the arms below paste
     real pictures into a real dialog and count what the rail was handed. Every
     formsubmit.co call is answered inside the page — a rig run never puts a screenshot
     in the owner's inbox, and the counts printed here are the stub's, not the network's. */
  await load(`${ORIGIN}/${PAGE}`);
  await ev(`document.querySelector(".report-pill").click()`);
  await until(`!document.querySelector(".report-modal").hidden`);
  const tile = await ev(`(() => {
    const open = document.querySelector(".report__shots-open");
    const box = document.querySelector(".report__shots");
    const picker = document.getElementById("report-shots");
    return { pressable: !!open && open.tagName === "BUTTON" && open.type === "button",
      says: box ? box.textContent.replace(/\\s+/g, " ").trim().slice(0, 90) : null,
      promises: box ? /next release/.test(box.textContent) : null,
      inert: box ? box.getAttribute("aria-disabled") : "no tile",
      label: open ? open.getAttribute("aria-label") : null,
      type: picker ? picker.type : null, multi: picker ? picker.multiple : null,
      accepts: picker ? picker.accept : null };
  })()`);
  console.log("tile", JSON.stringify(tile));
  gate("the screenshots tile is a control, not a caption",
    tile.pressable && tile.inert === null && !tile.promises, JSON.stringify(tile));
  gate("its picker asks for the kinds and the count the copy states",
    tile.type === "file" && tile.multi === true && /png/.test(tile.accepts || "") && /3 pictures/.test(tile.label || ""),
    JSON.stringify({ type: tile.type, multi: tile.multi, accepts: tile.accepts }));

  const shots = () => ev(`(() => {
    const strip = document.querySelector(".report__shots-strip");
    const reject = document.querySelector(".report__shots-reject");
    const thumb = document.querySelector(".report__shots-thumb");
    return { tags: strip ? strip.querySelectorAll(".report__shots-tag").length : -1,
      hidden: strip ? strip.hidden : null,
      names: Array.from(document.querySelectorAll(".report__shots-tag b")).map((n) => n.textContent),
      sizes: Array.from(document.querySelectorAll(".report__shots-tag em")).map((n) => n.textContent),
      painted: thumb ? !!(thumb.complete && thumb.naturalWidth > 0 && thumb.getBoundingClientRect().width > 0) : false,
      removes: Array.from(document.querySelectorAll(".report__shots-x")).map((b) => b.tagName + ":" + (b.getAttribute("aria-label") || "")),
      refused: reject ? !reject.hidden : null };
  })()`);
  /* A pasted file travels the same path a picked or dropped one takes, and a headless frame
     has no file dialog to drive. The canvas makes each picture genuinely decodable, so the
     thumbnail check proves a painted image rather than a src that failed. */
  const pastePics = (n) => ev(`(async () => {
    const dt = new DataTransfer();
    for (let i = 0; i < ${n}; i++) {
      const f = await new Promise((res) => {
        const c = document.createElement("canvas"); c.width = 32; c.height = 20;
        const g = c.getContext("2d"); g.fillStyle = "#c2" + (i + 20).toString(16) + "2e"; g.fillRect(0, 0, 32, 20);
        c.toBlob((b) => res(new File([b], "screenshot-" + (i + 1) + ".png", { type: "image/png" })), "image/png");
      });
      dt.items.add(f);
    }
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    return dt.files.length;
  })()`);
  const pasteKind = (name, type, bytes) => ev(`(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(${bytes})], "${name}", { type: "${type}" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    return 1;
  })()`);

  await pastePics(2);
  await until(`document.querySelectorAll(".report__shots-tag").length === 2`);
  const two = await shots();
  console.log("two", JSON.stringify(two));
  gate("a pasted picture lands on the tile with a thumbnail that paints",
    two.tags === 2 && two.hidden === false && two.painted, JSON.stringify(two));
  gate("every tag carries a named remove control the pointer can find",
    two.removes.length === 2 && two.removes.every((r) => r.indexOf("BUTTON:") === 0 && r.length > 8) && two.names.length === 2,
    JSON.stringify({ removes: two.removes, names: two.names, sizes: two.sizes }));
  await pasteKind("clip.mp4", "video/mp4", 8192);
  const clip = await shots();
  gate("a clip is refused, and the tile says why", clip.tags === 2 && clip.refused === true,
    JSON.stringify({ tags: clip.tags, refused: clip.refused }));
  await pasteKind("huge.png", "image/png", 11 * 1024 * 1024);
  const huge = await shots();
  gate("an eleven-megabyte picture is refused before the mail rail can drop it silently",
    huge.tags === 2 && huge.refused === true, JSON.stringify({ tags: huge.tags, refused: huge.refused }));
  await pastePics(3);
  await until(`document.querySelectorAll(".report__shots-tag").length === 3`);
  const capped = await shots();
  gate("a fourth picture is stopped by the cap the copy states",
    capped.tags === 3 && capped.refused === true, JSON.stringify({ tags: capped.tags, refused: capped.refused }));
  await ev(`document.querySelector(".report__shots-x").click()`);
  await until(`document.querySelectorAll(".report__shots-tag").length === 2`);
  const cut = await shots();
  gate("removing a picture clears the refusal and keeps the rest painted",
    cut.tags === 2 && cut.refused === false && cut.painted, JSON.stringify({ tags: cut.tags, refused: cut.refused }));
  await shot("pill637-shots", { x: 400, y: 40, width: 640, height: 820 });

  await ev(`(() => { const n = document.querySelector(".report__note");
    n.value = "Rig arm: the tile takes screenshots. Nothing here is for the inbox.";
    n.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const preSend = await ev(`({ mail: window.__pf.mail, calls: window.__pf.calls })`);
  /* --door=fail refuses the note itself, and by design the pictures then never leave the
     page: the studio's inbox does not collect screenshots attached to a report that was
     never filed. An arm that read this mode as "one mail per picture" would score an empty
     set as a pass. */
  const filed = DOOR !== "fail";
  await ev(`document.querySelector(".report__send").click()`);
  if (filed) {
    await until(`window.__pf.mail - ${preSend.mail} >= ${cut.tags}`);
    await until(`!document.querySelector(".form-success").hidden`);
    /* A refused picture is sent at once and tried again twelve hundred milliseconds later,
       so the second round has to land before the count is read — otherwise a run measures a
       retry that has not happened yet and calls it one attempt. */
    if (SHOTS === "fail") await until(`window.__pf.mail - ${preSend.mail} >= ${cut.tags * 2}`, 60);
  } else {
    await until(`!document.querySelector(".report__error").hidden`, 30);
  }
  await sleep(250);
  const mailed = await ev(`(() => { const p = document.querySelector(".report__error--partial");
    const busy = document.querySelector(".report__mailing");
    return { mail: window.__pf.mail, calls: window.__pf.calls,
      partial: p ? !p.hidden : null, waiting: busy ? !busy.hidden : null,
      rows: window.__pf.mails.map((m) => ({ subject: m.subject, keys: m.keys, name: m.name, bytes: m.bytes })),
      locked: document.querySelector(".report__send").disabled,
      tags: document.querySelectorAll(".report__shots-tag").length }; })()`);
  console.log("mailed", JSON.stringify(mailed));
  /* Retries repeat an envelope, so the count of calls and the count of pictures are two
     different facts. Reading one as the other is how an arm certifies a picture that was
     attempted twice and delivered zero times. */
  const attempts = mailed.mail - preSend.mail;
  const each = new Map();
  mailed.rows.forEach((r) => each.set(r.subject, (each.get(r.subject) || 0) + 1));
  const letters = [...each.values()];
  const wanted = SHOTS === "fail" ? 2 : 1;
  if (SHOTS === "fail") {
    gate("a refused picture is tried twice, so the count is the proof it was attempted",
      attempts === cut.tags * 2 && letters.length === cut.tags && letters.every((n) => n === 2),
      `${attempts} attempts over ${cut.tags} pictures, per envelope ${JSON.stringify(letters)}`);
  }
  gate(filed ? "the row and one mail per picture all leave the page"
    : "a refused row does not post its pictures to the owner's inbox",
    mailed.calls - preSend.calls === 1 && (filed
      ? each.size === cut.tags && attempts === cut.tags * wanted && letters.every((n) => n === wanted)
      : attempts === 0 && each.size === 0),
    `row ${mailed.calls - preSend.calls}, ${attempts} attempts for ${each.size} pictures`);
  if (filed) {
    gate("each envelope carries the picture and the words, and never the visitor's number",
      [...each.keys()].every((s) => new RegExp("^BrownHub screenshot \\d+ of " + cut.tags + " from /" + PAGE + "$").test(s || "")) &&
        mailed.rows.length === attempts && mailed.rows.every((r) =>
          r.keys.indexOf("picture") > -1 && r.keys.indexOf("message") > -1 && r.keys.indexOf("_subject") > -1 &&
          r.keys.indexOf("contact") === -1 && r.bytes > 0),
      JSON.stringify([...each.keys()].slice(0, 4)));
  }
  gate(filed
    ? "an accepted send clears the waiting line, and the partial one only when the rail failed"
    : "a note the studio never filed claims no delivery, and leaves Send open",
    mailed.waiting === false && (filed
      ? mailed.partial === (SHOTS === "fail") && mailed.locked === true
      : mailed.partial === false && mailed.locked === false),
    JSON.stringify({ waiting: mailed.waiting, partial: mailed.partial, locked: mailed.locked }));
  await ev(`document.querySelector(".report-modal__close").click()`);
  await until(`document.querySelector(".report-modal").hidden`);
  await ev(`document.querySelector(".report-pill").click()`);
  await until(`!document.querySelector(".report-modal").hidden`);
  const again = await shots();
  gate(filed
    ? "reopening hands back an empty tile, not the last visitor's pictures"
    : "a refused send keeps its pictures on the tile, so nothing has to be attached twice",
    filed ? again.tags === 0 && again.hidden === true && again.refused === false
      : again.tags === cut.tags && again.painted && again.refused === false,
    JSON.stringify({ tags: again.tags, hidden: again.hidden, painted: again.painted, refused: again.refused }));
  await ev(`document.querySelector(".report-modal__close").click()`);
  await until(`document.querySelector(".report-modal").hidden`);

  /* The shortcut is the one way in that does not need the corner, so it has to prove it does
     not stack two dialogs. Reloaded, the arrival card is up again and nothing has pressed it
     away; after the key there must be exactly one live tab ring, and the caret in the note. */
  await load(`${ORIGIN}/${PAGE}`);
  await until("!document.getElementById('home-promo').hidden", 80);
  await optionF();
  await until(`!document.querySelector(".report-modal").hidden`);
  const stacked = await ev(`(() => ({ dialog: !document.querySelector(".report-modal").hidden,
    card: !document.getElementById("home-promo").hidden, focus: document.activeElement.id,
    pad: document.body.style.paddingRight, trap: (() => {
      const f = Array.from(document.querySelectorAll(".report-modal__card a[href], .report-modal__card button:not([disabled]), .report-modal__card textarea"))
        .filter((n) => n.offsetParent !== null);
      // An empty list here is a finding, not a crash: report it so the gate below prints it.
      if (!f.length) return "nothing focusable";
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
  /* haul.html used to sit here. It now hangs its own pill and clothes it in a block of its
     own stylesheet, so the claim this loop makes would be false — tools/pill638.mjs is the rig
     that proves that page. offline.html stays: it is the fallback the service worker paints,
     and a feedback mark on the page you see when the network is gone asks for a POST that
     cannot be made. */
  for (const p of ["offline.html"]) {
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
