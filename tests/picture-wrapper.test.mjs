// A `<picture>` is a wrapper the AVIF rail adds to a picture, and the layout is supposed to
// never notice. It notices twice over, and both breaks are silent: the wrapper is a box, so a
// grid or flex parent adopts it instead of the `<img>` it replaced; and it is a parent, so every
// `>img` rule stops matching even though nothing about the painted box changed. The services
// Luggage shots collapsed to a zero-height box and the catalog's pinned art grew 35% off its
// sizes clause — a byte saving that quietly redrew the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sheet = readFileSync(path.join(root, 'css/style.css'), 'utf8');

// Rules only, so a `>` inside a comment can never satisfy or trip a check.
const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

test('a picture wrapper generates no box of its own', () => {
  const decls = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /(?:^|[\s,])picture(?:[\s,]|$)/.test(m[1]))
    .map((m) => m[2].replace(/\s+/g, ' ').trim());
  assert.ok(decls.some((d) => /(^|;)\s*display\s*:\s*contents\s*(;|$)/.test(d)),
    'nothing declares picture{display:contents}, so a wrapped <img> is no longer the box its '
    + 'grid/flex parent sizes and aligns');
});

/* A child combinator may still point at an `<img>` — a card that owns a bare image must be
   able to say so — but only when the same rule also names the picture that stands in front of
   it, or the rule silently stops applying to a wrapped picture. */
test('every rule that reaches an <img> by a child combinator also reaches it through its picture', () => {
  const offenders = [];
  for (const block of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const flat = block[1].replace(/\s*>\s*/g, ' > ').replace(/\s+/g, ' ');
    const selectors = flat.split(',').map((s) => s.trim());
    for (const selector of selectors) {
      if (!/> img\b/.test(selector.replace(/> picture > img\b/g, '> picture > twin'))) continue;
      const partner = selector.replace(/> img\b/, '> picture > img');
      if (!selectors.includes(partner)) offenders.push(selector);
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    'these rules pick out their <img> as a direct child and have no `> picture > img` twin; the '
    + 'day the rail wraps that picture in a <picture> they stop applying and the visual layer '
    + 'disappears without failing a test');
});
