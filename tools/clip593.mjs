/* Proof for four catalog-media asks: the clip stage arrives carrying the studio's own
   press bed instead of the sound recorded in the shop, the Winners' Chapel card stops
   offering other products' frames, a print-sample card plays under its new name, and the
   re-cropped clips paint the frame they were cut to.

   It is a real Blink run rather than a grep because `muted` in the markup is only a
   default: the element is one shared node that js/catalog.js re-uses across shots, so
   what matters is the state of that node while a clip is actually playing. And the frame
   lists are read back through the thumb strip the visitor sees, not from data-imgs. A crop
   is the same kind of claim: videoWidth is what the decoder hands the page, so it can only
   be read from a player.

   Usage: node tools/clip593.mjs [--base=http://127.0.0.1:8123] [--out=/tmp/bh593]
*/
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const BASE = flag('base', 'http://127.0.0.1:8123');
const OUT = flag('out', '/tmp/bh593');
const PORT = 9414;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const profile = mkdtempSync(path.join(tmpdir(), 'bh593-'));
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  // A scripted .click() is no trusted gesture, and Chrome refuses a clip that carries sound.
  '--autoplay-policy=no-user-gesture-required',
  '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const hit = (await res.json()).find((t) => t.type === 'page');
    if (hit) return hit;
    await sleep(250);
  }
  throw new Error('no page target');
}

/* The DevTools socket is not listening the moment spawn() returns, so asking /json/new
   before it is up fails the whole run with ECONNREFUSED rather than with anything the
   probe could name. */
async function devtoolsReady() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return true;
    } catch (e) { /* still booting */ }
    await sleep(250);
  }
  throw new Error('no devtools endpoint on port ' + PORT);
}

let id = 0;
const pending = new Map();
const events = [];
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { done } = pending.get(msg.id);
        pending.delete(msg.id);
        done(msg);
      } else if (msg.method) {
        events.push(msg);
      }
    };
  });
}
let sock;
function send(method, params = {}, sessionId) {
  return new Promise((resolve) => {
    const n = ++id;
    pending.set(n, { done: (msg) => resolve(msg.result || msg.error || {}) });
    sock.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
}
/* Every probe below is an async IIFE, so the value at the end is a Promise. Asked without
   awaiting it, DevTools hands back the Promise object itself, which owns no enumerable
   properties: every read then prints `{}` and looks like a page with nothing on it. */
async function evaluate(expr, awaitPromise = true) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    returnByValue: true, awaitPromise,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result && r.result.value;
}

const out = { base: BASE, pages: {}, shots: {}, crops: {}, errs: [] };

try {
  await devtoolsReady();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  sock = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  const wait = async (url) => {
    const seen = events.length;
    await send('Page.navigate', { url });
    for (let i = 0; i < 200; i++) {
      await sleep(100);
      if (events.slice(seen).some((e) => e.method === 'Page.loadEventFired')) break;
    }
    await sleep(1200);
  };

  /* One read of the stage on each page that hosts it, taken before anything is clicked:
     the attribute is the default the visitor is handed. */
  for (const page of ['catalog.html', 'index.html', 'engineering.html']) {
    await wait(BASE + '/' + page);
    out.pages[page] = await evaluate(`
      var v = document.querySelector('video.modal__clip');
      if (!v) return { missing: true };
      return { tag: v.outerHTML.slice(0, 200), muted: v.muted, defaultMuted: v.defaultMuted,
               volume: v.volume, controls: v.controls, preload: v.preload, hidden: v.hidden };
    `);
  }

  /* Now the two cards, driven the way a visitor drives them. */
  await wait(BASE + '/catalog.html');
  out.shots.winners = await evaluate(`
    function card(name) {
      return [].slice.call(document.querySelectorAll('.product-card'))
        .find(function (c) { return c.dataset.name === name; });
    }
    function openIt(name) {
      var c = card(name);
      if (!c) return { missing: true };
      c.click();
      var modal = document.querySelector('.modal');
      if (modal) modal.setAttribute('data-open', '1');
      return { shots: (c.dataset.imgs || '').split(',').map(function (s) { return s.trim(); })
                          .filter(Boolean) };
    }
    var info = openIt("More Winners' Chapel Flyers");
    await new Promise(function (r) { setTimeout(r, 500); });
    var faces = [].slice.call(document.querySelectorAll('.modal__gal-thumb img'))
      .map(function (i) { return i.getAttribute('src'); });
    var count = document.querySelector('.modal__gal-count');
    return { data: info.shots, faces: faces,
             count: count ? count.textContent : null,
             open: !!document.querySelector('.modal[aria-hidden="false"], .modal.is-open, .modal:not([hidden])') };
  `);

  out.shots.clip = await evaluate(`
    function card(name) {
      return [].slice.call(document.querySelectorAll('.product-card'))
        .find(function (c) { return c.dataset.name === name; });
    }
    card("VIDEO SAMPLES OF OUR PRINT OUT 1").click();
    await new Promise(function (r) { setTimeout(r, 400); });
    var v = document.querySelector('video.modal__clip');
    // The first thumb of a SAMPLES card is a clip, so tapping it puts video on the stage.
    var thumbs = [].slice.call(document.querySelectorAll('.modal__gal-thumb'));
    thumbs[0].click();
    await new Promise(function (r) { setTimeout(r, 300); });
    var stage = document.querySelector('.modal__gal');
    return {
      thumbs: thumbs.length,
      isClipClass: stage.classList.contains('is-clip'),
      src: v.getAttribute('src') || v.currentSrc,
      mutedBefore: v.muted,
    };
  `);

  /* Press play and read the node while it is actually running: this is the state that
     decides whether a stranger hears the shop. */
  out.shots.playing = await evaluate(`
    var v = document.querySelector('video.modal__clip');
    try { await v.play(); } catch (e) { return { playError: String(e) }; }
    await new Promise(function (r) { setTimeout(r, 1200); });
    var a = v.currentTime;
    await new Promise(function (r) { setTimeout(r, 700); });
    return { paused: v.paused, muted: v.muted, volume: v.volume,
             readyState: v.readyState, advanced: v.currentTime > a,
             src: (v.currentSrc || '').split('/').pop() };
  `);

  /* A crop is only shipped when the decoder agrees. Walk each print-sample card, put every
     one of its clips on the stage and read the intrinsic frame Blink actually paints. */
  for (const name of [1, 2, 3, 4].map((n) => `VIDEO SAMPLES OF OUR PRINT OUT ${n}`)) {
    await wait(BASE + '/catalog.html');
    out.crops[name] = await evaluate(`
      var c = [].slice.call(document.querySelectorAll('.product-card'))
        .find(function (k) { return k.dataset.name === ${JSON.stringify(name)}; });
      if (!c) return { missing: true };
      c.click();
      await new Promise(function (r) { setTimeout(r, 400); });
      var v = document.querySelector('video.modal__clip');
      var rows = [];
      var stem = function (s) { return (s || '').split('/').pop().replace(/\\.[a-z0-9]+$/, ''); };
      for (var i = 0; i < document.querySelectorAll('.modal__gal-thumb').length; i++) {
        var thumb = document.querySelectorAll('.modal__gal-thumb')[i];
        var face = stem((thumb.querySelector('img') || {}).src);
        thumb.click();
        /* The clips ship preload="none", so no byte reaches the decoder until somebody presses
           play. This loop is that somebody. */
        try { await v.play(); } catch (e) {}
        /* Then wait for the decoder to name the very file this thumb advertises, so the
           previous clip's geometry can never read as this one's. */
        var wait = 0;
        while (wait < 3000 && !(v.videoWidth > 0 && stem(v.currentSrc) === face)) {
          await new Promise(function (r) { setTimeout(r, 100); });
          wait += 100;
        }
        v.pause();
        rows.push({ shot: face,
                    clip: stem(v.currentSrc),
                    frame: v.videoWidth + 'x' + v.videoHeight,
                    secs: Math.round(v.duration * 10) / 10 });
      }
      return rows;
    `);
  }

  const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => JSON.stringify(e.params).slice(0, 300));
  const fails = events.filter((e) => e.method === 'Log.entryAdded'
    && e.params.entry.level === 'error'
    && /404|Failed to load|not allowed/.test(e.params.entry.text))
    .map((e) => (e.params.entry.text + ' [' + (e.params.entry.url || '?') + ']').slice(0, 260));
  out.errs = [...new Set(errs.concat(fails))];

  writeFileSync(path.join(OUT, 'clip593.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
} finally {
  chrome.kill('SIGKILL');
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
