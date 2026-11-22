// When someone pastes brownhub283.com/haul.html into WhatsApp, X or iMessage, the
// preview is built from this page's og: tags — and until now og:image pointed at
// images/logo.png, a 240×240 square, with twitter:card "summary". Chat clients read
// that as a thumbnail beside small text: the service loses its one free advertisement.
// This pins the card to a real 1200×630 picture whose declared size is the size the
// file actually is, on the same host the page itself is served from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(join(ROOT, 'haul.html'), 'utf8');

const meta = (key) => {
  const m = new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

// JPEG dimensions live in the start-of-frame marker, not at a fixed offset: scan the
// segments instead of guessing, or a PNG offset applied to a JPEG reports nonsense.
function jpegSize(buf) {
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'not a JPEG (missing SOI)');
  for (let o = 2; o + 9 < buf.length; o++) {
    if (buf[o] !== 0xff) continue;
    const marker = buf[o + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
    o += 1 + buf.readUInt16BE(o + 2);
  }
  assert.fail('no start-of-frame marker found — not a decodable JPEG');
}

test('the haul page declares a large-image card, not a logo thumbnail', () => {
  assert.equal(meta('twitter:card'), 'summary_large_image',
    'a "summary" card shows the picture as a 120px thumb');
  const image = meta('og:image');
  assert.ok(image, 'og:image is missing entirely');
  assert.match(image, /\/images\/og-haul\.jpg$/, `og:image should be the haul card, found ${image}`);
  assert.equal(meta('twitter:image'), image, 'twitter:image must be the same picture');
});

test('the card address is absolute and on the host the page is actually served from', () => {
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)[1];
  const image = meta('og:image');
  assert.ok(/^https:\/\//.test(image), `og:image must be an absolute URL for crawlers, found ${image}`);
  assert.equal(new URL(image).origin, new URL(canonical).origin,
    'a preview image on a different host than the page is a half-moved hostname');
});

test('the card declares its size, and the file agrees', () => {
  const buf = readFileSync(join(ROOT, 'images', 'og-haul.jpg'));
  const { w, h } = jpegSize(buf);
  assert.deepEqual([w, h], [1200, 630], `images/og-haul.jpg is ${w}×${h}, the ratio chat clients crop to is 1.91:1`);
  assert.equal(meta('og:image:width'), String(w), 'declared width disagrees with the file');
  assert.equal(meta('og:image:height'), String(h), 'declared height disagrees with the file');
  assert.ok(buf.length < 600_000, `card is ${(buf.length / 1024).toFixed(0)}KB — previews go stale on slow fetches`);
});

test('the card speaks to the traveller, not to the crawler', () => {
  const alt = meta('og:image:alt');
  assert.ok(alt && alt.length > 20, `og:image:alt should describe the picture, found ${JSON.stringify(alt)}`);
  assert.doesNotMatch(alt, /lorem|placeholder|todo/i, 'alt text is filler');
});
