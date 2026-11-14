// The nav mark must reserve the box it is going to paint. An <img> with a
// width/height pair that contradicts the file's own pixels makes the header
// re-pop at decode, and a stylesheet that gives both edges a foreign ratio
// crushes the artwork. Both come from the same stale fact: the logo used to be
// a wide lockup, and images/logo.png is a square canvas now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// PNG stores its size big-endian in the IHDR that follows the 8-byte signature.
function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, 'not a PNG signature');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const MARK = pngSize(join(ROOT, 'images/logo.png'));
const RATIO = MARK.width / MARK.height;

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.worktrees') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function attr(tag, name) {
  return (tag.match(new RegExp("\\b" + name + '=["\']?([0-9]+)', "i")) || [])[1];
}

test('every logo mark declares the file\'s own box', () => {
  const wrong = [];
  for (const file of pages(ROOT)) {
    const src = readFileSync(file, 'utf8');
    for (const tag of src.match(/<img\b[^>]*>/g) || []) {
      if (!/logo\.png/.test(tag)) continue;
      const w = attr(tag, 'width'), h = attr(tag, 'height');
      if (!w || !h) { wrong.push(file + ': no box declared'); continue; }
      if (Math.abs(Number(w) / Number(h) - RATIO) > 0.02) {
        wrong.push(file + ': declares ' + w + 'x' + h + ', the file is ' +
          MARK.width + 'x' + MARK.height);
      }
    }
  }
  assert.deepEqual(wrong, [], 'a mark painted before its file lands moves the header');
});

// A rule that fixes both edges at a foreign ratio paints the mark distorted,
// because an <img> with no object-fit is stretched to the box it is given.
test('no stylesheet paints the mark at a foreign ratio', () => {
  const bad = [];
  for (const sheet of ['css/style.css', 'css/offline.css']) {
    const css = readFileSync(join(ROOT, sheet), 'utf8');
    for (const rule of css.match(/[^{}]+\{[^{}]*\}/g) || []) {
      const sel = rule.split('{')[0].trim();
      if (!/logo-img|\.off img|logo\b/.test(sel)) continue;
      const w = (rule.match(/(^|[;\s])width:\s*([0-9.]+)px/) || [])[2];
      const h = (rule.match(/(^|[;\s])height:\s*([0-9.]+)px/) || [])[2];
      if (!w || !h) continue;
      if (Math.abs(Number(w) / Number(h) - RATIO) > 0.02) {
        bad.push(sheet + ' {' + sel + '} paints ' + w + 'x' + h);
      }
    }
  }
  assert.deepEqual(bad, [], 'the mark is artwork, not a shape to be squeezed');
});
