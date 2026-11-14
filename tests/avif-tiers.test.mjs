// A codec is not a resolution. The wall's tiles proved the rule the hard way, so this
// file keeps it: a picture may prefer its AVIF copy, but the AVIF must be the *same*
// candidates at the same widths, or the phone that was told to buy 608w quietly buys
// 1600w in a cheaper codec and the byte saving is a lie told to the compositor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pages = () => {
  const out = [];
  for (const dir of ['', 'gallery', 'blog']) {
    const base = path.join(root, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const full = path.join(base, name);
      if (statSync(full).isFile() && name.endsWith('.html')) out.push(dir ? `${dir}/${name}` : name);
    }
  }
  return out;
};

const candidates = (srcset) => srcset.split(',').map((c) => c.trim()).filter(Boolean);

/* An <img> that offers a phone two resolutions of the same still, under a directory the
   rail encodes. A <video poster> is not in this set because it cannot be: a bare URL carries
   no <picture>, so the hero's poster is railed by hand and tests/hero-poster-codec.test.mjs
   keeps that hand-cut honest. */
const TIERED = /<img\b[^>]*\bsrc="(images\/(?:catalog|home|brand|collection)\/[^"]+\.jpg)"[^>]*\bsrcset="([^"]*\/hi\/[^"]+)"[^>]*>/gi;
const SIZES = /\ssizes="([^"]*)"/i;

function rails(html) {
  const found = [];
  for (const m of html.matchAll(TIERED)) {
    const start = m.index;
    // Wrapped means a <picture> opened with a <source> ahead of the img, no other tag between.
    const before = html.slice(Math.max(0, start - 400), start);
    const open = before.lastIndexOf('<picture>');
    const between = open >= 0 ? before.slice(open + 9) : '';
    const wrapped = open >= 0 && !/<img\b[^>]*>/.test(between) && !/<\/picture>/.test(between);
    const source = wrapped ? /<source type="image\/avif" srcset="([^"]*)"(?: sizes="([^"]*)")?>\s*$/.exec(between) : null;
    found.push({
      at: start,
      src: m[1],
      imgSet: m[2],
      imgSizes: (SIZES.exec(m[0]) || [])[1] || '',
      wrapped,
      srcset: source ? source[1] : '',
      sizes: source ? source[2] || '' : '',
    });
  }
  return found;
}

test('every tiered still offers its AVIF at the same widths', () => {
  let encoded = 0;
  for (const page of pages()) {
    for (const rail of rails(readFileSync(path.join(root, page), 'utf8'))) {
      assert.ok(rail.wrapped, `${page}: ${rail.src} still makes a phone buy its JPEG at every tier`);
      encoded++;
      const want = candidates(rail.imgSet).map((c) => {
        const [url, w] = c.split(/\s+/);
        return `${url.replace(/\.jpg$/, '.avif')} ${w}`;
      });
      assert.deepEqual(candidates(rail.srcset), want,
        `${page}: the AVIF source for ${rail.src} offers a different set of copies than the <img> it stands in for`);
      /* A <source> with no sizes clause is read as 100vw, so the phone would demand
         three times the viewport and take the widest candidate in the cheaper codec —
         the same over-ask the tiles lost, paid in a different file type. */
      assert.equal(rail.sizes, rail.imgSizes,
        `${page}: the AVIF source for ${rail.src} sizes itself "${rail.sizes}" while its <img> says "${rail.imgSizes}"`);
      for (const c of candidates(rail.srcset)) {
        const file = path.join(root, c.split(/\s+/)[0]);
        assert.ok(existsSync(file), `${page}: the rail points at ${c.split(/\s+/)[0]}, which is not on disk`);
      }
    }
  }
  assert.ok(encoded >= 30, `expected the site's tiered stills, found ${encoded}`);
});

test('the AVIF copy never costs more than the JPEG it replaces', () => {
  const checked = new Set();
  for (const page of pages()) {
    for (const rail of rails(readFileSync(path.join(root, page), 'utf8'))) {
      if (!rail.wrapped) continue;
      for (const c of candidates(rail.srcset)) {
        const avif = c.split(/\s+/)[0];
        if (checked.has(avif)) continue;
        checked.add(avif);
        const jpg = path.join(root, avif.replace(/\.avif$/, '.jpg'));
        const a = statSync(path.join(root, avif)).size;
        const j = statSync(jpg).size;
        assert.ok(a < j, `${avif} is ${a} bytes against ${path.basename(jpg)} at ${j} — the encode is not cheaper, so the rail is buying bytes, not saving them`);
      }
    }
  }
  assert.ok(checked.size >= 40, `expected the rail's encodes, found ${checked.size}`);
});

/* A picture the pages show twice — once as a tiered card, once as a single-copy still —
   used to share one cached file, so the second view was free. Once the card prefers its
   AVIF the two asks split: the page pays for the JPEG again beside the AVIF it already
   bought. Home's pinned story did exactly that to `flyer.jpg` and `book-design-5.jpg`.
   A single candidate needs no `sizes` (there is nothing to choose between), so the rail
   only has to name the copy. */
const SINGLE = /<img\b(?![^>]*\bsrcset=)[^>]*\bsrc="(images\/(?:catalog|home|brand|collection)\/[^"]+\.jpg)"[^>]*>/gi;
const WRAPPED_BEFORE = /<source type="image\/avif" srcset="([^"]*)">\s*$/;

test('a single-copy still takes its AVIF when one exists', () => {
  let wrapped = 0;
  const stubborn = [];
  for (const page of pages()) {
    const html = readFileSync(path.join(root, page), 'utf8');
    for (const m of html.matchAll(SINGLE)) {
      /* js/catalog.js rotates a product's photos by writing img.src at runtime; a source
         pinned at parse time would outlive that write and keep showing the first frame. */
      if (/\bdata-src="/i.test(m[0])) continue;
      const avif = path.join(root, m[1].replace(/\.jpg$/, '.avif'));
      if (!existsSync(avif)) continue;
      const source = WRAPPED_BEFORE.exec(html.slice(Math.max(0, m.index - 300), m.index));
      if (source && source[1] === m[1].replace(/\.jpg$/, '.avif')) wrapped++;
      else stubborn.push(`${page}: ${m[1]}`);
    }
  }
  assert.deepEqual(stubborn, [], 'these stills paint a JPEG whose cheaper AVIF is already on disk');
  assert.ok(wrapped >= 20, `expected the single-copy rail, found ${wrapped}`);
});

/* The preload is the one place a wrong codec is invisible: the plate-tiers guard makes it
   name the exact candidates the <img> carries, and once the plate is wrapped that is no
   longer what gets painted. A preload of the JPEG set on an AVIF engine is the picture
   fetched twice — once in a codec nobody uses — which is exactly the dead-bytes defect the
   wall lost. So the preload follows the source. */
test('a wrapped plate preloads the copy it will paint, not the one it will skip', () => {
  let wrappedHeroes = 0;
  for (const page of pages()) {
    const html = readFileSync(path.join(root, page), 'utf8');
    for (const rail of rails(html)) {
      if (!rail.wrapped) continue;
      const context = html.slice(Math.max(0, rail.at - 900), rail.at);
      if (!/class="page-hero\b/.test(context)) continue;
      wrappedHeroes++;
      const head = html.slice(0, html.indexOf('</head>'));
      const asked = [...head.matchAll(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/gi)]
        .filter((m) => (/\simagesrcset="([^"]*)"/i.exec(m[0]) || [])[1] === rail.srcset
          && (/\simagesizes="([^"]*)"/i.exec(m[0]) || [])[1] === rail.sizes)[0];
      assert.ok(asked,
        `${page}: the hero plate paints ${rail.srcset} but its preload still names ${rail.imgSet} — the phone buys the JPEG it will not show`);
    }
  }
  assert.equal(wrappedHeroes, 3, 'expected Catalog, Services and About to lead with a wrapped tiered plate');
});

/* An encode is a photograph of a JPEG taken on the day it was cut. Re-cut the artwork, leave
   the AVIF beside it, and the site splits in two: an AVIF engine shows the picture that no
   longer exists while a Safari shows the new one, from one URL, with nothing failing to say so.
   The rail will not catch this itself — it skips a file it has already encoded unless it is
   told --force — so the date order is what proves the pair still describes one picture. */
function everyAvif(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) everyAvif(full, found);
    else if (entry.name.endsWith('.avif')) found.push(full);
  }
  return found;
}

test('no encode is older than the picture it stands in for', () => {
  const stale = [];
  let pairs = 0;
  for (const avif of everyAvif(path.join(root, 'images'))) {
    for (const ext of ['.jpg', '.png']) {
      const twin = avif.slice(0, -'.avif'.length) + ext;
      if (!existsSync(twin)) continue;
      pairs++;
      if (statSync(twin).mtimeMs > statSync(avif).mtimeMs) {
        stale.push(`${path.relative(root, twin)} is newer than ${path.relative(root, avif)} — re-cut it: `
          + `sips -s format avif -s formatOptions 58 ${path.relative(root, twin)} --out ${path.relative(root, avif)}`);
      }
    }
  }
  assert.deepEqual(stale, [], 'these AVIFs are a stale encode of artwork that has since changed');
  assert.ok(pairs >= 200, `expected the rail's encodes to be checked, found ${pairs} pairs`);
});
