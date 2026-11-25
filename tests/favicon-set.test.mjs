// Google paints the site icon at 16-32px in the organic result and at ~16px in the AI
// Overview chip and the image row. What it was painting is the app badge: the whole
// lockup, wordmark and tagline included, shrunk until the letters are mush. On top of
// that, /favicon.ico — the one path every crawler, browser and third-party service asks
// for before it reads a single <link> — answered 404.
//
// This file holds the two promises the fix has to keep: the small sizes exist and are
// declared on every page, and every one of them was rasterised straight out of the
// vector master at its own device size. An upscale of a 128px PNG would pass a "file is
// 512 wide" check and still paint a blur, so the provenance ledger is the real gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function pngSize(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, 'not a PNG signature');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ICO: 6-byte header, then one 16-byte directory entry per image. Width and height are
// stored minus one, so a 256px image reads as 0 — which is why the sizes are taken from
// the payload, not the directory byte.
function icoEntries(buf) {
  assert.equal(buf.readUInt16LE(0), 0, 'ICO reserved field must be zero');
  assert.equal(buf.readUInt16LE(2), 1, 'ICO type must be 1 (icon)');
  const count = buf.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const bytes = buf.readUInt32LE(off + 8);
    const at = buf.readUInt32LE(off + 12);
    const isPng = buf.readUInt32BE(at) === 0x89504e47;
    const size = isPng ? pngSize(buf.subarray(at, at + bytes)).width
      : buf.readUInt32LE(at + 4); // BITMAPINFOHEADER width; height is doubled (image + AND mask)
    out.push({ width: size, bytes, at, kind: isPng ? 'png' : 'bmp' });
  }
  return out;
}

function pagesWithIcons(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.worktrees') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pagesWithIcons(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

const ICON_SIZES = [16, 32, 48, 64];

test('the root favicon.ico exists and carries the small sizes', () => {
  const file = join(ROOT, 'favicon.ico');
  assert.ok(existsSync(file), '/favicon.ico is the first path a crawler asks for');
  const buf = readFileSync(file);
  const entries = icoEntries(buf);
  const widths = entries.map((e) => e.width);
  for (const want of ICON_SIZES) {
    assert.ok(widths.includes(want), `favicon.ico has no ${want}px entry (has ${widths.join(',')})`);
  }
  assert.ok(entries.every((e) => e.bytes > 0 && e.at + e.bytes <= buf.length),
    'an entry pointing past the end of the file is a broken icon');
});

test('every icon in the set is the square it claims to be', () => {
  for (const [file, px] of [
    ['icons/favicon-16.png', 16], ['icons/favicon-32.png', 32],
    ['icons/favicon-192.png', 192], ['icons/favicon-512.png', 512],
    ['icons/apple-touch-icon.png', 180],
  ]) {
    const { width, height } = pngSize(readFileSync(join(ROOT, file)));
    assert.equal(width, px, `${file} is ${width} wide, named for ${px}`);
    assert.equal(height, px, `${file} is ${height} tall, named for ${px}`);
  }
});

// The high-resolution promise: each raster came from the master's curves at its own
// device size. pt_scale is the pixels-per-point the canvas was drawn at, so a 16px icon
// still sees a real 16px raster rather than a 512px one averaged down.
test('the icon set was cut from the vector master, never resampled', () => {
  const ledger = JSON.parse(read('icons/favicon-set.json'));
  assert.equal(ledger.source, 'tools/logo-master.svg', 'the icons must come from the curves');
  assert.ok(ledger.sizes.length >= 6, 'the ledger should cover the whole set');
  for (const entry of ledger.sizes) {
    assert.equal(entry.resampled, false, `${entry.file} was resized from another bitmap`);
    assert.ok(entry.px_per_pt >= 0.1, `${entry.file} has no real rasterisation scale`);
    const { width } = pngSize(readFileSync(join(ROOT, entry.file)));
    assert.equal(width, entry.px, `${entry.file} is ${width}px, ledger says ${entry.px}px`);
  }
});

test('every page that declares an icon declares the whole set', () => {
  const wrong = [];
  for (const file of pagesWithIcons(ROOT)) {
    const src = readFileSync(file, 'utf8');
    const links = src.match(/<link\b[^>]*rel="icon"[^>]*>/g) || [];
    const touch = src.match(/<link\b[^>]*rel="apple-touch-icon"[^>]*>/g) || [];
    if (!links.length && !touch.length) continue;
    const rel = [...links, ...touch].join('\n');
    if (!/href="\/favicon\.ico"/.test(rel)) wrong.push(file.replace(ROOT + '/', '') + ': no /favicon.ico');
    for (const px of [32, 192]) {
      if (!new RegExp(`sizes="${px}x${px}"[^>]*href="/icons/favicon-${px}\\.png"`).test(rel)) {
        wrong.push(file.replace(ROOT + '/', '') + `: no ${px}x${px} icon`);
      }
    }
    if (!/rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/.test(rel)) {
      wrong.push(file.replace(ROOT + '/', '') + ': no apple-touch icon');
    }
    // A relative href is a different file at a different depth; the set is absolute.
    for (const m of rel.matchAll(/href="([^"]+)"/g)) {
      if (!m[1].startsWith('/')) wrong.push(file.replace(ROOT + '/', '') + `: ${m[1]} is not absolute`);
      else if (!existsSync(join(ROOT, m[1].slice(1)))) wrong.push(file.replace(ROOT + '/', '') + `: ${m[1]} is not on disk`);
    }
  }
  assert.deepEqual(wrong, [], 'an icon Google cannot find is an icon it will not paint');
});

test('the installed app keeps its own badge while the web set is separate', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const declared = manifest.icons.map((i) => i.src);
  assert.ok(declared.includes('/icons/icon-512.png'), 'the app icon is the owner-approved badge');
  assert.ok(!declared.some((s) => /favicon/.test(s)), 'the small-size web mark is not the app badge');
});

test('the service worker precaches the favicon it is about to be asked for', () => {
  const shell = read('sw.js');
  assert.match(shell, /"\/favicon\.ico"/, 'a 404 on first paint is remembered by the cache');
  assert.match(shell, /"\/icons\/apple-touch-icon\.png"/, 'the touch icon belongs to the shell');
});
