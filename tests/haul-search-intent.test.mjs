// Item 3 of the discovery plan is "let the Studio page be the ad". Nobody in Accra
// searches for "BrownHub Haul"; they search for the job — luggage delivery to
// Kotoka, sending bags to Kumasi, a hotel transfer before an early flight. The
// page's own body copy already names those destinations, so the metadata can too,
// as long as it never promises a place the page does not serve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const html = readFileSync(join(resolve(import.meta.dirname, '..'), 'haul.html'), 'utf8');
const title = /<title>([^<]*)<\/title>/.exec(html)[1];
const desc = /<meta name="description" content="([^"]*)"/.exec(html)[1];
// Everything a reader would see as a promise about where a bag can go.
const body = html.replace(/<head>[\s\S]*?<\/head>/, '');

test('the page is titled around the job a traveller searches for', () => {
  assert.match(title, /luggage/i, `title should lead with the service, found ${title}`);
  assert.match(title, /accra/i, 'nobody books a national luggage service without naming the city');
  assert.match(title, /BrownHub Haul/, 'the brand still has to be in there, second');
  assert.ok(title.search(/luggage/i) < title.search(/BrownHub/i),
    `the brand leads the title, so the query leads it: ${title}`);
  assert.ok(title.length <= 68, `title is ${title.length} characters — search results truncate around 60`);
});

test('the description answers the search, not the brand', () => {
  for (const phrase of ['luggage', 'accra', 'kotoka'])
    assert.match(desc, new RegExp(phrase, 'i'), `description never mentions ${phrase}`);
  assert.ok(desc.length >= 70 && desc.length <= 160, `description is ${desc.length} characters`);
});

test('every destination the metadata names, the page itself offers', () => {
  const places = ['Kotoka', 'Kumasi', 'Takoradi', 'Tamale', 'Accra'];
  const promised = places.filter((p) => new RegExp(p, 'i').test(`${title} ${desc}`));
  assert.ok(promised.length >= 3, `metadata names only ${promised.join(', ') || 'no place at all'}`);
  for (const p of promised)
    assert.match(body, new RegExp(p, 'i'), `${p} is in the search snippet but not on the page`);
});

test('the page keeps one title and one description, and the card still agrees', () => {
  assert.equal([...html.matchAll(/<title>/g)].length, 1, 'two titles means the crawler picks one');
  assert.equal([...html.matchAll(/<meta name="description"/g)].length, 1, 'two descriptions means the crawler picks one');
  const ogTitle = /<meta property="og:title" content="([^"]*)"/.exec(html)[1];
  assert.match(ogTitle, /luggage/i, 'the preview headline and the search headline should not be different products');
});
