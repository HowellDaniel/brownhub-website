// The studio's own mark has been published at 240 px since the boot-bytes pass cut the
// nav picture down. That is the right price for a header on a phone and the wrong price
// for anyone who wants the logo: a search engine puts a 240 px thumbnail beside the
// business, and a visitor who right-clicks it downloads a blur.
//
// So the large copies come out of the vector master instead of out of the small file. This
// holds the published facts: the PNGs exist at the sizes Google asks for, the image sitemap
// declares them, the Organization node points a crawler at the square one, and the master
// plus the tool that cut it travel in the repo so the next person can re-cut it.
//
// They are deliberately NOT painted on a page any more: 6d6ec36 took the Brand assets band
// off about.html, because the mark belongs in Google's results rather than on his own site.
// So nothing here asks about.html to link or show them — that would be asserting a feature
// the owner deleted on purpose, and the sitemap test below is what replaced it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://www.brownhub283.com';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// PNG stores its size big-endian in the IHDR that follows the 8-byte signature, and its
// colour type at byte 25 — 6 is RGBA, which is what a logo over any background needs.
function pngHead(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], color: buf[25] };
}

const SMALL = 'images/brand/brownhub-logo-512.png';
const LARGE = 'images/brand/brownhub-logo-1024.png';

test('the logo is published at the two sizes a search engine and a downloader ask for', () => {
  for (const [file, edge] of [[SMALL, 512], [LARGE, 1024]]) {
    assert.ok(existsSync(join(ROOT, file)), `${file} is missing`);
    const head = pngHead(file);
    assert.equal(head.width, edge, `${file} is ${head.width} wide, not ${edge}`);
    assert.equal(head.height, edge, `${file} is ${head.height} tall, not ${edge}`);
    assert.equal(head.color, 6, `${file} is not RGBA — a logo needs transparency`);
    assert.equal(head.depth, 8);
  }
});

test('the large copies come from the vector master, not from an upscale of the nav file', () => {
  // The master and the cutter must travel with the site, or the next person can only
  // resample the 240 px file and call it high resolution.
  assert.ok(existsSync(join(ROOT, 'tools/logo-master.pdf')), 'tools/logo-master.pdf is missing');
  assert.ok(existsSync(join(ROOT, 'tools/logomaster.swift')), 'tools/logomaster.swift is missing');
  const tool = read('tools/logomaster.swift');
  assert.match(tool, /CGPDFDocument/, 'the cutter must read the PDF, not a raster');
  assert.ok(Buffer.byteLength(readFileSync(join(ROOT, 'tools/logo-master.pdf'))) > 10_000,
    'the master looks truncated');
  const config = read('_config.yml');
  assert.match(config, /^exclude:\n(?:\s+-\s+".*"\n)*\s+-\s+"tools"\n/m,
    'tools/ must stay out of the published build — it holds the vector master and the cutter');
});

test('the Organization node hands Google the square mark, not the nav thumbnail', () => {
  const index = read('index.html');
  const blocks = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  const logos = [];
  for (const raw of blocks) {
    const parsed = JSON.parse(raw);
    for (const node of parsed?.['@graph'] ?? [parsed]) {
      if (/(Organization|ProfessionalService)$/.test(String(node?.['@type']))) logos.push(node.logo);
    }
  }
  assert.ok(logos.length > 0, 'no Organization node carries a logo at all');
  for (const logo of logos) {
    assert.equal(logo, `${SITE}/${SMALL}`,
      `Organization.logo points at ${logo}, which is not the published square mark`);
  }
});

test('both files are declared in the image sitemap beside the page that hosts them', () => {
  const xml = read('sitemap.xml');
  const about = xml.match(/<url>[\s\S]*?about\.html[\s\S]*?<\/url>/)?.[0] || '';
  assert.ok(about, 'about.html is not in the sitemap');
  for (const file of [SMALL, LARGE]) {
    assert.ok(about.includes(`${SITE}/${file}`), `${file} is not declared under about.html`);
  }
});

test('the nav keeps paying for the small file', () => {
  // The point of the large copies is not to fatten every page boot: the header still uses
  // the 240 px mark, and the boot-bytes campaign depends on that staying true.
  const index = read('index.html');
  assert.match(index, /<img[^>]*src="images\/logo\.png"/, 'the nav no longer uses the small mark');
  assert.ok(!index.includes(`src="${LARGE}"`), 'a page boot is buying the 1024 px copy');
});
