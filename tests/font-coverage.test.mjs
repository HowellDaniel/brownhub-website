// A unicode-range is a promise to the browser: "if you need this character, I have it".
// When the promise is broader than the file, the phone pays for the download and still
// paints the glyph from the system face — the worst of both. That is exactly how the
// cedi sign behaved: the site writes GH₵ in its prices, U+20B5 sat inside the latin-ext
// range, and the shipped Hanken subset has no cedi glyph at all, so every priced page
// bought 19.4KB to render nothing new. This file keeps the promise and the file in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

/* What the shipped files really carry, as U+nnnn pairs. Generated from the fonts' own
   cmap tables by tools/fontcoverage.py — regenerate it if a subset is ever re-cut. */
const coverage = JSON.parse(read('fonts/coverage.json'));
const covers = (name, cp) =>
  (coverage[name] || []).some((r) => cp >= parseInt(r[0].slice(2), 16) && cp <= parseInt((r[1] || r[0]).slice(2), 16));

const FACE = /@font-face\s*\{[^}]*\}/g;
const toSet = (text) => {
  const out = [];
  for (const m of text.matchAll(/U\+([0-9A-Fa-f]{2,6})(?:-([0-9A-Fa-f]{2,6}))?/g)) {
    out.push([parseInt(m[1], 16), parseInt(m[2] || m[1], 16)]);
  }
  return out;
};

function faces(css) {
  const list = [];
  for (const block of css.match(FACE) || []) {
    const src = block.match(/url\(\.\.\/fonts\/([^)?]+)\)/);
    const range = block.match(/unicode-range:([^;}]+)/);
    if (src && range) list.push({ file: src[1], ranges: toSet(range[1]) });
  }
  return list;
}

/* Codepoints the visitor is actually offered: the English pages' own prose and every
   dictionary, because a language switch renders those strings in the brand face. */
function contentCodepoints() {
  const cps = new Map();
  const note = (text, from) => {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) continue;
      if (!cps.has(cp)) cps.set(cp, new Set());
      cps.get(cp).add(from);
    }
  };
  for (const dir of ['', 'gallery', 'blog']) {
    const base = path.join(root, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const full = path.join(base, name);
      if (!statSync(full).isFile() || !name.endsWith('.html')) continue;
      let html = read(path.join(dir, name));
      html = html.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
      note(html.replace(/<[^>]+>/g, ' '), `${dir ? dir + '/' : ''}${name}`);
    }
  }
  for (const name of readdirSync(path.join(root, 'i18n'))) {
    if (!name.endsWith('.json')) continue;
    const raw = read(`i18n/${name}`);
    note(raw, `i18n/${name}`);
  }
  return cps;
}

test('the stylesheet ships every font file the manifest describes', () => {
  for (const f of Object.keys(coverage)) {
    assert.ok(existsSync(path.join(root, 'fonts', f)), `manifest names fonts/${f}, which is not there`);
  }
  for (const face of faces(read('css/style.css'))) {
    assert.ok(coverage[face.file], `@font-face points at fonts/${face.file}, which the manifest does not cover`);
  }
});

/* Gaps the stylesheet cannot close: the typeface simply has no glyph, and the range
   cannot be narrowed to drop it without also dropping neighbours another language
   really needs. Listing them here costs nothing in bytes, because a page written in
   those scripts already buys the face for the diacritics it does carry — Twi needs
   latin-ext for ń ŋ ǹ, Persian for ç ş. A glyph that is the *only* non-latin ask on a
   page is different: that is what the cedi sign was, and it is not in this list. If a
   future subset ever carries one of these, the last assertion says so and the line
   comes out. */
const NO_GLYPH = {
  'U+0186': 'Ɔ — Hanken Grotesk has no open O; Twi paints it from the system face',
  'U+0190': 'Ɛ — no open E; ditto',
  'U+0254': 'ɔ — lowercase open o; ditto',
  'U+025B': 'ɛ — lowercase open e; ditto',
  'U+026B': 'ɫ — l with stroke, Ewe and Polish; ditto',
  'U+02BC': 'ʼ — the Greek script apostrophe el.json uses; absent from latin',
  'U+200C': '‌ — ZWNJ, Persian word joiner; invisible, so nothing visibly falls back',
};

const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

test('no character the site prints is promised by a range and missing from the file', () => {
  const list = faces(read('css/style.css'));
  const offenders = [];
  const stillMissing = new Set(Object.keys(NO_GLYPH));
  for (const [cp, where] of contentCodepoints()) {
    const claiming = list.filter((face) => face.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
    if (!claiming.length) continue; // not the brand face's business — it falls through by design
    if (claiming.some((face) => covers(face.file, cp))) {
      stillMissing.delete(hex(cp));
      continue;
    }
    if (NO_GLYPH[hex(cp)]) continue;
    offenders.push(`${hex(cp)} "${String.fromCodePoint(cp)}" ` +
      `claimed by ${claiming.map((c) => c.file).join(', ')} but carried by none — asked for by ${[...where][0]}`);
  }
  assert.deepEqual(offenders, [], 'unicode-range is promising glyphs the subset does not contain');
  assert.deepEqual([...stillMissing].sort(), Object.keys(NO_GLYPH).sort(),
    'these gaps are listed as unfixable but the shipped subsets no longer have them — take them out of NO_GLYPH');
});

test('the minified stylesheet carries the same unicode-ranges as the source', () => {
  const parse = (css) => faces(css).map((f) => `${f.file}:${f.ranges.map(([lo, hi]) => (lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`)).join(',')}`).sort();
  assert.deepEqual(parse(read('css/style.min.css')), parse(read('css/style.css')),
    'css/style.min.css was not rebuilt after the source changed');
});
