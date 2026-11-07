import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['catalog.html', 'services.html', 'about.html'];
const generated = [
  'images/home/computing-grid.jpg',
  'images/home/computing-workspace.jpg',
  'images/home/design-studio.jpg',
  'images/home/design-composition.jpg',
  'images/home/graphics-interface.jpg',
];

const read = (page) => readFileSync(path.join(root, page), 'utf8');
const platesOf = (html) => [...html.matchAll(/<div class="hold-plate"[^>]*>\s*<img\b[^>]*>/gi)]
  .map(([tag]) => {
    const src = tag.match(/\ssrc="([^"]*)"/i);
    const srcset = tag.match(/\ssrcset="([^"]*)"/i);
    return {
      src: src ? src[1] : null,
      srcset: srcset ? srcset[1] : null,
    };
  });

test('every generated backdrop exists at both sizes', () => {
  for (const asset of generated) {
    assert.equal(existsSync(path.join(root, asset)), true, `${asset} should exist`);
    const hi = asset.replace('/home/', '/home/hi/');
    assert.equal(existsSync(path.join(root, hi)), true, `${hi} should exist`);
  }
});

test('catalog, services and about paint only generated artwork behind their bands', () => {
  for (const page of pages) {
    const plates = platesOf(read(page));
    assert.ok(plates.length >= 1, `${page} should keep its picture backdrop`);
    for (const plate of plates) {
      assert.ok(generated.includes(plate.src), `${page} backdrop ${plate.src} should be generated artwork`);
      assert.ok(plate.srcset && plate.srcset.includes(plate.src.replace('/home/', '/home/hi/')),
        `${page} backdrop ${plate.src} should offer its hi copy in srcset`);
    }
  }
});

test('the catalog keeps every product picture untouched', () => {
  const html = read('catalog.html');
  const cards = [...html.matchAll(/<article class="product-card[^"]*"[^>]*>[\s\S]*?<div class="media"[^>]*>\s*<img\b[^>]*>/gi)];
  assert.ok(cards.length >= 28, `expected the catalog cards, found ${cards.length}`);
  for (const [tag] of cards) {
    const media = tag.slice(tag.indexOf('<div class="media"'));
    const src = (media.match(/\ssrc="([^"]*)"/i) || media.match(/\sdata-src="([^"]*)"/i))?.[1];
    assert.ok(src && src.startsWith('images/catalog/'), `catalog card ${src} should keep its own photo`);
  }
});

test('the swapped pages no longer use product photos or the old web plates as backdrops', () => {
  for (const page of pages) {
    const plates = platesOf(read(page));
    for (const plate of plates) {
      assert.doesNotMatch(plate.src, /^images\/(catalog|web)\//, `${page} still paints ${plate.src} behind a band`);
    }
  }
});

test('the backdrops sit at a lifted tier so the artwork reads clearly', () => {
  for (const page of pages) {
    const tiers = [...read(page).matchAll(/<section[^>]*\bdata-hold\b[^>]*\bdata-plate="(vivid|mid|dim|deep)"[^>]*>/gi)]
      .map(([, tier]) => tier);
    assert.ok(tiers.length >= 1, `${page} should keep its held plates`);
    for (const tier of tiers) {
      assert.ok(tier === 'vivid' || tier === 'mid',
        `${page} carries a "${tier}" plate; the owner asked for clearly visible artwork`);
    }
  }
});
