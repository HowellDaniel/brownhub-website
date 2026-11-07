import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'css/style.css'), 'utf8');

const homeCss = css.slice(css.indexOf('/* Home classic computing glass */'));
const artwork = [
  'computing-grid.jpg',
  'computing-workspace.jpg',
  'design-studio.jpg',
  'design-composition.jpg',
  'graphics-interface.jpg',
];
const assetPair = (name) => [`images/home/${name}`, `images/home/hi/${name}`];
const plateArtwork = [
  'images/home/design-studio.jpg',
  'images/home/design-composition.jpg',
  'images/home/graphics-interface.jpg',
  'images/home/computing-workspace.jpg',
  'images/home/computing-grid.jpg',
];
const itPlates = new Set([
  'images/web/coding.jpg',
  'images/web/dashboard.jpg',
  'images/web/scene-10.jpg',
  'images/web/scene-8.jpg',
  'images/web/scene-3.jpg',
  'images/web/scene-5.jpg',
  'images/web/scene-9.jpg',
  'images/web/shop.jpg',
  'images/web/reel-poster.jpg',
]);

function tagAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function srcOf(tag) {
  const value = tagAttribute(tag, 'src');
  return value ? value.replace(/[?#].*$/, '') : null;
}

test('the five supplied computing and design artworks exist at both sizes', () => {
  for (const name of artwork) {
    for (const asset of assetPair(name)) {
      assert.equal(existsSync(path.join(root, asset)), true, `${asset} should exist`);
      assert.match(html, new RegExp(asset.replaceAll('.', '\\.')), `${asset} should be referenced by Home`);
    }
  }
});

test('Home background plates use only the requested artwork or genuine IT pictures', () => {
  const plates = [...html.matchAll(/<div class="hold-plate"[^>]*>\s*<img\b[^>]*>/gi)].map(([tag]) => srcOf(tag));
  assert.ok(plates.length >= 14, `expected the full set of held plates, found ${plates.length}`);
  for (const source of plates) {
    assert.ok(
      plateArtwork.includes(source) || itPlates.has(source),
      `background plate ${source} is neither requested artwork nor a genuine IT picture`,
    );
  }
  for (const source of plateArtwork) {
    assert.ok(plates.includes(source), `requested background artwork ${source} should back a Home band`);
  }
});

test('catalog cards keep their original product photography', () => {
  const flow = html.slice(html.indexOf('id="catalog-flow"'), html.indexOf('id="why"'));
  const cards = [...flow.matchAll(/<div class="media"[^>]*>\s*<img\b[^>]*>/gi)].map(([tag]) => tag);
  const cardCount = [...flow.matchAll(/<a class="product-card/gi)].length;
  const cardSources = cards.map((tag) => srcOf(tag) ?? tagAttribute(tag, 'data-src')).filter(Boolean);
  assert.equal(cardSources.length, cardCount, 'every catalog card should keep its picture');
  assert.ok(cardCount >= 28, `expected the catalog rail to keep its cards, found ${cardCount}`);
  for (const source of cardSources) {
    assert.match(source, /^images\/catalog\//, `catalog card ${source} should be an original catalog photo`);
  }
});

test('the welcome card keeps its original signage picture untouched', () => {
  const promo = html.match(/<img class="promo__img"[^>]*>/i);
  assert.ok(promo, 'the welcome card image should exist');
  assert.equal(srcOf(promo[0]), 'images/brand/brownhub-signage.jpg');
});

test('the hero carries its three labels without a device picture', () => {
  assert.doesNotMatch(html, /hero__device/);
  assert.doesNotMatch(homeCss, /hero__device/);
  assert.equal([...html.matchAll(/class="hero__card hero__card--\d"/g)].length, 3);
});

test('the scoped classic-glass system stops at generic cards', () => {
  assert.match(homeCss, /body\[data-nav="home"\]\s*\{[^}]*--home-space-/s);
  assert.match(homeCss, /body\[data-nav="home"\]\s*\{[^}]*--home-cyan:/s);
  assert.match(homeCss, /body\[data-nav="home"\]\s*\{[^}]*--home-copper:/s);
  assert.match(homeCss, /body\[data-nav="home"\]\s*:is\(\.card,\.feature\)\s*\{[^}]*backdrop-filter:/s);
  assert.match(homeCss, /body\[data-nav="home"\]\s*:is\(\.card,\.feature\)\s*\{[^}]*box-shadow:[^}]*inset/s);
  assert.match(homeCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[^}]*body\[data-nav="home"\]/s);
  assert.doesNotMatch(homeCss, /body\[data-nav="home"\][^{]*(?:#catalog-flow|\.product-card|\.promo__img|\.exp__card|\.exp__items|\.pstory__visual)/);
  assert.match(html, /<link rel="stylesheet" href="css\/style\.css\?v=182">/);
});

test('Home motion and interaction hooks remain intact', () => {
  assert.match(html, /<body data-nav="home">/);
  assert.match(html, /data-hold data-plate="dim"/);
  assert.match(html, /class="section band--ink pstory" id="process"/);
  assert.match(html, /class="pstory__pin"/);
  assert.match(html, /id="portfolio" data-pin="\.shots"/);
  assert.match(html, /id="customer-experience" data-pin="\.exp"/);
  assert.match(html, /js\/pstory\.js\?v=7/);
  assert.match(html, /js\/pinband\.js\?v=19/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.hold-plate\{translate:none\}/);
});
