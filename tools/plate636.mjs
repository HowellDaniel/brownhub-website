/*
  Blink proof for #636: the fourth step of the pinned process story has to paint a real
  picture of the studio's own work, not the abstract placeholder that sat in that slot.

  node tools/plate636.mjs [--vw=1440] [--vh=900] [--dpr=2] [--lang=en|ar]
                          [--theme=dark|light] [--shot=/tmp/bh636]

  What it measures, and why each number is the one that matters:
    - the media box's real CSS pixels, so the plate is cut for the box it is shown in
      rather than for the ratio its neighbour declares;
    - which file `currentSrc` actually chose, because a <picture> that silently falls
      back to the old placeholder is the failure this task exists to prevent;
    - the drawn width against the box, since the pinned mode scales the picture and a
      plate that is smaller than its drawn size arrives soft;
    - layout shift at the step, because a swapped picture with the wrong stamped
      width/height moves the band under a reader who is already on it.
*/
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const VW = Number(ARG.vw || 1440);
const VH = Number(ARG.vh || 900);
const DPR = Number(ARG.dpr || 2);
const LANG = ARG.lang || "en";
const THEME = ARG.theme || "dark";
const PORT = Number(ARG.port || 9436);
const SHOTDIR = ARG.shot || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "bh-plate-"));

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
function onMessage(ev) {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const w = pending.get(m.id);
    pending.delete(m.id);
    m.error ? w.reject(new Error(m.method + ": " + m.error.message)) : w.resolve(m.result);
  }
}
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function ev(expr, isAsync) {
  const r = await send("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise: !!isAsync,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function main() {
  let pages = null;
  for (let i = 0; i < 60 && !pages; i++) {
    await sleep(200);
    try { pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (e) {}
  }
  const page = (pages || []).find((p) => p.type === "page");
  if (!page) throw new Error("no page target — Chrome did not expose one");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = onMessage;
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = () => j(new Error("ws failed"));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await ev(`try{localStorage.setItem("brownhub-lang",${JSON.stringify(LANG)});}catch(e){}`);
  await ev(`try{localStorage.setItem("brownhub-theme",${JSON.stringify(THEME)});}catch(e){}`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: VW, height: VH, deviceScaleFactor: DPR, mobile: VW < 500,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:8123/" + (ARG.url || "index.html") });
  await sleep(5000);

  const cls = await ev(`(function(){
    window.__cls = 0;
    new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){
      if (!e.hadRecentInput) window.__cls += e.value; }); }).observe({type:"layout-shift",buffered:true});
    return "armed";
  })()`);

  await ev(`document.querySelector("#process").scrollIntoView({block:"center"})`);
  await sleep(3000);
  // The stage only paints the step the scroll is standing on, and a lazy picture in a
  // step nobody has scrolled to has no currentSrc at all. `--pstep` lives on `.pstory`
  // and is written by the driver as the sticky run passes, so the walk is measured
  // rather than guessed: nudge down until the driver itself says it is on step four.
  const walk = await ev(`(async function(){
    var band = document.querySelector(".pstory");
    var run = band.querySelector(".pstory__run");
    var top = band.getBoundingClientRect().top + scrollY;
    var last = top + band.offsetHeight - innerHeight;
    var steps = 0, seen = "";
    for (var y = top; y <= last + 1 && steps < 240; y += Math.max(40, innerHeight / 12)) {
      scrollTo(0, y);
      await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      seen = band.style.getPropertyValue("--pstep");
      steps++;
      if (seen === String(band.querySelectorAll(".pstory__slide").length - 1)) break;
    }
    document.querySelectorAll(".pstory__visual img").forEach(function (im) { im.loading = "eager"; });
    await new Promise(function (r) { setTimeout(r, 900); });
    return { pstep: seen, nudges: steps, atEnd: Math.round(scrollY) === Math.round(last) };
  })()`, true);
  await sleep(1200);

  const out = await ev(`(function(){
    var slides = [].slice.call(document.querySelectorAll(".pstory__slide"));
    var band = document.querySelector(".pstory");
    var stage = document.querySelector(".pstory__slides");
    var sr = stage && stage.getBoundingClientRect();
    var pin = document.querySelector(".pstory__pin");
    var pr = pin && pin.getBoundingClientRect();
    return {
      dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight,
      scrollY: Math.round(scrollY),
      pinned: document.documentElement.classList.contains("js-pstory"),
      lang: document.documentElement.lang,
      walk: ${JSON.stringify(walk)},
      stage: sr && [Math.round(sr.width), Math.round(sr.height)],
      pinBox: pr && [Math.round(pr.width), Math.round(pr.height), Math.round(pr.top)],
      pstep: band && band.style.getPropertyValue("--pstep"),
      on: slides.map(function (s) { return s.dataset.on; }).join(","),
      slides: slides.map(function(s,i){
        var v = s.querySelector(".pstory__visual");
        var im = v && v.querySelector("img");
        var vr = v.getBoundingClientRect();
        var ir = im && im.getBoundingClientRect();
        var cs = im && getComputedStyle(im);
        var vs = v && getComputedStyle(v);
        return {
          i: i,
          at: s.style.getPropertyValue("--at"),
          art: v && v.getAttribute("data-art"),
          box: v && [Math.round(vr.width), Math.round(vr.height)],
          layout: v && [v.offsetWidth, v.offsetHeight],
          ratio: v && +(vr.width/vr.height).toFixed(3),
          src: im && (im.currentSrc || "").split("/").pop(),
          natural: im && [im.naturalWidth, im.naturalHeight],
          drawn: ir && [Math.round(ir.width), Math.round(ir.height)],
          fit: cs && cs.objectFit,
          scale: cs && cs.scale,
          py: cs && cs.getPropertyValue("--py"),
          matD: vs && vs.getPropertyValue("--mat-d"),
          complete: im && im.complete
        };
      }),
      cls: window.__cls
    };
  })()`);

  console.log(JSON.stringify(out, null, 1));
  if (SHOTDIR) {
    mkdirSync(SHOTDIR, { recursive: true });
    // A promo card or a cookie bar sitting over the stage hides the very thing being
    // checked, so the shot is taken after the notices are taken out and clipped to the
    // stage box rather than to the whole viewport.
    await ev(`(function(){
      document.querySelectorAll(".promo, .promo__scrim, .cookie-notice, .leadask, .chat-widget__teaser")
        .forEach(function (n) { n.remove(); });
      document.body.classList.remove("promo-open");
      return "cleared";
    })()`);
    await sleep(400);
    const clip = JSON.parse(await ev(`(function(){
      var p = document.querySelector(".pstory__pin") || document.querySelector("#process");
      var r = p.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(Math.max(0, r.left)), y: Math.round(Math.max(0, r.top)),
        width: Math.round(Math.min(r.width, innerWidth)),
        height: Math.round(Math.min(r.height, innerHeight)) });
    })()`));
    console.log("clip " + JSON.stringify(clip) + " scrollY " +
      await ev("Math.round(scrollY)"));
    const whole = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTDIR, `plate-${VW}x${VH}x${DPR}-${LANG}-whole.png`),
      Buffer.from(whole.data, "base64"));
    const shot = await send("Page.captureScreenshot", { format: "png", clip:
      { ...clip, scale: 1 } });
    writeFileSync(join(SHOTDIR, `plate-${VW}x${VH}x${DPR}-${LANG}.png`),
      Buffer.from(shot.data, "base64"));
  }
  await dispose();
}

// A rig that hangs is worse than a rig that fails: it reports nothing and holds a
// Chrome open. Ninety seconds covers the slowest honest cold load of this page.
const watchdog = setTimeout(() => {
  console.log("TIMEOUT: the run never finished");
  dispose().then(() => process.exit(1));
}, 90000);

main()
  .catch((e) => console.log("ERROR: " + (e && e.message ? e.message : String(e))))
  .finally(() => { clearTimeout(watchdog); process.exit(0); });
