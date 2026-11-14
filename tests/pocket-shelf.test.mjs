// A phone must meet the catalog shelf in the arrangement it will keep. Measured on the live
// origin at 390x844 (throttled phone rig, 2026-11-14, page foregrounded so it actually
// paints — a hidden headless page produces 0 frames and bills 0.0000 for anything):
//
//   @508ms   cols=1   card 342x450   grid 13,811px   — the legacy base sheet
//   @886ms   cols=3   staged         doc 23,360      — js/pinband.js's first answer
//   @1030ms  cols=2   plain          doc 11,207      — its second answer, 144ms later
//   CLS 0.8216
//
// The two-column pocket arrangement the visitor ends on was only ever reachable through
// `.pinband--plain`, a class no markup contains: js/pinband.js adds it inside standAside().
// So the grid's column count was a JavaScript result, painted one way and corrected another,
// which is the thing the owner ruled out — "each band is sized once, before it is ever
// visible, and never re-sized". These tests hold the arrangement to the markup and the
// stylesheet instead, and hold the staged shelf to the numbers it was measured with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/* The marker that says "this strip is a pinned shelf, and a pocket lays it out two-up".
   Named in markup, so the answer exists before any script runs. */
const MARK = 'cards--pocket2';

/* The shelves the pinned driver arranges: a band that names its strip in data-pin and whose
   strip is a product grid. Anything else wearing .cards--3 — the about trio, the journal
   grid, the sponsored slots — is not a shelf and must keep the single column it has. */
const SHELVES = [
  { page: 'catalog.html', band: 'featured', strip: 'catalog-grid' },
  { page: 'engineering.html', band: 'web-catalog', strip: 'catalog-grid' },
];

/* Specificity as (a,b,c): ids, then classes/attributes/pseudo-classes, then elements. The
   pocket rules and the staged rules live in one media query, so this is the only thing that
   decides which of them a phone actually paints. */
function spec(sel) {
  const pseudoEl = (sel.match(/::[a-z-]+/gi) || []).length;
  const s = sel.replace(/::[a-z-]+/gi, '');
  const a = (s.match(/#[A-Za-z][\w-]*/g) || []).length;
  const b = (s.match(/\.[A-Za-z][\w-]*/g) || []).length
    + (s.match(/\[[^\]]*\]/g) || []).length
    + (s.match(/:(?!:)[a-z-]+/gi) || []).length;
  const c = (s.match(/(?:^|[\s>+~])[a-z][a-z0-9-]*/gi) || []).length + pseudoEl;
  return [a, b, c];
}
const wins = (a, b) => spec(a)[0] !== spec(b)[0] ? spec(a)[0] > spec(b)[0]
  : spec(a)[1] !== spec(b)[1] ? spec(a)[1] > spec(b)[1] : spec(a)[2] >= spec(b)[2];

/* The body of one @media block, by its condition. */
function mediaBlock(css, cond) {
  const at = css.indexOf(`@media ${cond}`);
  assert.ok(at >= 0, `no @media ${cond} in the stylesheet`);
  let depth = 0, i = css.indexOf('{', at);
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(css.indexOf('{', at) + 1, i);
}

function rules(body) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of selectors) out.push({ sel, decl: m[2] });
  }
  return out;
}

const css = strip(read('css/style.css'));
const pocket = rules(mediaBlock(css, '(max-width:480px)'));

for (const { page, band, strip: id } of SHELVES) {
  test(`${page} declares its shelf's pocket arrangement in the markup`, () => {
    const html = read(page);
    const open = html.match(new RegExp(`<section[^>]*id="${band}"[^>]*>`));
    assert.ok(open, `${page}: no <section id="${band}"> to hold the shelf`);
    assert.match(open[0], /data-pin="#catalog-grid"/, `${page}: ${band} does not name its strip`);
    const grid = html.match(new RegExp(`<div class="([^"]*)" id="${id}"`));
    assert.ok(grid, `${page}: no #${id} strip to arrange`);
    assert.ok(grid[1].split(/\s+/).includes(MARK),
      `${page}: #${id} carries "${grid[1]}" — the pocket column count is still a JavaScript result`);
  });
}

test('the pocket arrangement comes from the marker, not from a class no markup contains', () => {
  const cols = pocket.filter((r) => /grid-template-columns/.test(r.decl) && r.sel.includes(MARK));
  assert.ok(cols.length, `nothing gives .${MARK} a column count at pocket width`);
  assert.match(cols[0].decl.replace(/\s+/g, ''), /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    `.${cols[0].sel} does not decide two columns: ${cols[0].decl.trim()}`);
  /* pinband--plain is written by standAside() and cleared when the band stages again, so a
     rule keyed to it can only ever be a correction, never an answer given up front. */
  for (const r of cols) {
    assert.ok(!/pinband--plain/.test(r.sel), `.${r.sel} still waits for js/pinband.js to name it`);
  }
  const type = pocket.filter((r) => (/\bpadding\b|font-size/.test(r.decl)) && r.sel.includes(MARK));
  assert.ok(type.length >= 2, 'the pocket body padding and card name size are not both decided');
  for (const r of type) assert.ok(!/pinband--plain/.test(r.sel), `.${r.sel} is still JS-gated`);
});

test('the pocket marker never reaches a trio that is not a shelf', () => {
  const bare = pocket.filter((r) => /grid-template-columns/.test(r.decl)
    && /(^|,)\s*\.cards--[234]\b/.test(r.sel) && !r.sel.includes(MARK));
  for (const r of bare) {
    assert.fail(`.${r.sel} re-arranges every .cards-- trio on a pocket, including about.html and the journal grid`);
  }
});

test('a staged shelf keeps the card numbers it was measured with', () => {
  /* Live staged state, 390x844, catalog.html#featured: card body padding 19.2px 20px
     (= 1.2rem / 1.25rem) and card name 18px (= var(--t-h3)). Those are what the stage is
     built on, so moving the pocket rules onto a markup class may not take them away. */
  const staged = pocket.filter((r) => /pinband--paged/.test(r.sel));
  const pad = staged.filter((r) => /\bpadding\b/.test(r.decl) && /product-card__body/.test(r.sel));
  const size = staged.filter((r) => /font-size/.test(r.decl) && /product-card h3/.test(r.sel));
  assert.ok(pad.length, 'nothing restores the staged card body padding');
  assert.ok(size.length, 'nothing restores the staged card name size');
  const pocketPad = pocket.find((r) => /\bpadding\b/.test(r.decl) && r.sel.includes(MARK));
  const pocketSize = pocket.find((r) => /font-size/.test(r.decl) && r.sel.includes(MARK));
  for (const [guard, base] of [[pad[0], pocketPad], [size[0], pocketSize]]) {
    assert.ok(wins(guard.sel, base.sel),
      `.${guard.sel} (${spec(guard.sel)}) does not outrank .${base.sel} (${spec(base.sel)}) — the stage would wear pocket type`);
  }
  assert.match(pad[0].decl.replace(/\s+/g, ''), /padding:1\.2rem1\.25rem/, 'staged padding must be the measured 1.2rem/1.25rem');
  assert.match(size[0].decl, /font-size:\s*var\(--t-h3\)/, 'staged card name must be the measured --t-h3');
});
