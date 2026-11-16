/* Proof for #602: a picture or a clip a visitor hands the assistant must be *seen*, not
   stamped. Two defects hid it — the page's own CSP refused a `blob:` picture, and a clip was
   being put into an `<img>`, which no engine can decode — so both had to be measured in a real
   Blink frame rather than read out of the source.

   The run is offline on purpose: it serves the repo over http, attaches two real files from
   the site's own media through the composer's picker, and intercepts the assistant endpoint.
   Holding that request rather than answering it keeps a probe from spending the owner's Gemini
   quota or writing a test row into his live chat log, and leaves the thread in the waiting state
   the visitor actually sits in. The attachment markup is built and painted before the call.
   It also measures how much thread is left for a picture once the first-visit cookie notice —
   which reserves 200px of a phone — is taken down, because that is the screen a visitor lives in.

   Usage: node tools/media602.mjs [--base=http://127.0.0.1:8123] [--out=/tmp/bh602]
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
const OUT = flag('out', '/tmp/bh602');
const PORT = 9421;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const profile = mkdtempSync(path.join(tmpdir(), 'bh602-'));
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
function send(method, params = {}) {
  return new Promise((resolve) => {
    const n = ++id;
    pending.set(n, { done: (msg) => resolve(msg.result || msg.error || {}) });
    sock.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result && r.result.value;
}

const csp = [];
function collectCsp(msg) {
  const text = (() => {
    if (msg.method === 'Log.entryAdded') return msg.params.entry.text;
    if (msg.method === 'Runtime.consoleAPICalled') {
      return (msg.params.args || []).map((a) => a.value || a.description || '').join(' ');
    }
    return '';
  })();
  if (/Content Security Policy/.test(text)) csp.push(text.slice(0, 220));
}

/* Attach two real files the way the visitor does: bytes off the same origin, put into the
   composer's own picker, and the picker's own `change` handler does the rest. A DataTransfer
   is the only way to set `input.files` from a script. */
const ATTACH = `
  const want = [[${JSON.stringify('images/catalog/flyer-2.jpg')}, 'flyer-2.jpg', 'image/jpeg'],
                [${JSON.stringify('video/coding-bg-lo.mp4')}, 'press-bed.mp4', 'video/mp4']];
  const dt = new DataTransfer();
  for (const [url, name, type] of want) {
    const buf = await (await fetch('${BASE}/' + url)).arrayBuffer();
    dt.items.add(new File([buf], name, { type }));
  }
  const picker = document.querySelector('.chat-widget__picker');
  if (!picker) return 'NO PICKER';
  picker.files = dt.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  return 'attached ' + document.querySelectorAll('.chat-widget__file-thumb').length;
`;

/* Frame the panel itself, not the page behind it. The home welcome card is a modal that sits
   over the chat at phone width, so the shot closes it first — otherwise the proof photograph
   is of the studio's own ask, not of the attachment it is meant to be about. */
async function shoot(name, expr, rectExpr) {
  await evaluate(expr);
  await sleep(500);
  const file = path.join(OUT, name);
  const rect = await evaluate(rectExpr || `
    const r = document.getElementById('chatPanel').getBoundingClientRect();
    return JSON.stringify({ x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
                           width: Math.round(r.width), height: Math.round(r.height) });
  `);
  const png = await send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false, clip: { ...JSON.parse(rect), scale: 2 } });
  if (png.data) writeFileSync(file, Buffer.from(png.data, 'base64'));
  return file;
}

async function measure(label, w, h, dpr) {
  await send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 700 });
  const seen = events.length;
  /* The CSP log is shared by both viewports, so a raw count would blame this run for the other
     one's deliberate off-origin probe. Everything below is measured against where this run starts. */
  const cspSeen = csp.length;
  await send('Page.navigate', { url: BASE + '/index.html' });
  for (let i = 0; i < 250; i++) {
    await sleep(100);
    if (events.slice(seen).some((e) => e.method === 'Page.loadEventFired')) break;
  }
  await sleep(2500);
  await evaluate(`
    const t = document.getElementById('chatToggle');
    const p = document.getElementById('chatPanel');
    if (p && !p.getBoundingClientRect().width && t) t.click();
    return 'panel width ' + (p ? Math.round(p.getBoundingClientRect().width) : 'missing');
  `);
  await sleep(400);
  /* The first-visit cookie notice reserves 200px at the bottom of a phone, and the panel is
     capped against it, so a measurement taken under the notice measures a screen the visitor
     only ever sees once. Take the notice down the way a visitor who wants nothing tracked does —
     accepting would let the consent-gated visit counter write a row into the owner's live table. */
  const consent = await evaluate(`
    const btns = [...document.querySelectorAll('.cookie-notice button')];
    const reject = btns.find((b) => /Reject/i.test(b.textContent));
    if (!reject || document.querySelector('.cookie-notice.is-gone')) return 'no notice up';
    reject.click();
    return 'rejected non-essential';
  `);
  await sleep(1200);
  const tray = await evaluate(ATTACH);
  await sleep(1500);
  const trayState = await evaluate(`
    const thumbs = [...document.querySelectorAll('.chat-widget__file-thumb')];
    return JSON.stringify(thumbs.map((el) => ({
      tag: el.tagName,
      painted: el.tagName === 'IMG' ? el.naturalWidth : el.videoWidth,
      box: [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)],
      badge: !!el.parentElement.querySelector('.chat-widget__file-play'),
    })));
  `);
  const trayShot = await shoot(label + '-tray.png', `
    const x = document.querySelector('[data-promo-close]');
    if (x) x.click();
    return 'tray framed';
  `);
  await evaluate(`
    document.getElementById('chatInput').value = 'is this the flyer you printed for us?';
    document.getElementById('chatForm').requestSubmit();
    return 'sent';
  `);
  await sleep(500);
  /* The send moment, before anything has been appended after the message. The picture is taller
     than the thread window, so the only question is which edge of it the scroller chose to meet:
     a topOffset of 0 means the reader is looking at the top of their own flyer, a large negative
     one means the send pinned the bottom and landed them on its tail. */
  const atSend = await evaluate(`
    const msgs = document.getElementById('chatMessages');
    const last = [...document.querySelectorAll('.chat-msg--user')].pop();
    const m = last && last.querySelector('.chat-msg__media');
    if (!m) return 'no media at send';
    const mb = msgs.getBoundingClientRect(), fb = m.getBoundingClientRect();
    return JSON.stringify({
      topOffset: Math.round(fb.top - mb.top),
      mediaH: Math.round(fb.height),
      windowH: Math.round(msgs.clientHeight),
      followsTop: fb.top >= mb.top - 1,
      botsAfter: document.querySelectorAll('.chat-msg--bot').length,
    });
  `);
  await sleep(1500);
  /* What the reader is looking at the moment they have sent: the whole panel, not a framed
     element, because the question is whether the picture they just attached is in front of them. */
  const sentShot = await shoot(label + '-sent.png', "return 'as sent';");
  const sent = await evaluate(`
    const last = [...document.querySelectorAll('.chat-msg--user')].pop();
    const out = { msgFound: !!last, panel: {}, media: [], docs: [], strip: {} };
    const panel = document.getElementById('chatPanel');
    out.panel = { w: Math.round(panel.getBoundingClientRect().width) };
    if (!last) return JSON.stringify(out);
    const strip = last.querySelector('.chat-msg__files');
    const inner = last.querySelector('.chat-msg__inner');
    /* The same edge a couple of seconds further into the wait. Nothing has been appended under
       the dots, so if the hold is real the picture has not drifted off the screen while the
       studio thinks. When an answer does land it is content the visitor is waiting for, and the
       thread follows it — that is what every chat app does. */
    const msgs = document.getElementById('chatMessages');
    const first = strip && strip.querySelector('.chat-msg__media');
    if (first) {
      const fb = first.getBoundingClientRect();
      const mb = msgs.getBoundingClientRect();
      out.view = {
        mediaH: Math.round(fb.height),
        windowH: Math.round(msgs.clientHeight),
        topOffset: Math.round(fb.top - mb.top),
        visibleH: Math.round(Math.min(fb.bottom, mb.bottom) - Math.max(fb.top, mb.top)),
        fromTop: Math.round(fb.top - mb.top) >= -1,
      };
    }
    out.strip = {
      dir: getComputedStyle(strip).flexDirection,
      innerW: Math.round(inner.getBoundingClientRect().width),
      stripW: Math.round(strip.getBoundingClientRect().width),
    };
    for (const node of strip.querySelectorAll('.chat-msg__media')) {
      const kid = node.firstElementChild;
      const cs = getComputedStyle(kid);
      const box = kid.getBoundingClientRect();
      out.media.push({
        tag: kid.tagName,
        natural: kid.tagName === 'IMG' ? [kid.naturalWidth, kid.naturalHeight] : [kid.videoWidth, kid.videoHeight],
        readyState: kid.readyState,
        painted: kid.tagName === 'IMG' ? kid.naturalWidth > 0 : kid.videoWidth > 0,
        client: [Math.round(box.width), Math.round(box.height)],
        wrapClient: Math.round(node.getBoundingClientRect().width),
        fills: Math.abs(box.width - node.getBoundingClientRect().width) <= 1 ||
               Math.abs(box.height - node.getBoundingClientRect().height) <= 1,
        fit: cs.objectFit, maxW: cs.maxWidth, maxH: cs.maxHeight,
        controls: kid.tagName === 'VIDEO' ? kid.controls : null,
        preload: kid.tagName === 'VIDEO' ? kid.preload : null,
        radius: getComputedStyle(node).borderRadius,
      });
    }
    out.docs = [...strip.querySelectorAll('.chat-msg__doc')].map((d) => d.textContent);
    return JSON.stringify(out);
  `);
  // A clip that is only *sized* is not a player: press play and read the clock back.
  const play = await evaluate(`
    const v = [...document.querySelectorAll('.chat-msg--user .chat-msg__media video')].pop();
    if (!v) return 'NO VIDEO';
    v.muted = true;
    const t0 = v.currentTime;
    try { await v.play(); } catch (e) { return 'play refused: ' + e.name; }
    await new Promise((r) => setTimeout(r, 900));
    return JSON.stringify({ started: !v.paused, advanced: +(v.currentTime - t0).toFixed(2),
                            duration: +v.duration.toFixed(2), w: v.videoWidth });
  `);
  /* Whether the reader gets a transport they can press is the whole reason a <video> sits here
     instead of a still, so photograph the paused element rather than one already running. */
  const paused = await evaluate(`
    const msgs = document.getElementById('chatMessages');
    const v = [...document.querySelectorAll('.chat-msg--user .chat-msg__media video')].pop();
    v.pause();
    v.currentTime = 0;
    const y = v.getBoundingClientRect().top - msgs.getBoundingClientRect().top + msgs.scrollTop;
    msgs.scrollTop = Math.max(0, y - 6);
    return JSON.stringify({ paused: v.paused, at: +v.currentTime.toFixed(2), controls: v.controls,
                            box: [Math.round(v.getBoundingClientRect().width),
                                  Math.round(v.getBoundingClientRect().height)] });
  `);
  const controlsShot = await shoot(label + '-controls.png', "return 'ok';", `
    const v = [...document.querySelectorAll('.chat-msg--user .chat-msg__media video')].pop();
    const r = v.getBoundingClientRect();
    return JSON.stringify({ x: Math.max(0, Math.round(r.x) - 8), y: Math.max(0, Math.round(r.y) - 8),
                           width: Math.round(Math.min(r.width + 16, innerWidth)),
                           height: Math.round(Math.min(r.height + 16, innerHeight)) });
  `);
  /* "Show it in full" is only true if the reader can actually see all of it at once, and the
     panel's own window is shorter than a portrait picture at full width. Measure the room the
     thread leaves between its top and the WhatsApp bar rather than trusting the cap. */
  const fits = await evaluate(`
    const msgs = document.getElementById('chatMessages');
    const last = [...document.querySelectorAll('.chat-msg--user')].pop();
    const m = last.querySelector('.chat-msg__media');
    const bar = document.querySelector('.chat-widget__handoff');
    const mb = m.getBoundingClientRect(), sc = msgs.getBoundingClientRect();
    const room = Math.round((bar && !bar.hidden ? bar.getBoundingClientRect().top : sc.bottom) - sc.top);
    msgs.scrollTop = msgs.scrollHeight;
    const atEnd = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 1;
    msgs.scrollTop = 0;
    const atTop = msgs.scrollTop === 0;
    return JSON.stringify({ mediaH: Math.round(mb.height), windowH: room,
                            fitsInOneScreen: Math.round(mb.height) <= room, reachesEnd: atEnd,
                            reachesTop: atTop });
  `);
  const shot = await shoot(label + '-photo.png', `
    const msgs = document.getElementById('chatMessages');
    const last = [...document.querySelectorAll('.chat-msg--user')].pop();
    const y = last.getBoundingClientRect().top - msgs.getBoundingClientRect().top + msgs.scrollTop;
    msgs.scrollTop = Math.max(0, y - 6);
    return 'photo framed';
  `);
  const clipShot = await shoot(label + '-clip.png', `
    const msgs = document.getElementById('chatMessages');
    const v = [...document.querySelectorAll('.chat-msg--user .chat-msg__media video')].pop();
    const y = v.getBoundingClientRect().top - msgs.getBoundingClientRect().top + msgs.scrollTop;
    msgs.scrollTop = Math.max(0, y - 6);
    return 'clip framed';
  `);

  /* The boundary case the fix has to survive: a picture neither engine can paint. Text bytes
     wearing a .heic name guarantee the decode fails, and a torn picture icon tells the reader
     less than the file's own name does, so the chip has to come back in its place. */
  const broken = await evaluate(`
    const buf = await (await fetch('${BASE}/robots.txt')).arrayBuffer();
    const dt = new DataTransfer();
    dt.items.add(new File([buf], 'camera-roll.heic', { type: 'image/heic' }));
    const picker = document.querySelector('.chat-widget__picker');
    picker.files = dt.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return 'queued';
  `);
  await evaluate(`
    document.getElementById('chatInput').value = 'and this one?';
    document.getElementById('chatForm').requestSubmit();
    return 'sent';
  `);
  await sleep(1800);
  /* The first request is still held, so the composer has not cleared its pending files and this
     send carries them alongside the undecodable one. The question is only ever about the heic,
     so name it: no element may have been built for it, and its chip must say which file it is. */
  const fallback = await evaluate(`
    const msgs = [...document.querySelectorAll('.chat-msg--user')];
    const last = msgs[msgs.length - 1];
    const strip = last.querySelector('.chat-msg__files');
    const painted = [...strip.querySelectorAll('img, video')]
      .filter((n) => (n.alt || n.getAttribute('aria-label') || '') === 'camera-roll.heic');
    return JSON.stringify({
      heicPainted: painted.length,
      media: strip.querySelectorAll('.chat-msg__media').length,
      chips: [...strip.querySelectorAll('.chat-msg__doc')].map((d) => d.textContent),
    });
  `);
  /* A control for the collector itself. An off-origin picture is something this page's own
     `img-src` really does refuse, so a violation has to land in `csp` here — otherwise an empty
     `csp` above would only prove nobody was listening, which is how the original defect read
     green for weeks. */
  const during = csp.length - cspSeen;
  await evaluate(`
    const probe = new Image();
    probe.src = 'http://127.0.0.1:9999/refused.png';
    return 'control fired';
  `);
  await sleep(900);
  const control = {
    attachViolations: during,
    afterControl: csp.length - cspSeen,
    refusalRead: csp[csp.length - 1] || '',
  };
  return { label, viewport: w + 'x' + h, consent, tray, trayState, trayShot, atSend, sentShot, sent,
           play, paused, controlsShot, fits, shot, clipShot, broken, fallback, control };
}

const out = { base: BASE, runs: [], csp: [], held: [] };
try {
  await devtoolsReady();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  sock = await connect(target.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  /* Nothing leaves the machine: a paused request is held by the browser until it is continued,
     so neither refusing nor continuing it spends the owner's Gemini quota or writes his chat log.
     It is deliberately left hanging rather than refused, because refusing it lands the apology
     inside the same tick as the send and the proof then measures the wrong moment — the state a
     visitor actually sits in is the waiting one, with only the three dots below their picture. */
  await send('Fetch.enable', {
    patterns: [{ urlPattern: '*/functions/v1/brownhub-assistant*', requestStage: 'Request' }],
  });
  const onFetch = (m) => {
    if (m.method === 'Fetch.requestPaused') out.held.push(m.params.request.url);
  };
  const pump = (m) => { collectCsp(m); onFetch(m); };
  const origPush = events.push.bind(events);
  events.push = (...a) => { a.forEach(pump); return origPush(...a); };
  out.runs.push(await measure('desk', 1440, 900, 1));
  out.runs.push(await measure('phone', 390, 844, 2));
  out.csp = csp;
} catch (e) {
  out.errs = String(e && e.message || e);
} finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  chrome.kill();
  /* Chrome is still writing into the profile when kill() returns, so the removal races it.
     The profile is a throwaway temp dir; losing the race must not bury the report. */
  await sleep(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* left in tmp */ }
}
