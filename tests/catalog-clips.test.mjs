// The owner's print samples are clips, not photographs, and a clip is a different kind of
// visitor cost: a 540x960 reel weighs 3-7 MB against a 40 KB picture. So the whole layer is
// built on one rule — the grid and the thumb strip pay for a still, and the moving picture
// only arrives when someone asks for it. Each test below holds one half of that rule, and the
// halves are separable: a build that shows a black tile, preloads 100 MB onto a phone, or
// lets the pinch-to-zoom swallow the play button all fail here for different reasons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const sheet = read('css/style.css');
const page = read('catalog.html');
const driver = read('js/catalog.js');

// A card attribute read without a parser: the first data-<name>="…" inside the markup given.
function cardAttr(markup, name) {
  const m = markup.match(new RegExp(`data-${name}="([^"]*)"`));
  assert.ok(m, `no data-${name} on this card`);
  return m[1];
}

// The body of a top-level `function name(...) { ... }`, braces counted rather than guessed.
function fnBody(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, `js/catalog.js has no function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  assert.fail(`function ${name} never closes`);
}

const clipCards = [...page.matchAll(/<article class="product-card"[\s\S]*?<\/article>/g)]
  .map((m) => m[0])
  .filter((card) => /(data-imgs="[^"]*\.mp4)/.test(card));

test('the print-sample cards exist and every shot they name is on disk', () => {
  assert.equal(clipCards.length, 4,
    'expected four SAMPLES OF OUR PRINT OUT cards carrying clips');
  const counts = clipCards.map((card) => cardAttr(card, 'imgs')
    .split(',').map((s) => s.trim()).filter(Boolean));
  assert.deepEqual(counts.map((c) => c.length), [10, 10, 10, 5],
    'he asked for ten inside each, in the order he sent them');
  for (const shots of counts) {
    for (const shot of shots) {
      assert.match(shot, /^video\/print-out-samples-\d-\d+\.mp4$/,
        `a shot list mixes a still into the clips: ${shot}`);
      const base = shot.split('/').pop().replace(/\.mp4$/, '');
      for (const p of [shot, `images/catalog/${base}.jpg`, `images/catalog/${base}.avif`,
                       `images/catalog/hi/${base}.jpg`, `images/catalog/hi/${base}.avif`]) {
        assert.ok(existsSync(path.join(root, p)), `${p} is named by a card but not in the repo`);
      }
    }
  }
});

test('the grid cover of a clip card is a still, never a clip', () => {
  assert.equal(clipCards.length, 4, 'no clip cards to check, so this test would pass on nothing');
  for (const card of clipCards) {
    const cover = cardAttr(card, 'img');
    assert.match(cover, /^images\/catalog\/print-out-samples-\d-\d+\.jpg$/,
      `the shelf pays for ${cover}; a pinned shelf must meet a poster, not a video`);
    assert.ok(/<source type="image\/avif"/.test(card), `${cover} carries no AVIF tier`);
  }
});

test('the modal stage owns a video that costs nothing until it is played', () => {
  const gal = page.match(/<div class="modal__gal"[\s\S]*?<\/div>/);
  assert.ok(gal, 'the modal gallery is gone');
  const video = gal[0].match(/<video\b[^>]*>/);
  assert.ok(video, 'the gallery stage has no <video>, so a clip shot can only ever 404');
  const attrs = video[0];
  for (const need of ['controls', 'playsinline', 'preload="none"', 'hidden']) {
    assert.ok(attrs.includes(need), `the stage video is missing ${need}: ${attrs}`);
  }
  assert.ok(!/autoplay/.test(attrs), 'a 100 MB shelf may not start playing itself');
});

test('a clip shot goes to the video stage and never to the image', () => {
  const body = fnBody(driver, 'showShot');
  assert.match(body, /isClip\(/, 'showShot does not ask whether the shot is a clip');
  const imageSet = body.match(/img\.src\s*=/g) || [];
  assert.equal(imageSet.length, 1, 'showShot assigns img.src more than once');
  assert.match(body, /else[\s\S]*img\.src\s*=[\s\S]*stageSrc/,
    'img.src is set on the unguarded path, so a .mp4 would be loaded as a picture');
  assert.match(body, /clip\.poster\s*=/, 'the video stage is never given its still');
  assert.match(body, /clip\.pause\(\)/, 'leaving a clip mid-play leaves it running in the dark');
});

test('the thumb strip shows the poster of a clip, not the clip', () => {
  const body = fnBody(driver, 'buildGallery');
  assert.match(body, /isClip\(/, 'the strip builds every face blind to clips');
  assert.match(body, /posterOf\(/, 'a clip thumb has no still to show');
  assert.match(body, /modal__gal-thumb--clip|clip-badge|badge/,
    'nothing tells the visitor this frame moves, so it reads as another photograph');
});

test('the picture zoom stands down so the play button can be reached', () => {
  const down = driver.match(/gal\.addEventListener\("pointerdown"[\s\S]*?\n\s*\}\);/);
  assert.ok(down, 'the gallery pointerdown handler is unrecognisable');
  assert.match(down[0], /if\s*\(isClip\(/, 'a tap on a clip zooms an invisible picture and '
    + 'sets touch-action:none, which holds the pointer off the video controls');
});

test('the clip stage keeps the picture box so the modal cannot shift', () => {
  const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const sizing = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /\.modal__clip/.test(m[1]))
    .map((m) => m[2].replace(/\s+/g, ' '));
  assert.ok(sizing.length, 'nothing sizes .modal__clip, so the video paints at its intrinsic size');
  assert.ok(sizing.some((d) => /max-height/.test(d)), '.modal__clip has no max-height clamp');
  assert.ok(sizing.some((d) => /object-fit\s*:\s*contain/.test(d)),
    '.modal__clip would crop the print instead of showing all of it');
  assert.ok(/\.modal__img\[hidden\][^{]*\{[^}]*display\s*:\s*none/.test(rules)
    || /\.modal__clip\[hidden\][^{]*\{[^}]*display\s*:\s*none/.test(rules),
    '.modal__img{display:block} outspecifies [hidden], so both stages would paint at once');
});

// The worker holds an installed app's files in Cache Storage so a weak connection still
// opens the studio. 35 clips are 122 MB, which is the whole reason the shelf pays a poster:
// stored for good, they would eat a phone. The rule lives in one allowlist in sw.js, so this
// runs that file in a sandbox against the real shot list and asks the worker what it did.
test('the service worker keeps every clip out of the app cache', async () => {
  const vm = await import('node:vm');
  const shots = clipCards.flatMap((card) => cardAttr(card, 'imgs').split(',')
    .map((s) => s.trim()).filter(Boolean));
  assert.ok(shots.length, 'no clips to test, so this rule would pass on nothing');

  const store = new Map();
  const intercepted = [];
  const key = (x) => (typeof x === 'string' ? x : x.url);
  const bucket = {
    addAll: async () => {},
    put: (u) => { store.set(key(u), true); },
    match: async (req) => (store.has(key(req)) ? {} : undefined),
  };
  const handlers = {};
  const context = vm.createContext({
    location: { hostname: 'www.brownhub283.com' },
    caches: { open: async () => bucket, match: bucket.match, keys: async () => [...store.keys()], delete: async () => true },
    fetch: (req) => Promise.resolve({ url: key(req), status: 200, statusText: 'OK', type: 'basic', headers: new Headers(), clone() { return this; }, body: null }),
    self: { addEventListener: (t, f) => { handlers[t] = f; }, clients: { claim: async () => {} } },
    Response, Headers, URL,
  });
  vm.runInContext(read('sw.js'), context);
  const ask = (url, mode = '') => {
    handlers.fetch({ request: { url, method: 'GET', mode }, respondWith: () => { intercepted.push(url); } });
  };
  const ORIGIN = 'https://www.brownhub283.com';
  for (const shot of shots) ask(ORIGIN + '/' + shot);
  ask(ORIGIN + '/images/catalog/print-out-samples-1-1.avif');
  await new Promise((done) => setTimeout(done, 30));

  for (const shot of shots) {
    const url = ORIGIN + '/' + shot;
    assert.ok(!intercepted.includes(url), `${shot} was intercepted, so the worker can serve it from its cache`);
    assert.ok(!store.has(url), `${shot} was written into the app cache`);
  }
  const poster = ORIGIN + '/images/catalog/print-out-samples-1-1.avif';
  assert.ok(store.has(poster), 'the harness never stores anything, so the clip result proves nothing');
});
