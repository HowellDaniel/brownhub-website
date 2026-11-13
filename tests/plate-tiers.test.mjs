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
    const cls = (m[0].match(/\bclass="([^"]*)"/i) || [])[1] || '';
    out.push({ tier, cls, tag: img[0] });
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

/* A plate below the fold can be slow and the page still opens; a plate the phone is
   staring at when it paints is the page's largest contentful paint. Measured on the
   phone over 4G, catalog's LCP landed at 8.0 s and the LCP element was the hero
   plate's own `hi/design-composition.jpg` — 273 KB of a picture the band then dims
   to .82 brightness under a 28% brown wash, so the phone paid for pixels its veil
   erases. Priority was not the lever: the same markup with `eager` plates moved DCL
   from 6.0 s to 10.8 s for almost no LCP gain. Bytes were — the base copy alone took
   catalog's local LCP from 11.1 s to 7.6 s. `sizes` is the honest way to ask for it:
   the pocket branch names the half-resolution copy, the desk branch keeps the full
   100vw demand and therefore still takes the hi copy. */
const PHONE_BRANCH = /^\(max-width:(\d+)px\)\s*(\d+(?:\.\d+)?)vw\b/;

/* Every band plate, not just the hero's: a plate below the fold still arrives over the
   same pipe, and catalog's six section plates plus services' closing one all read
   `sizes="100vw"` against a `1600w` candidate — so a 390px dpr-3 phone demanded 1,170
   device px and bought 182-280 KB per plate for art it paints 431 CSS px wide under a
   wash. `hi/graphics-interface.jpg` was the last picture to land over 4G (6.5 s) and
   the band's LCP element; the 960w copy is 88-104 KB of the same scene. */
test('no band plate makes a phone buy its hi copy', () => {
  let lifted = 0;
  for (const page of pages()) {
    for (const plate of plates(readFileSync(path.join(root, page), 'utf8'))) {
      const srcset = (plate.tag.match(/\ssrcset="([^"]*)"/i) || [])[1] || '';
      if (!srcset.includes('/hi/')) continue;
      lifted++;
      const sizes = (plate.tag.match(/\ssizes="([^"]*)"/i) || [])[1] || '';
      const branch = PHONE_BRANCH.exec(sizes);
      assert.ok(branch && Number(branch[2]) < 100 && Number(branch[1]) <= 719,
        `${page}: the "${plate.tier}" plate asks a phone for ${srcset} at sizes="${sizes}"`);
    }
  }
  assert.ok(lifted >= 10, `expected the site's lifted plates with a hi copy, found ${lifted}`);
});

/* `loading="lazy"` is not a deferral on a slow connection: Blink widens its lazy root to
   the point where a plate one screen down arrives in the boot window anyway. Measured on
   the HTTP/2 + gzip mirror at 390px dpr-3, catalog pulled 679 KB of pictures before it
   was finished loading, and the hero plate — the page's own LCP element — landed at
   4.70 s behind art the reader had not scrolled to. Leaving an off-screen plate
   unrendered takes it out of the pipe and off the compositor (its Ken-Burns loop stops
   running for nothing): the same boot came down to 579 KB and 4.21 s. The intrinsic size
   is what makes the skip safe — the plate box is declared (100lvh, or 3:1 on the banner
   band), so skipping its contents can neither collapse the band nor shift the page. */
test('a plate the reader has not reached is not rendered', () => {
  for (const sheet of ['css/style.css', 'css/style.min.css']) {
    const css = readFileSync(path.join(root, sheet), 'utf8');
    const rule = /\.hold-plate\s*\{([^}]*)\}/.exec(css);
    assert.ok(rule, `${sheet}: the plate layer lost its own rule`);
    assert.match(rule[1], /content-visibility:\s*auto/,
      `${sheet}: an off-screen plate still renders, so the phone still pays for its picture at boot`);
    assert.match(rule[1], /contain-intrinsic-size:/,
      `${sheet}: skipped contents with no declared box leave the plate free to collapse`);
  }
});

/* A printed sheet has no viewport to be off-screen in: the book renders the whole document
   at once, so anything the screen defers by distance is exactly what the book loses. The
   38 band pictures had to be put back into the print once already, and the deferral above
   would take them out again on an engine that honours it while paginating. */
test('the print pass still renders every plate', () => {
  for (const sheet of ['css/style.css', 'css/style.min.css']) {
    const css = readFileSync(path.join(root, sheet), 'utf8');
    assert.match(css, /@media print\s*\{[^{}]*\.hold-plate\s*\{[^{}]*content-visibility:\s*visible/,
      `${sheet}: the plate deferral leaks into print, where nothing is ever off-screen`);
  }
});
