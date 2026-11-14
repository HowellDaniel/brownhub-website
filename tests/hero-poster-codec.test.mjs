// The hero's first picture is the one thing a phone is told to wait for: the page preloads it
// at fetchpriority=high and the film band paints it as a <video poster>. It was the last picture
// on the home page still paying JPEG rates — 72 KB against the 18 KB the same pixels cost as
// AVIF — because a poster is a bare URL and cannot carry a <picture>. So the contract is split:
// the poster itself goes to the codec the preload already asks for, and every place the file is
// an <img> keeps a JPEG twin behind an AVIF <source>, which is where a wrapper is allowed.
// The trade is deliberate and measured: an engine that cannot decode AVIF is left with the
// stage's own ink band — rgb(27,11,12) under the film, sampled flat at stddev 0 — not a black
// slab, which is what ambient.js promises when it drops an unsupported clip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'engineering.html']
  .map((p) => ({ file: p, html: readFileSync(path.join(root, p), 'utf8') }));

const VIDEO = /<video\b[^>]*>/g;
const posterOf = (tag) => (tag.match(/\bposter="([^"]+)"/) || [])[1];
const isAvif = (u) => /\.avif(\?|#|$)/i.test(u);

test('every film poster is the codec the boot pipe already asks for', () => {
  const offenders = [];
  for (const { file, html } of pages) {
    for (const [tag] of html.matchAll(VIDEO)) {
      const poster = posterOf(tag);
      if (poster && !isAvif(poster)) offenders.push(`${file}: poster=${poster}`);
    }
  }
  assert.deepEqual(offenders, [],
    'a poster is a bare URL that cannot carry a <picture>, so the only choice is the file it names');
});

test('the hero poster is preloaded in the codec the poster actually names', () => {
  const offenders = [];
  for (const { file, html } of pages) {
    for (const [tag] of html.matchAll(VIDEO)) {
      // Only the hero paints at first. Under reduced motion or save-data the boot pipe returns
      // before it assigns a src, so the poster is the whole picture — and the poster is what the
      // phone was told to wait for. A band further down the page must NOT be preloaded: it would
      // spend the pipe on a picture nobody has scrolled to yet.
      if (!/class="[^"]*\bhero__film\b/.test(tag)) continue;
      const poster = posterOf(tag);
      const preloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)]
        .map((m) => m[0]).filter((t) => /as="image"/.test(t));
      if (!poster || !preloads.some((t) => t.includes(poster))) {
        offenders.push(`${file}: nothing preloads ${poster || tag}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'the hero poster is the highest-priority picture on the page; leaving it unpreloaded makes the '
    + 'phone wait for the parser to reach the video before it may even ask');
});

test('a poster moved to AVIF keeps its JPEG twin railed wherever it is an <img>', () => {
  const offenders = [];
  for (const { file, html } of pages) {
    const posters = [...html.matchAll(VIDEO)].map((m) => posterOf(m[0])).filter(Boolean).filter(isAvif);
    for (const poster of posters) {
      const jpg = poster.replace(/\.avif$/i, '.jpg');
      assert.ok(existsSync(path.join(root, jpg)),
        `${jpg} is gone, so an engine that cannot decode AVIF has nothing to fall back to`);
      const [avifM, jpgM] = [poster, jpg].map((f) => statSync(path.join(root, f)).mtimeMs);
      assert.ok(avifM >= jpgM,
        `${jpg} is newer than ${poster}, so the hero is serving pixels nobody re-cut: `
        + `sips -s format avif -s formatOptions 58 ${jpg} --out ${poster}`);
      for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
        if (m[1] !== jpg) continue;
        const open = html.lastIndexOf('<picture', m.index);
        const close = html.lastIndexOf('</picture>', m.index);
        const wrapped = open !== -1 && open > close;
        const source = wrapped ? html.slice(open, m.index) : '';
        if (!/type="image\/avif"/.test(source)) {
          offenders.push(`${file}: <img src="${jpg}"> has no AVIF <source> in front of it`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    'a poster cannot take a wrapper, but an <img> of the same file can — leaving one bare strands that '
    + 'visitor on the codec the poster abandoned');
});
