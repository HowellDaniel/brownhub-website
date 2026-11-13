import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Measured in Blink, same band and same picture, the 960w copy against the 1600w
   one, with everything the band really paints still in place — the img's own
   brightness, the plate's rgba wash, the band's shade and the plate mask:
   behind a `dim` veil the big copy moves 0.29 of 255 on a desktop and 0.49 on a
   dpr-3 phone, and adds 3% and 0.1% of fine detail; behind `deep`, 0.13/0.32 and
   under 1%. Seen bare the same pair differs by 60% of detail, which is why the
   tier survives on the lifted bands. Those bytes are 59-226 KB a plate, so a
   crush-veiled band pays for pixels its own wash erases. */
const CRUSHED = new Set(['dim', 'deep']);

function pages() {
  return readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .concat(readdirSync(path.join(root, 'blog')).filter((f) => f.endsWith('.html')).map((f) => `blog/${f}`));
}

/* Every band plate in a file, with the tier its own band declares. */
function plates(html) {
  const out = [];
  for (const m of html.matchAll(/<(?:section|div)\b[^>]*\bdata-hold\b[^>]*>/gi)) {
    const head = html.slice(m.index, m.index + 1600);
    const img = head.match(/<div class="hold-plate"[^>]*>\s*<img\b[^>]*>/i);
    if (!img) continue;
    const tier = (m[0].match(/\bdata-plate="([a-z]+)"/i) || [])[1] || 'vivid';
    out.push({ tier, tag: img[0] });
  }
  return out;
}

test('no crush-veiled band offers its plate\'s hi copy', () => {
  let crushed = 0;
  for (const page of pages()) {
    for (const plate of plates(readFileSync(path.join(root, page), 'utf8'))) {
      if (!CRUSHED.has(plate.tier)) continue;
      crushed++;
      const srcset = (plate.tag.match(/\ssrcset="([^"]*)"/i) || [])[1] || '';
      assert.ok(!srcset.includes('/hi/'),
        `${page}: "${plate.tier}" band offers ${srcset || 'no srcset'} — its wash erases the extra pixels`);
      assert.ok(!/\ssizes="/i.test(plate.tag),
        `${page}: "${plate.tier}" band keeps a sizes clause with no srcset to size`);
    }
  }
  assert.ok(crushed >= 25, `expected the site's crush-veiled plates, found ${crushed}`);
});

test('a lifted band still offers its plate\'s hi copy', () => {
  const kept = [];
  for (const page of pages()) {
    for (const plate of plates(readFileSync(path.join(root, page), 'utf8'))) {
      if (CRUSHED.has(plate.tier)) continue;
      const srcset = (plate.tag.match(/\ssrcset="([^"]*)"/i) || [])[1] || '';
      if (srcset.includes('/hi/')) kept.push(`${page}:${plate.tier}`);
    }
  }
  assert.ok(kept.length >= 8, `expected the vivid/mid plates to keep their hi copy, found ${kept.length}`);
});

/* A plate is decoration: the band's own shade is what makes its copy readable, and the
   picture only deepens it. Measured on the phone over 4G, catalog's seven plates asked for
   944 KB of art inside the boot window, and because Blink widens the lazy root on a slow
   connection they all arrived before DOMContentLoaded — the deferred scripts queued behind
   them and DCL landed at 11.2 s. Asking for the same copies at low priority moved them off
   the critical path (DCL 6.0 s, 944 KB before it instead of 1,986 KB) and every plate still
   painted once its band was scrolled to. */
test('every band plate asks for its picture at low priority', () => {
  let platesSeen = 0;
  for (const page of pages()) {
    for (const plate of plates(readFileSync(path.join(root, page), 'utf8'))) {
      platesSeen++;
      assert.ok(/\sfetchpriority="low"/i.test(plate.tag),
        `${page}: "${plate.tier}" band's plate competes with the page's own copy for the pipe`);
    }
  }
  assert.ok(platesSeen >= 38, `expected the site's band plates, found ${platesSeen}`);
});
