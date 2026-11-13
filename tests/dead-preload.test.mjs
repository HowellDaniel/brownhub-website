// A preload is a promise to use the bytes. Blink charges the phone for them either
// way, so a picture preloaded by a page that never paints it is a pure loss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SHEET = readFileSync(join(ROOT, 'css/style.css'), 'utf8');

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === '.git' || name === 'node_modules') continue;
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

const PRELOAD = /<link\b[^>]*rel=["']preload["'][^>]*>/g;

function deadPreloads(file) {
  const src = readFileSync(file, 'utf8');
  const body = src.replace(/<!--[\s\S]*?-->/g, '');
  const dead = [];
  for (const tag of body.match(PRELOAD) || []) {
    if (!/as=["']image["']/.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)["']/) || [])[1];
    if (!href) continue;
    const name = href.split('/').pop().split('?')[0];
    const rest = body.replace(tag, '');
    // Painted by markup, or by the sheet the page loads, counts as used.
    if (rest.includes(name) || SHEET.includes(name)) continue;
    dead.push(href);
  }
  return dead;
}

test('no page preloads a picture it never shows', () => {
  const offenders = [];
  for (const file of pages(ROOT)) {
    for (const href of deadPreloads(file)) {
      offenders.push(`${file.slice(ROOT.length + 1)} -> ${href}`);
    }
  }
  assert.deepEqual(offenders, [], `dead image preloads (each one is a phone paying for bytes it will not paint):\n${offenders.join('\n')}`);
});

test('the gallery pages carry no hero preload, the wall does', () => {
  // The wall paints its plate and must keep its preload; the collection pages have
  // no plate at all, so the line they inherited from the donor has to stay gone.
  const wall = readFileSync(join(ROOT, 'gallery.html'), 'utf8');
  assert.ok(/rel="preload" as="image"/.test(wall), 'the wall lost the preload its plate needs');
  assert.equal(deadPreloads(join(ROOT, 'gallery.html')).length, 0);
  const hub = readFileSync(join(ROOT, 'gallery/index.html'), 'utf8');
  assert.ok(!/as="image"/.test(hub), 'the gallery hub preloads a picture it has no plate for');
});
