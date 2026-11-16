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

/* What an mp4 actually is, read out of its own boxes rather than from what the tool that made
   it claims to have done. `tkhd` carries the presentation size as two 16.16 fixed-point words
   at the very end of the box, and `hdlr` names what each track holds. This is the only way to
   tell a crop that landed from a crop that was asked for. */
function mp4Info(file) {
  const buf = readFileSync(path.join(root, file));
  const walk = (from, to) => {
    const out = [];
    for (let i = from; i + 8 <= to;) {
      const size = buf.readUInt32BE(i);
      if (size < 8 || i + size > to) break;
      out.push({ type: buf.toString('latin1', i + 4, i + 8), from: i, to: i + size });
      i += size;
    }
    return out;
  };
  const moov = walk(0, buf.length).find((b) => b.type === 'moov');
  assert.ok(moov, `${file} has no moov, so it cannot be read`);
  const mvhd = walk(moov.from + 8, moov.to).find((b) => b.type === 'mvhd');
  assert.ok(mvhd, `${file} has no mvhd, so its length cannot be read`);
  const version = buf[mvhd.from + 8];
  const timescale = version === 1
    ? buf.readUInt32BE(mvhd.from + 28) : buf.readUInt32BE(mvhd.from + 20);
  const units = version === 1
    ? Number(buf.readBigUInt64BE(mvhd.from + 32)) : buf.readUInt32BE(mvhd.from + 24);
  assert.ok(timescale > 0, `${file} names a mvhd timescale of ${timescale}`);
  const info = { width: 0, height: 0, sound: false, seconds: units / timescale };
  for (const trak of walk(moov.from + 8, moov.to).filter((b) => b.type === 'trak')) {
    const inner = walk(trak.from + 8, trak.to);
    const mdia = inner.find((b) => b.type === 'mdia');
    const hdlr = mdia ? walk(mdia.from + 8, mdia.to).find((b) => b.type === 'hdlr') : null;
    const kind = hdlr ? buf.toString('latin1', hdlr.from + 16, hdlr.from + 20) : '';
    if (kind === 'soun') info.sound = true;
    if (kind !== 'vide') continue;
    const tkhd = inner.find((b) => b.type === 'tkhd');
    assert.ok(tkhd, `${file} has a video track with no tkhd`);
    const off = buf[tkhd.from + 8] === 1 ? 88 : 76;
    info.width = buf.readUInt32BE(tkhd.from + 8 + off) / 65536;
    info.height = buf.readUInt32BE(tkhd.from + 8 + off + 4) / 65536;
  }
  assert.ok(info.width, `${file} has no video track at all`);
  return info;
}

// A JPEG's own size, straight out of its start-of-frame marker.
function jpegSize(file) {
  const buf = readFileSync(path.join(root, file));
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const mark = buf[i + 1];
    if (mark >= 0xc0 && mark <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mark)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  assert.fail(`${file} has no start-of-frame marker`);
}

const clipShots = clipCards.flatMap((card) => cardAttr(card, 'imgs').split(',')
  .map((s) => s.trim()).filter(Boolean));

const plan = JSON.parse(read('tools/clip-crops.json'));
const planOf = new Map(plan.clips.map((row) => [row.clip, row]));

/* The owner's ask was not prettier clips: it was "only show the samples printing or packaging,
   not a wall or human face". Every one of these was filmed on a phone in the open shop, so the
   frame that came off the camera held a counter, a wall, or a stranger beside the press. The
   fix is a per-clip crop, which means the only proof that matters is the frame size the file
   actually carries — a plan nobody ran reads the same as a plan that was run. */
test('every shipped clip is the crop the plan chose', () => {
  assert.equal(plan.clips.length, clipShots.length,
    `the plan covers ${plan.clips.length} clips but the cards name ${clipShots.length}`);
  for (const shot of clipShots) {
    assert.ok(planOf.has(shot), `${shot} is offered to visitors but no crop was planned for it`);
  }
  for (const [clip, want] of planOf) {
    assert.ok(clipShots.includes(clip), `${clip} is in the plan but no card offers it`);
    const got = mp4Info(clip);
    assert.equal(`${got.width}x${got.height}`, `${want.w}x${want.h}`,
      `${clip} ships ${got.width}x${got.height}; the plan cut it to ${want.w}x${want.h} `
      + `(x=${want.x} y=${want.y}) to keep the print and drop the wall`);
  }
});

/* A crop can slide a rectangle over the frame, but it cannot reach into a take that spends
   half its length on a stranger holding blank paper and leave only the press. Where that
   happened the window was cut out of the take as well as across it, so the plan names the
   seconds the visitor gets — and a clip that quietly grew back to its full length would be
   showing the person the trim was meant to remove. */
test('a shipped clip runs as long as the plan cut it', () => {
  for (const [clip, want] of planOf) {
    assert.ok(want.dur > 0, `${clip} names no length, so nothing proves the cut landed`);
    if (want.t0 !== undefined) {
      assert.ok(want.dur <= want.t1 - want.t0 + 0.15,
        `${clip} plans ${want.dur}s, longer than the ${want.t0}–${want.t1}s window it was cut to`);
    }
    const got = mp4Info(clip).seconds;
    assert.ok(Math.abs(got - want.dur) < 0.15,
      `${clip} runs ${got.toFixed(1)}s but the plan cut it to ${want.dur}s`);
  }
});

/* Cropping a clip into a composition means rebuilding its sound track in the same breath, and
   an insert that fails takes the audio with it while the picture lands perfectly. A silent
   press is the exact defect this gate exists for, so the track has to be proved on the file
   rather than assumed from the tool that reported success. What it cannot say is WHICH sound
   is on there — presence of an `soun` track is true of the synthesised bed and of the owner's
   own recording alike. tools/soundprobe.swift is what hears the difference, and the figures it
   read off the shipped files are recorded in tools/clip-crops.json. */
test('every shipped clip still carries a sound track', () => {
  // The two ambient films are silent on purpose, and they are read by the same code: if the
  // reader called them tracks, a clip that lost its sound would pass for nothing.
  for (const film of ['video/coding-bg.mp4', 'video/coding-bg-lo.mp4']) {
    assert.ok(!mp4Info(film).sound, `${film} reads as carrying sound, so this test cannot tell `
      + 'a silent file from a clip whose bed was dropped');
  }
  for (const [clip] of planOf) {
    assert.ok(mp4Info(clip).sound, `${clip} has no audio track: the crop dropped the bed and `
      + 'the visitor would see a silent machine');
  }
});

/* The shelf cover and the clip must agree: js/catalog.js hands the poster to the <video> and
   paints the same face in the thumb strip, so an un-cropped poster beside a cropped clip shows
   the wall a visitor is about to be taken away from. The two tiers are the same picture at two
   widths, so both carry the aspect. */
test('a clip\'s poster shows the same crop as the clip', () => {
  for (const [clip, want] of planOf) {
    const base = clip.replace('video/', 'images/catalog/').replace(/\.mp4$/, '.jpg');
    for (const file of [base, base.replace('images/catalog/', 'images/catalog/hi/')]) {
      const got = jpegSize(file);
      const asked = want.w / want.h;
      const painted = got.width / got.height;
      assert.ok(Math.abs(painted - asked) / asked < 0.01,
        `${file} is ${got.width}x${got.height} (${asked.toFixed(3)} wanted) — the shelf would `
        + `show a different frame than the clip behind it`);
    }
  }
});

test('the print-sample cards exist and every shot they name is on disk', () => {
  assert.equal(clipCards.length, 4,
    'expected four VIDEO SAMPLES OF OUR PRINT OUT cards carrying clips');
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

/* Blink paints a video's own control row across the bottom of the stage, and its buttons sit
   at both ends of that strip. The shot counter has always stood bottom-inline-end — harmless
   over a photograph, but on a clip it lands in the control row, and the probe measured the
   Arabic corner reading `product-modal-count`: a visitor taps the chip and the print sample
   never goes full screen. So the chip leaves the strip the moment the stage turns to video. */
test('the clip stage lifts the shot counter out of the native control row', () => {
  const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const lifted = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /\.modal__gal\.is-clip[^{}]*\.modal__gal-count/.test(m[1]))
    .map((m) => m[2].replace(/\s+/g, ' '));
  assert.ok(lifted.length, 'nothing moves .modal__gal-count when the stage holds a clip, so the '
    + 'chip keeps standing in the row Blink paints its play/fullscreen buttons across');
  assert.ok(lifted.some((d) => /bottom\s*:\s*auto/.test(d) && /(^|;)\s*top\s*:/.test(d)),
    'the counter keeps a bottom offset, so it still overlaps the control row');
  // The top-inline-end corner is not free either: that is where the modal keeps its close
  // button, and the probe hit-tested the chip on top of it. Nor is inline-start the far corner
  // — the close sits at the physical right in Arabic as well as English, so only a physical
  // left anchor puts the counter somewhere nothing else is clicked.
  assert.ok(lifted.some((d) => /inset-inline-end\s*:\s*auto/.test(d) && /(^|;)\s*left\s*:/.test(d)),
    'the counter keeps a logical start corner, which in RTL is the same side the close button '
    + 'already holds');
});

// The worker holds an installed app's files in Cache Storage so a weak connection still
// opens the studio. 35 clips are 122 MB, which is the whole reason the shelf pays a poster:
// stored for good, they would eat a phone. The rule lives in one allowlist in sw.js, so this
// runs that file in a sandbox against the real shot list and asks the worker what it did.
test('the service worker keeps every clip out of the app cache', async () => {
  const vm = await import('node:vm');
  const shots = clipShots;
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

/* The owner's print samples were filmed on a phone in the shop, so every one of the 35
   clips carried a stranger's workshop on its own soundtrack — the probe read 25 stereo and
   10 mono tracks off the files. The owner's answer was not silence: mute the recording and
   give the clip a sound of its own. It was a synthesised press bed for a while, and then he
   sent his own 26-second recording of the press and asked for that instead — which is what
   every clip carries now, looped with a crossfade where a clip runs longer than the take
   (tools/clip-crops.json holds the measured figures). Either way the stage has to let sound
   through — `muted` here would throw the whole swap away and leave a silent press.
   Three pages host that one stage, and index.html and engineering.html host it for the same
   cards, so the rule has to hold on all three or the fix only works on the page it was made
   on. The two ambient coding films are a different case: they sit behind copy on an
   autoplaying page and must stay silent. */
test('the clip stage lets the press sound through and the ambient films stay silent', () => {
  let hosted = 0;
  for (const file of ['catalog.html', 'index.html', 'engineering.html']) {
    const videos = [...read(file).matchAll(/<video class="modal__clip"[^>]*>/g)];
    videos.forEach((v) => {
      hosted++;
      assert.ok(!/\smuted(\s|>)/.test(v[0]),
        `${file} mutes the stage, so the sound laid into every clip is never heard: ${v[0]}`);
    });
  }
  assert.equal(hosted, 3, `expected the stage on three pages, found ${hosted} — the shelf moved `
    + 'and this test would pass on nothing');
  for (const file of ['index.html', 'engineering.html']) {
    const films = [...read(file).matchAll(/<video class="(?:hero|reel)__film"[^>]*>/g)];
    assert.ok(films.length, `${file} no longer carries its ambient film — check before editing`);
    films.forEach((f) => {
      assert.match(f[0], /\smuted(\s|>)/, `${file} lets an ambient film speak over the page copy`);
    });
  }
});

/* Each card sells one piece of the studio's work, so a frame belonging to another product
   printed inside it reads as padding — and it did: the Winners' Chapel set carried
   other-flyers-2.jpg and flyer-4.jpg, which are also the fifth and second frames of two
   other cards. The gallery page for that item always showed only its own four frames, so
   the card, not the gallery, was the outlier. */
test('no catalog frame stands under two different products', () => {
  const cards = [...page.matchAll(/<article class="product-card"[\s\S]*?<\/article>/g)]
    .map((m) => m[0]);
  assert.ok(cards.length > 20, 'the card scan found almost nothing, so this test proves nothing');
  const owners = new Map();
  for (const card of cards) {
    const name = cardAttr(card, 'name');
    // The same fall-back js/catalog.js shotsOf() uses: a one-frame product names no data-imgs.
    const listed = card.match(/data-imgs="([^"]*)"/);
    const list = (listed ? listed[1] : cardAttr(card, 'img')).trim();
    for (const shot of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (owners.has(shot) && owners.get(shot) !== name) {
        assert.fail(`${shot} is offered as both "${owners.get(shot)}" and "${name}"`);
      }
      owners.set(shot, name);
    }
  }
});
