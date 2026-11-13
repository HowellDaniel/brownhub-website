import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { minify } from '../tools/minify-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const authored = readFileSync(path.join(root, 'css/style.css'), 'utf8');
const shippedPath = path.join(root, 'css/style.min.css');
const shipped = (() => {
  try {
    return readFileSync(shippedPath, 'utf8');
  } catch {
    return null;
  }
})();

// The phone pays for this file before it paints a single word, and GitHub Pages only
// gzips it. Comments and indentation were 62% of what came down the pipe.
const pages = (() => {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    const base = path.join(root, dir);
    for (const name of readdirSync(base)) {
      if (name.endsWith('.html')) found.push(path.join(dir, name));
    }
  }
  return found;
})();

const sheetLinks = (file) => {
  const html = readFileSync(path.join(root, file), 'utf8');
  return [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)]
    .map((m) => (m[0].match(/href="([^"]+)"/) || [])[1] || '')
    .filter((href) => /style(\.min)?\.css/.test(href));
};

test('minifying keeps every space that carries meaning', () => {
  const cases = [
    ['a{margin:calc(100% - 20px)}', 'calc(100% - 20px)'],
    ['a{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}', 'repeat(auto-fit'],
    ['@media (min-width:700px) and (max-width:900px){a{color:red}}', ') and ('],
    ['.card .title{color:red}', '.card .title'],
    ['a{font:700 16px/1.4 "Hanken Grotesk", sans-serif}', '700 16px/1.4'],
    ['a{content:"  a ; b  "}', 'content:"  a ; b  "'],
    ['a{background:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'/>")}', 'data:image/svg+xml;utf8'],
    ['a{transition:color .2s ease,transform .2s}', 'color .2s ease'],
    ['a{width:min(44rem,90vw)}', 'min(44rem,90vw)'],
    ['a{padding:0 1rem 0 calc(1rem + 2px)}', '0 1rem 0 calc(1rem + 2px)'],
  ];
  for (const [input, mustSurvive] of cases) {
    const out = minify(input);
    assert.ok(out.includes(mustSurvive),
      `"${mustSurvive}" was mangled to ${JSON.stringify(out)}`);
  }
});

test('minifying drops the bytes nobody reads', () => {
  const out = minify('/* a note */\n.a {\n  color: red;\n  padding: 0 1rem;\n}\n\n');
  assert.equal(out, '.a{color:red;padding:0 1rem}');
});

test('the shipped sheet is today\'s minification of the authored one', () => {
  assert.ok(shipped !== null, 'css/style.min.css is missing — run node tools/minify-css.mjs');
  assert.equal(shipped.replace(/\n$/, ''), minify(authored),
    'css/style.min.css is stale — run node tools/minify-css.mjs');
});

test('the sheet the phone downloads is materially lighter than the one that was written', () => {
  assert.ok(shipped !== null, 'css/style.min.css is missing — run node tools/minify-css.mjs');
  const before = gzipSync(authored, { level: 9 }).length;
  const after = gzipSync(shipped, { level: 9 }).length;
  assert.ok(after < before * 0.6,
    `only ${(100 * (1 - after / before)).toFixed(0)}% off the wire (${after} vs ${before} gzipped bytes)`);
});

test('the shipped sheet says exactly what the authored sheet says, minus the notes', () => {
  assert.ok(shipped !== null, 'css/style.min.css is missing — run node tools/minify-css.mjs');
  const squashed = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')
    .replace(/;+(?=})/g, '');
  assert.equal(squashed(shipped), squashed(authored),
    'a rule or a space that carries meaning disappeared in the shipped sheet');
  assert.ok(!shipped.includes('/*'), 'the shipped sheet still carries notes');
});

// Comments are whitespace to a CSS parser, so they vanish here the same way. Splitting the
// rest on whitespace and commas leaves the words themselves, which is the one thing a
// minifier may never change: it may take out the gap between two words, but it may not weld
// the words together. `body[x] :is(y)` and `body[x]:is(y)` print almost alike yet mean
// different things — the first styles descendants, the second the element itself — and they
// are two tokens against one, so this catches what a character-by-character comparison can
// glide over.
const words = (text) => {
  const raw = [];
  let cur = '';
  let q = null;
  const push = () => { if (cur) { raw.push(cur); cur = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      cur += c;
      if (c === '\\') { cur += text[++i] || ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      push();
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (/[\s,;{}]/.test(c)) { push(); continue; }
    cur += c;
  }
  push();
  // `color: red` and `color:red` are one word to a parser; weld them back so the only
  // spacing this comparison can still see is spacing that carries meaning.
  const out = [];
  for (const w of raw) {
    if (out.length && out[out.length - 1].endsWith(':')) out[out.length - 1] += w;
    else out.push(w);
  }
  return out;
};

test('the two sheets are built from the same words in the same order', () => {
  assert.ok(shipped !== null, 'css/style.min.css is missing — run node tools/minify-css.mjs');
  const a = words(authored);
  const b = words(shipped);
  const at = a.findIndex((w, i) => w !== b[i]);
  assert.equal(b.length, a.length,
    `the shipped sheet has ${b.length} words against the authored sheet's ${a.length}`);
  assert.equal(at, -1,
    `word #${at}: authored ${JSON.stringify(a[at])} shipped ${JSON.stringify(b[at])}`);

  // The guard earns its place on this pair: same characters, different selectors, different
  // elements styled.
  assert.deepEqual(words('body[x] :is(y){color:red}'), ['body[x]', ':is(y)', 'color:red']);
  assert.deepEqual(words('body[x]:is(y){color:red}'), ['body[x]:is(y)', 'color:red']);
});

test('every page asks the phone for the minified sheet', () => {
  const offenders = [];
  for (const file of pages) {
    for (const href of sheetLinks(file)) {
      if (!/^(?:\.\.\/)?css\/style\.min\.css\?v=\d+$/.test(href)) offenders.push(`${file} -> ${href}`);
    }
  }
  assert.deepEqual(offenders, [], 'pages still linked to the authored sheet');
});

test('one cache-ledger version for the sheet across every page', () => {
  const seen = new Map();
  for (const file of pages) {
    for (const href of sheetLinks(file)) {
      const version = href.split('?v=')[1];
      if (!version) continue;
      if (!seen.has(version)) seen.set(version, []);
      seen.get(version).push(file);
    }
  }
  assert.equal(seen.size, 1,
    `the sheet carries ${[...seen.entries()].map(([v, f]) => `v=${v} (${f.length} pages)`).join(', ')}`);
});
