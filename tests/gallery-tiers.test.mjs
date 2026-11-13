import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The wall is 192 pictures in a box no wider than 250 CSS pixels, and it is the one
   place on the site where a phone used to be asked for the 1080w master of every
   thumbnail it painted: `(max-width:640px) 46vw` at 390 px is 179 CSS px, which at
   dpr 3 is 538 device px — one pixel past the 535w copy, so Chrome bought the 549 KB
   file for a tile 165 px wide. Measured over a 15-second dwell on slow 4G the wall
   cost 1920 KB, 549 of it a copy nobody sees at that size. The tiles now name one
   picture each, and the masters stay in the image sitemap for Google Images. */
const wallPages = () => {
  const pages = readdirSync(root).filter((f) => f.endsWith('.html'))
    .filter((f) => readFileSync(path.join(root, f), 'utf8').includes('class="gal-cell"'));
  const dir = path.join(root, 'gallery');
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.html')) : []) {
    if (readFileSync(path.join(dir, f), 'utf8').includes('class="gal-cell"')) pages.push(`gallery/${f}`);
  }
  return pages;
};

const cells = (html) => [...html.matchAll(/<li class="gal-cell"[^>]*>.*?<\/li>/gs)].map((m) => m[0]);

/* The guard is about *size*, not about the srcset attribute existing: a
   <source type="image/avif" srcset="one.avif"> offers one picture at the same
   width and height in a cheaper codec, which is the opposite of what this test
   was written to catch. So each srcset in a cell must name exactly one candidate,
   no cell may name a sizes clause, and no path in a cell may reach the hi/ tier. */
test('no gallery wall cell offers a bigger copy of its picture', () => {
  for (const page of wallPages()) {
    const html = readFileSync(path.join(root, page), 'utf8');
    for (const cell of cells(html)) {
      for (const srcset of cell.match(/\ssrcset="([^"]*)"/g) || []) {
        const candidates = srcset.replace(/^\ssrcset="/, '').replace(/"$/, '').split(',').filter((s) => s.trim());
        assert.equal(candidates.length, 1,
          `${page}: a tile offers ${candidates.length} copies in one srcset — ${candidates.join(' | ')}`);
      }
      assert.ok(!/\ssizes=/.test(cell), `${page}: a tile still names a sizes clause — ${cell.slice(0, 120)}`);
      assert.ok(!cell.includes('/hi/'), `${page}: a tile still points at the master copy`);
    }
  }
});

test('the wall still reserves each tile it drops', () => {
  for (const page of wallPages()) {
    const html = readFileSync(path.join(root, page), 'utf8');
    const list = cells(html);
    assert.ok(list.length > 0, `${page} has no wall cells to check`);
    for (const cell of list) {
      assert.match(cell, /\bwidth="\d+"\s+height="\d+"/, `${page}: a tile lost its box`);
      assert.match(cell, /loading="lazy" decoding="async"/, `${page}: a tile decodes eagerly`);
    }
  }
});

test('the image sitemap still leads Google to the master of every wall picture', () => {
  const sitemap = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  for (const page of wallPages()) {
    const href = page === 'gallery.html' ? '/gallery.html' : `/${page}`;
    const block = sitemap.match(new RegExp(`<url>\\s*<loc>[^<]*${href.replace('.', '\\.')}<\\/loc>.*?<\\/url>`, 's'));
    assert.ok(block, `sitemap.xml declares no ${href} entry`);
    const declared = [...block[0].matchAll(/<image:loc>[^<]*\/images\/catalog\/([^<]+)<\/image:loc>/g)]
      .map((m) => m[1]);
    const tiles = [...readFileSync(path.join(root, page), 'utf8')
      .matchAll(/<li class="gal-cell"[^>]*>.*?<img src="[^"]*\/([^"]+\.(?:jpe?g|png|webp))"/gs)]
      .map((m) => m[1]);
    assert.equal(declared.length, tiles.length,
      `${href}: the wall shows ${tiles.length} pictures but the sitemap declares ${declared.length}`);
    /* The pages stopped naming the master, so the sitemap is the only route left to it.
       Losing that is how a picture that measures 1080 wide ends up indexed at 608. */
    for (const name of tiles) {
      const master = existsSync(path.join(root, 'images/catalog/hi', name)) ? `hi/${name}` : name;
      assert.ok(declared.includes(master),
        `${href}: ${name} should be declared as ${master}, and the block holds ${declared.filter((d) => d.endsWith(name)).join(' | ') || 'nothing'}`);
    }
  }
});
