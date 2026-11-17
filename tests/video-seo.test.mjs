// The thirty-five print clips are the studio's real work, and until now the only place
// their URLs were written down was a data-imgs attribute that a visitor sees only after
// js/catalog.js has run. Google does not run scripts, so it never learned the clips exist.
// This file holds the three rails that make them visible: a video sitemap, VideoObject
// markup on the page that shows the cards, and the robots.txt line that points a crawler
// at the sitemap. It also holds the rule that keeps them honest — every clip the modal can
// play must be declared, and every declaration must name a file that is really shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://www.brownhub283.com';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// The clips the product modal offers, taken from the four print-sample cards.
function shippedClips() {
  const html = read('catalog.html');
  const clips = [];
  for (const m of html.matchAll(/data-imgs="([^"]*\bmp4[^"]*)"/g)) {
    for (const one of m[1].split(',')) {
      const path = one.trim();
      if (path.endsWith('.mp4')) clips.push(path);
    }
  }
  return clips;
}

const CLIPS = shippedClips();
const CROPS = JSON.parse(read('tools/clip-crops.json')).clips;

test('the print clips really are the thirty-five the owner supplied', () => {
  assert.equal(CLIPS.length, 35, `catalog.html offers ${CLIPS.length} clips, not 35`);
  assert.deepEqual([...new Set(CLIPS)].sort(), CLIPS.slice().sort(), 'a clip is listed twice');
});

test('a video sitemap is published and declares the video namespace', () => {
  const xml = read('sitemap-video.xml');
  assert.match(xml, /<urlset[^>]+xmlns:video="http:\/\/www\.google\.com\/schemas\/sitemap-video\/1\.1"/,
    'the video namespace must be declared on the urlset, not on each entry');
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
});

test('every clip the modal can play is in the video sitemap, once', () => {
  const xml = read('sitemap-video.xml');
  const declared = [...xml.matchAll(/<video:content_loc>([^<]+)<\/video:content_loc>/g)].map((m) => m[1]);
  assert.equal(declared.length, CLIPS.length,
    `${declared.length} clips declared against ${CLIPS.length} shipped`);
  for (const clip of CLIPS) {
    assert.ok(declared.includes(`${SITE}/${clip}`), `${clip} is not declared`);
  }
  assert.equal(new Set(declared).size, declared.length, 'a clip is declared twice');
});

test('each video entry carries the fields Google asks for and no file is a lie', () => {
  const xml = read('sitemap-video.xml');
  // Protocol shape: <url> holds one <loc> — the page that hosts the video — and any
  // number of <video:video> children, each naming its own file. All thirty-five clips
  // play on catalog.html, so they ride under one loc, exactly as Google's own example
  // of a page with several videos does.
  const pages = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const entries = pages.flatMap((page) => {
    const loc = page.match(/<loc>([^<]+)<\/loc>/)?.[1];
    return [...page.matchAll(/<video:video>([\s\S]*?)<\/video:video>/g)].map((m) => ({
      loc,
      block: m[1],
    }));
  });
  assert.equal(entries.length, 35);
  assert.ok(pages.length >= 1, 'every video must ride inside a <url> that names its page');
  const field = (block, name) => block.match(new RegExp(`<video:${name}>([\\s\\S]*?)</video:${name}>`))?.[1];
  for (const { loc, block } of entries) {
    assert.ok(loc?.startsWith(`${SITE}/catalog.html`), 'a video entry needs the page that hosts it');

    const content = field(block, 'content_loc');
    assert.ok(content?.startsWith(`${SITE}/video/`), `${loc} does not serve an mp4 over https`);
    assert.ok(existsSync(join(ROOT, content.slice(SITE.length + 1))), `${content} is not on disk`);

    const thumb = field(block, 'thumbnail_loc');
    assert.ok(thumb?.startsWith(`${SITE}/images/catalog/`), `${content} has no poster`);
    assert.ok(existsSync(join(ROOT, thumb.slice(SITE.length + 1))), `${thumb} is not on disk`);

    const title = (field(block, 'title') || '').trim();
    assert.ok(title.length > 0 && title.length <= 100, `title "${title}" is empty or over 100 chars`);
    assert.ok((field(block, 'description') || '').trim().length > 20, `${content} has no description`);

    const dur = Number(field(block, 'duration'));
    const row = CROPS.find((c) => `${SITE}/${c.clip}` === content);
    assert.ok(row, `${content} is not in tools/clip-crops.json`);
    assert.ok(Number.isFinite(dur) && Math.abs(dur - row.dur) <= 1,
      `${content} claims ${dur}s against the ${row.dur}s the shipped file holds`);

    assert.match(field(block, 'publication_date') || '',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, `${content} has no usable upload date`);
    assert.equal(field(block, 'family_friendly'), 'yes', `${content} should say the work is safe`);
  }
});

test('the sitemap is capped where Google reads it and stays inside the byte budget', () => {
  const xml = read('sitemap-video.xml');
  assert.ok(Buffer.byteLength(xml) < 50 * 1024 * 1024, 'a video sitemap over 50 MB is not read');
  assert.ok(CLIPS.length <= 50000, 'a single sitemap may not hold more than 50,000 videos');
});

test('robots.txt hands the video sitemap to a crawler', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^Sitemap: https:\/\/www\.brownhub283\.com\/sitemap\.xml$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.brownhub283\.com\/sitemap-video\.xml$/m,
    'nothing points a crawler at the video sitemap');
});

test('catalog.html declares each clip as a VideoObject a parser can read', () => {
  const html = read('catalog.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  const videos = [];
  for (const raw of blocks) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { assert.fail(`unparseable JSON-LD on catalog.html: ${raw.slice(0, 80)}`); }
    const graph = parsed?.['@graph'] ?? [parsed];
    for (const node of graph) if (node?.['@type'] === 'VideoObject') videos.push(node);
  }
  assert.equal(videos.length, 35, `${videos.length} VideoObject nodes, expected 35`);
  const urls = videos.map((v) => v.contentUrl);
  for (const clip of CLIPS) assert.ok(urls.includes(`${SITE}/${clip}`), `${clip} has no VideoObject`);
  for (const v of videos) {
    assert.ok(v.name && v.description && v.thumbnailUrl, `${v.contentUrl} is missing name, description or poster`);
    assert.ok(String(v.thumbnailUrl).startsWith('https://'), `${v.contentUrl} poster is not absolute`);
    assert.ok(v.uploadDate, `${v.contentUrl} has no uploadDate`);
    assert.match(String(v.duration || ''), /^PT\d+(\.\d+)?S$/, `${v.contentUrl} duration is not ISO 8601 seconds`);
    assert.ok(v.embedUrl || v.contentUrl, `${v.contentUrl} gives the player nothing to open`);
  }
});

test('the generator that writes the video sitemap is shipped with the site but not published', () => {
  assert.ok(existsSync(join(ROOT, 'tools/videoseo.py')), 'tools/videoseo.py must exist so this is repeatable');
  const config = read('_config.yml');
  assert.match(config, /^exclude:\n(?:\s+-\s+".*"\n)*\s+-\s+"tools"\n/m,
    'tools/ must stay out of the published build');
});

test('declaring video never moves the picture the grid shows', () => {
  // The grid cover stays a still: a <video> in the card would buy bytes for every visitor
  // who never opens the modal, and the owner asked for the print to read at a glance.
  const html = read('catalog.html');
  const cards = [...html.matchAll(/<article class="product-card"[\s\S]*?<\/article>/g)].map((m) => m[0]);
  for (const card of cards) {
    if (!/VIDEO SAMPLES OF OUR PRINT OUT/.test(card)) continue;
    assert.ok(!/<video/.test(card), 'a print-sample card plays video in the grid');
    assert.match(card, /<img src="images\/catalog\/print-out-samples-\d-\d\.jpg"/);
  }
});
