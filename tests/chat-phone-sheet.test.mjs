import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'css/style.css'), 'utf8');

/* Measured on the live origin at 390x844 with the panel open (tools/pane624.mjs):
   the box was granted 635px of screen and took 450px of it, because the phone panel
   only ever declared a floor and a ceiling — never a height — so its own content set
   its size and the room below the composer stayed empty grey. Sending the first
   message made it WORSE: the suggestions empty themselves on a send, the column lost
   124px, and the panel shrank from 450px to 423px while the conversation it was
   supposed to hold sat clipped inside it.

   The same pass found the panel standing on top of the asks that share the bottom
   edge: the install pill painted at y 740 under a panel that reached y 760, because
   the phone queue figure only ever priced the cookie notice and the quote card, and
   js/app.js already publishes the height of whatever actually owns that edge as
   --queue-h. One figure, read by the anchor and the height together, settles both. */

const PHONE = 'max-width:640px';

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

/* Rules in document order, one level of @media nesting kept as context. */
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

const isPhone = (media) => String(media || '').includes(PHONE);

/* Every declaration of `prop` on `selector`, in document order, with the query
   that gates it — because on this sheet the last one wins and the query is the
   half that says which engine it applies to. */
function decls(selector, prop) {
  const found = [];
  for (const r of ALL) {
    if (!selectors(r.selector).includes(selector)) continue;
    for (const decl of r.body.split(';')) {
      const [name, ...rest] = decl.split(':');
      if (!name || name.trim() !== prop || !rest.length) continue;
      found.push({ value: rest.join(':').trim(), media: r.media, selector: r.selector });
    }
  }
  return found;
}

const last = (list) => list[list.length - 1] || null;

test('the phone panel is told its height, so it stops leaving its room unused', () => {
  const phone = decls('.chat-widget__panel', 'height').filter((d) => isPhone(d.media));
  assert.ok(phone.length,
    'the phone panel declares no height: a fixed box with only a floor and a ceiling is sized by its own content, so it rendered 450px of a granted 635px and shrank again when the suggestions emptied on a send');
  const d = last(phone);
  assert.match(d.value, /--chat-edge/, `height must spend the same bottom-edge figure the anchor pays — got ${d.value}`);
  assert.match(d.value, /--chat-top|--nav-h/, `height must stop under the sticky header — got ${d.value}`);
  assert.match(d.value, /100dvh|100vh/, `height has no viewport term, so it cannot follow the phone's own edge — got ${d.value}`);

  /* The panel above 640px is covered by its own test below — the same defect the
     phone had, at the widths the owner actually saw it at. */
});

test('the anchor and the height pay one bottom-edge figure', () => {
  const bottom = last(decls('.chat-widget__panel', 'bottom').filter((d) => isPhone(d.media)));
  assert.ok(bottom && /--chat-edge/.test(bottom.value),
    `.chat-widget__panel bottom must read --chat-edge or the box and its position disagree about what stands underneath — got ${bottom && bottom.value}`);
  const height = last(decls('.chat-widget__panel', 'height').filter((d) => isPhone(d.media)));
  const max = last(decls('.chat-widget__panel', 'max-height').filter((d) => isPhone(d.media)));
  assert.ok(max && max.value.replace(/100vh/, '100dvh') === height.value.replace(/100vh/, '100dvh'),
    `the ceiling still prices the old lane (${max && max.value}) while the height prices the queue (${height.value}) — the fill would be clipped back to the figure it replaced`);
});

test('the edge is whatever the ask queue actually owns, never less than the launcher lane', () => {
  const edge = decls(':root', '--chat-edge').filter((d) => isPhone(d.media));
  assert.ok(edge.length, '--chat-edge is not declared for a phone at all');
  const d = last(edge);
  assert.match(d.value, /max\(/, `the edge must take the taller of two lanes — got ${d.value}`);
  assert.match(d.value, /5\.25rem/, `the launcher lane the panel hangs over is gone — got ${d.value}`);
  assert.match(d.value, /var\(--queue-h/,
    `the panel must clear the bottom edge js/app.js measures (--queue-h), not the two asks it guesses at — got ${d.value}`);
  assert.match(d.value, /env\(safe-area-inset-bottom/,
    `the launcher lane lost its home-indicator inset — got ${d.value}`);

  /* js/app.js rounds its measurement of the edge to whole pixels, and rounding can
     go down: at 390x844 with the install pill standing it published 104px for a
     grant of 104.54px, and the sheet painted 0.54px of glass across the pill. */
  assert.match(d.value, /var\(--queue-h[^;]*\)\s*\+\s*1px/,
    `the queue term must carry a hair of slack, because --queue-h is a rounded figure that can round down — got ${d.value}`);
});

test('the quick suggestions are one whole line on a phone, so none is ever cut', () => {
  const wrap = last(decls('.chat-widget__chips', 'flex-wrap').filter((d) => isPhone(d.media)));
  assert.ok(wrap && wrap.value === 'nowrap',
    'the suggestions still wrap to two and three rows, and a row that does not fit is sawn through the middle of a chip');
  const over = last(decls('.chat-widget__chips', 'overflow-x').filter((d) => isPhone(d.media)));
  assert.ok(over && /auto|scroll/.test(over.value),
    `a single line needs somewhere to go sideways — overflow-x:${over && over.value}`);
  const flex = last(decls('.chat-widget__chips', 'flex').filter((d) => isPhone(d.media)));
  assert.ok(flex && /^0 0|none$/.test(flex.value.trim()),
    `the row must not be shrunk into a half chip — flex:${flex && flex.value}`);
  const hide = last(decls('.chat-widget__chips', 'scrollbar-width').filter((d) => isPhone(d.media)));
  assert.ok(hide && hide.value === 'none',
    `a strip with a visible bar inside a 44px row is a second scrollbar over the conversation — scrollbar-width:${hide && hide.value}`);
});

test('the conversation still pays for the room before anything else does', () => {
  const msgs = last(decls('.chat-widget__messages', 'flex'));
  assert.equal(msgs && msgs.value, '1 1000 auto',
    'the squeeze order that keeps the composer on screen in a short panel was measured, not guessed');
  for (const fixed of ['.chat-widget__head', '.chat-widget__form']) {
    const f = last(decls(fixed, 'flex'));
    assert.equal(f && f.value, 'none', `${fixed} would shrink beside the suggestions and drop the composer off the bottom`);
  }
});

test('the strip says there is more to the side, in both directions', () => {
  const mask = last(decls('.chat-widget__chips', 'mask-image').filter((d) => isPhone(d.media)));
  assert.ok(mask, 'a suggestion cut at the edge of the row reads as a suggestion that was sawn off, not as one you can swipe to');
  assert.match(mask.value, /linear-gradient/, `mask-image:${mask && mask.value}`);
  const rtl = ALL.filter((r) => isPhone(r.media) && /rtl/.test(r.selector)
    && selectors(r.selector).some((s) => s.includes('.chat-widget__chips')));
  assert.ok(rtl.length, 'the fade was written for a left-to-right page only, so in Arabic it dims the chip the visitor is reading');
});

/* Measured: with the sheet told its own height, a 320x568 phone had 314px to spend and
   its chrome (head 105, handoff 50, suggestions 44, composer 66) took 265 of them,
   leaving 38px of conversation inside 464px of messages. Production gave 176px there,
   but it bought that by standing 9,403px² across the install pill and sawing the
   suggestion row to a 10px sliver. A short phone has to give something up; it should be
   the header's status line, not the conversation. */
const isShort = (media) => isPhone(media) && /max-height:\s*(\d+)px/.test(media);
const shortGate = (media) => Number(/max-height:\s*(\d+)px/.exec(media)[1]);

test('a short phone spends the sheet on the conversation, not on its own chrome', () => {
  const sub = decls('.chat-widget__head-sub', 'display').filter((d) => isShort(d.media));
  assert.ok(sub.length && last(sub).value === 'none',
    'the header status line still costs the sheet a row on a short phone, where the conversation is what the visitor came to read');
  for (const d of sub) {
    assert.ok(shortGate(d.media) <= 700,
      `the diet fires at max-height:${shortGate(d.media)}px, so an ordinary phone loses its status line for no reason`);
  }
});

test('the diet never touches the suggestions or the composer', () => {
  for (const sel of ['.chat-widget__chips', '.chat-widget__form']) {
    const hidden = decls(sel, 'display').filter((d) => isPhone(d.media) && /none/.test(d.value));
    assert.deepEqual(hidden, [], `${sel} is hidden on a phone — the visitor cannot read a suggestion or send a reply from a sheet that removed it`);
  }
});

/* Measured on the live origin after the phone pass shipped (v165), because the owner
   came back and said the box had not grown: at 1440x900 the panel painted 500px of a
   granted 581px, and at 768x1024 it painted 500px of a granted 705px. Only a phone was
   ever told its height — above 640px the panel still had just a floor and a ceiling, so
   its own content kept arguing for 500px and the room it was already allowed stayed
   empty. The phone defect and the desk defect are the same defect; the fix has to cover
   both, or the owner is right that nothing got bigger. */
const isDesk = (media) => !isPhone(media);

test('the panel above 640px is told its height too, not just its ceiling', () => {
  const height = decls('.chat-widget__panel', 'height').filter((d) => isDesk(d.media));
  assert.ok(height.length,
    'the desk panel declares no height: with only a floor and a ceiling the box is sized by its own content, so it rendered 500px of a granted 581px at 1440x900 and 500px of a granted 705px at 768x1024 while the owner waited for it to get bigger');
  const d = last(height);
  assert.match(d.value, /--chat-h/,
    `the stated height must stop at the panel's own ceiling or it overruns the screen at 1080p and above — got ${d.value}`);
  assert.match(d.value, /--chat-clear|--nav-h/,
    `the height must stop under the sticky header like the old clamp did — got ${d.value}`);
  assert.match(d.value, /--chat-queue|--queue-h/,
    `the height must keep paying for whatever stands below it on a desk — got ${d.value}`);
  assert.match(d.value, /100dvh/,
    `no viewport term means the height cannot follow the window it is in — got ${d.value}`);

  /* The ceiling and the height must price the identical lane: a max-height left
     on the old arithmetic would clip the fill straight back to what it replaced. */
  const max = last(decls('.chat-widget__panel', 'max-height').filter((x) => isDesk(x.media)));
  assert.ok(max, 'the desk panel has no ceiling to cap the new height against');
  const norm = (v) => v.replace(/\s+/g, '').replace(/100vh/g, '100dvh');
  assert.equal(norm(max.value), norm(d.value),
    `the ceiling still prices (${norm(max.value)}) what the height now prices (${norm(d.value)}) — the fill is clipped back to the figure the height replaced`);

  /* The floor has to go the same way the phone took it, or a panel shorter than
     --chat-min pushes its own composer under the queue it is told to clear. */
  const min = last(decls('.chat-widget__panel', 'min-height').filter((x) => isDesk(x.media)));
  assert.ok(min, 'the desk panel lost its floor entirely — a 300px window now has nothing holding the composer on screen');
  assert.match(min.value, /--chat-min/,
    `the desk floor must stay the token it was, clamped to the room — got ${min.value}`);
});
