// The studio page is the traveller's first — often only — read of what the Haul
// app is. Three claims on it had drifted from the product: it counted 39 languages
// where the app ships 40, it advertised sending video files "through the chat" of
// an app that has no chat at all, and it capped collections at Mon–Sat while its own
// feed runs a Sunday and holiday roster. A page that overstates the product is worse
// than a page that says less, so every number here has to trace to the thing itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = process.env.STUDIO_APP_SRC || '/Users/brownhub/Documents/Qoder/2026-10-27/a6740f12';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const page = () => read('haul.html');

/** What the app really offers: the codes in its menu, each with a dictionary. */
function appLanguages() {
  if (!existsSync(join(APP, 'app/js/translate.js'))) return null;
  const src = readFileSync(join(APP, 'app/js/translate.js'), 'utf8');
  const groups = src.match(/var GROUPS = \[([\s\S]*?)\n  \];/);
  assert.ok(groups, 'the app no longer exposes the language groups this check reads');
  const codes = [...new Set([...groups[1].matchAll(/"([a-z]{2})"/g)].map((m) => m[1]))];
  const files = readdirSync(join(APP, 'i18n')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  assert.deepEqual(codes.filter((c) => !files.includes(c)), [], 'a menu language has no dictionary');
  assert.deepEqual(files.filter((f) => !codes.includes(f)), [], 'a dictionary is unreachable from the menu');
  return codes.length;
}

test('the language count on the page is the count the app ships', () => {
  const html = page();
  const claimed = [...html.matchAll(/(\d+)\s+languages/g)].map((m) => Number(m[1]));
  assert.ok(claimed.length >= 2, `the count should appear in both the intro and the card, saw ${claimed}`);
  assert.equal(new Set(claimed).size, 1, `the page disagrees with itself: ${claimed}`);
  const shipped = appLanguages();
  if (shipped) assert.equal(claimed[0], shipped, `the app offers ${shipped} languages, the page says ${claimed[0]}`);
});

test('the named languages and the "and N more" figure add up', () => {
  const html = page();
  const said = /<p>(English[^<]*?), and (\d+) more\./.exec(html);
  assert.ok(said, 'the "…and N more" sentence is missing, so its arithmetic cannot be checked');
  const named = said[1].split(',').length;
  const headline = Number(/(\d+)\s+languages/.exec(html)[1]);
  assert.equal(named + Number(said[2]), headline,
    `the sentence names ${named} languages plus "${said[2]} more", which is not the headline ${headline}`);
});

test('the page claims no chat and no video upload, because the app has neither', () => {
  const html = page();
  for (const phrase of [/video files? in (the )?chat/i, /through the chat/i, />Video uploads</i])
    assert.equal(html.match(phrase), null, `the haul page still advertises "${phrase}"`);
  if (!existsSync(join(APP, 'app/js'))) return;
  const appSource = ['app/js', 'core'].flatMap((dir) => readdirSync(join(APP, dir), { withFileTypes: true })
    .filter((e) => e.isFile()).map((e) => readFileSync(join(APP, dir, e.name), 'utf8'))).join('\n')
    + readFileSync(join(APP, 'index.html'), 'utf8');
  assert.match(appSource, /wa\.me|whatsapp/i, 'WhatsApp is the channel this page can honestly name');
  const accepts = [...appSource.matchAll(/type:\s?"file"[^)]*?accept:\s?"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(accepts.length > 0, 'the app no longer has a file input for this check to read');
  assert.deepEqual(accepts.filter((a) => /video/.test(a)), [],
    `the app accepts ${accepts.join(', ')} — a video capability would make this page truthful again`);
});

test('the collection chip agrees with the operating hours the feed publishes', () => {
  const feed = JSON.parse(read('data/haul.json'));
  const html = page();
  const chip = /<div><b>Collections from ([\d:]+)<\/b>([^<]+)<\/div>/.exec(html);
  assert.ok(chip, 'the collections chip changed shape and can no longer be read');
  const states = `${chip[1]} ${chip[2]}`;
  const feedSaysSevenDays = /Sun/i.test(feed.haul.hours);
  if (feedSaysSevenDays) assert.doesNotMatch(states, /Mon–Sat|Mon-Sat/,
    `the feed runs "${feed.haul.hours}" but the chip tells travellers Mon–Sat`);
  assert.ok(chip[1] <= feed.haul.hours.match(/\d\d:\d\d/g)[0],
    `the chip starts collections at ${chip[1]}, later than the feed's ${feed.haul.hours}`);
});

test('the cover figures on the page are the figures the app prices', () => {
  const html = page();
  for (const phrase of [/GH₵500 per sealed piece/, /GH₵1,500 per shipment/])
    assert.match(html, phrase, 'the page must state the carrier cover in the same numbers the app does');
  if (!existsSync(join(APP, 'core/pricing.mjs'))) return;
  const pricing = readFileSync(join(APP, 'core/pricing.mjs'), 'utf8');
  const perPiece = Number(/carrierLimitPerPiece:\s*(\d+)/.exec(pricing)[1]);
  const max = Number(/carrierLimitMax:\s*(\d+)/.exec(pricing)[1]);
  assert.ok(html.includes(`GH₵${perPiece} per sealed piece`), `the app answers for GH₵${perPiece} a piece`);
  assert.ok(html.includes(`GH₵${max.toLocaleString('en-US')} per shipment`), `the app caps a shipment at GH₵${max}`);
});
