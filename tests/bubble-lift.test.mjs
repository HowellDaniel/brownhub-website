import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'css/style.css'), 'utf8');

/* Measured in Blink at 390x844 while scrolling the whole gallery wall: the one
   element that moved under the reader was the assistant's bubble — a layout-shift
   source `DIV.chat-widget`, previousRect [310,576,56,56] -> currentRect
   [310,325,56,56], value 0.00567, fired 15.5s into the pass, exactly when
   js/leads.js publishes `--lead-h` (0 -> 451px). `bottom` is a layout property,
   so a fixed box that re-anchors to clear the quote card is counted as a shift;
   the same 251px written as a transform is pixel-identical and is not counted,
   which is what css/style.css already does for the install pill. */

const QUEUE_TOKENS = ['--cookie-h', '--lead-h', '--rail-lane'];

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

/* Rules in document order, one level of @media/@supports nesting kept as context. */
function rules(src) {
  const out = [];
  const block = (text, media, from) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      let depth = 1;
      let k = open + 1;
      while (k < text.length && depth) {
        if (text[k] === '{') depth++;
        else if (text[k] === '}') depth--;
        k++;
      }
      const prelude = text.slice(i, open).trim();
      const body = text.slice(open + 1, k - 1);
      if (prelude.startsWith('@')) block(body, media ? `${media} / ${prelude}` : prelude);
      else if (prelude) out.push({ media, selector: prelude, body, index: (from || 0) + open });
      i = k;
    }
  };
  block(src, null);
  return out;
}

/* Splitting a selector list on commas that sit outside (...) and [...], because
   `:is(.a,.b)` carries commas that do not separate selectors. */
function selectors(prelude) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of prelude) {
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const ALL = rules(stripComments(css));

/* The declaration a browser finally applies to `selector` for `prop`: the last rule
   in the sheet that names it, with the media query that gates it. */
function effective(selector, prop) {
  let found = null;
  for (const r of ALL) {
    if (!selectors(r.selector).includes(selector)) continue;
    for (const decl of r.body.split(';')) {
      const [name, ...rest] = decl.split(':');
      if (!name || name.trim() !== prop) continue;
      if (!rest.length) continue;
      found = { value: rest.join(':').trim(), media: r.media, selector: r.selector };
    }
  }
  return found;
}

test('the bubble rests where it is painted: no queue token in its bottom', () => {
  for (const selector of ['.chat-widget']) {
    const bottom = effective(selector, 'bottom');
    assert.ok(bottom, `${selector} has no bottom at all`);
    for (const token of QUEUE_TOKENS) {
      assert.ok(!bottom.value.includes(token),
        `${selector} still lifts with a layout property — bottom:${bottom.value} under ${bottom.media}. ` +
        'A `bottom` change on a fixed element is counted as a layout shift; the clearance has to ride a transform.');
    }
  }
});

test('the queue clearance rides a transform on the three boxes it lifts', () => {
  const toggle = effective('.chat-widget__toggle', 'transform');
  assert.ok(toggle && toggle.value.includes('var(--lift'),
    `.chat-widget__toggle must carry the lift in transform (its translate is owned by @keyframes robot-bob) — got ${toggle && toggle.value}`);

  const teaser = effective('.chat-widget__teaser', 'translate');
  assert.ok(teaser && teaser.value.includes('var(--lift'),
    `.chat-widget__teaser is anchored to the bubble box and must keep clearing the queue — got translate:${teaser && teaser.value}`);

  /* The phone panel is fixed to the viewport and lifts itself by --chat-queue; paying
     for the queue twice would push it 251px off the top of the screen. */
  const deskPanel = ALL.filter((r) => selectors(r.selector).includes('.chat-widget__panel')
    && /(^|[;{])\s*translate\s*:/.test(r.body));
  for (const r of deskPanel) {
    assert.match(String(r.media || ''), /min-width:\s*641px/,
      `.chat-widget__panel may only take the transform lift where it is absolutely anchored to the bubble (got ${r.media})`);
  }
  assert.ok(deskPanel.length, 'the desk panel lost its queue clearance');
});

test('hovering the bubble keeps it above the queue', () => {
  const hover = effective('.chat-widget__toggle:hover', 'transform');
  assert.ok(hover, 'the hover rule disappeared');
  assert.ok(hover.value.includes('var(--lift'),
    `hover rewrote transform without the lift, so the bubble drops back onto the quote card under a pointer — ${hover.value}`);
  assert.ok(/scale\(1\.0[0-9]*\)/.test(hover.value),
    `the hover grow was lost: ${hover.value}`);
});

test('the lift is one figure, priced per width the way bottom used to be', () => {
  const base = effective('.chat-widget', '--lift');
  assert.ok(base && base.value.includes('--cookie-h'),
    `the bubble stopped clearing the cookie notice — --lift:${base && base.value}`);
  const phone = ALL.find((r) => selectors(r.selector).includes('.chat-widget')
    && /max-width:\s*600px/.test(String(r.media)) && r.body.includes('--lift'));
  assert.ok(phone && /--lead-h/.test(phone.body),
    'on a phone the bubble has to clear the full-width quote card too');
  const desk = ALL.find((r) => selectors(r.selector).includes('.chat-widget')
    && /min-width:\s*720px/.test(String(r.media)) && r.body.includes('--lift'));
  assert.ok(desk && /--rail-lane/.test(desk.body),
    'on a desk the bubble has to clear the rail lane too');
});

/* A transform moves paint, not the box. So while the launcher is lifted 451px the
   wrapper's own 56x56 box stays at the bottom edge — over the gallery tiles, at
   z-index 200 against their 1. Measured with document.elementFromPoint on a 20px
   grid once the quote card had opened: nine cells the wall used to answer for came
   back as DIV.chat-widget, a box that paints nothing but still eats the tap. */
test('the empty box the bubble left behind does not swallow clicks', () => {
  const wrapper = effective('.chat-widget', 'pointer-events');
  assert.ok(wrapper && wrapper.value === 'none',
    `.chat-widget must not answer for clicks where it no longer paints — got ${wrapper && wrapper.value}`);
  for (const part of ['.chat-widget__toggle', '.chat-widget__panel', '.chat-widget__teaser']) {
    const pe = effective(part, 'pointer-events');
    assert.ok(pe && pe.value === 'auto',
      `${part} is painted and must keep its own clicks — got ${pe && pe.value}`);
  }
});
