// A visitor attaches a flyer photograph or a clip of the press so the studio can see exactly
// what they mean. Several separate things have to hold before that picture is worth anything,
// and each is its own test: the page's own CSP has to admit a locally picked file into an <img>
// at all, a clip has to be handed an element that can play it, what does arrive has to fill the
// bubble instead of sitting in a stamp and has to be met from its top edge, and a document must
// still travel as a named chip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const driver = read('js/chat.js');
const sheet = read('css/style.css');

const pages = (() => {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    const base = path.join(root, dir);
    for (const name of readdirSync(base)) {
      if (name.endsWith('.html')) found.push(path.join(dir, name));
    }
  }
  return found;
})();

const chatHosts = pages.filter((p) => /js\/chat\.js/.test(read(p)));

// The source of one top-level-ish function, braces matched so a nested block cannot end it early.
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no function ${name}() in js/chat.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`${name}() never closed`);
}

// Rules whose selector list carries a token, in the order the sheet declares them. The last one
// is what the browser lands on, because the chat layer is appended rather than rewritten.
function rulesFor(token) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(sheet))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (sel.startsWith('@') || !sel.includes(token)) continue;
    out.push({ sel, body: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const prop = (body, name) => (body.match(new RegExp(`(?:^|;)\\s*${name}:([^;]*)`)) || [])[1]?.trim();

test('the site ships a CSP on every page that hosts the assistant', () => {
  assert.ok(chatHosts.length >= 50, `only ${chatHosts.length} pages load js/chat.js`);
  for (const p of chatHosts) {
    assert.match(read(p), /http-equiv="Content-Security-Policy"/, `${p} has no policy of its own`);
  }
});

test('a picture the visitor picked is allowed into an <img>', () => {
  // blob: is the only scheme a file input can hand the page without a round trip to a server,
  // and a policy that omits it blocks the attachment the visitor is looking at.
  const blocked = [];
  for (const p of chatHosts) {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read(p))?.[1];
    assert.ok(csp, `${p}: no CSP content to read`);
    const imgSrc = (/(?:^|;\s*)img-src([^;]*)/.exec(csp) || [])[1] || '';
    if (!imgSrc.includes('blob:')) blocked.push(`${p} -> img-src${imgSrc}`);
  }
  assert.deepEqual(blocked, [], `${blocked.length} page(s) block their own attachments:\n${blocked.slice(0, 3).join('\n')}`);
});

test('a clip in a sent message is given an element that can play it', () => {
  const body = fnBody(driver, 'sendNow');
  assert.match(body, /createElement\(isClip \? "video" : "img"\)/, 'a clip is not built as a <video>');
  assert.match(body, /\.controls = true/, 'the clip has no transport of its own');
  assert.match(body, /playsInline = true/, 'the clip hijacks the whole phone screen when it starts');
  assert.match(body, /preload = "metadata"/, 'every attached clip downloads before the reader asks for it');
  // A video blob in an <img> cannot decode, and a ▶ badge over a blank box is the old defect.
  assert.doesNotMatch(body, /chat-msg__play/, 'the sent message still fakes a player with a badge');
});

test('a photo in a sent message is still a picture with a name', () => {
  const body = fnBody(driver, 'sendNow');
  assert.match(body, /\.alt = f\.name/, 'the photograph carries no name for a reader who cannot see it');
  assert.match(body, /docEl\(f\)/, 'a document is no longer handed to the chip builder');
  const chip = fnBody(driver, 'docEl');
  assert.match(chip, /chat-msg__doc/, 'the chip a document rides in lost its class');
  assert.match(chip, /file\.name/, 'the chip no longer says which file it is');
});

test('an attachment no engine can paint falls back to its name', () => {
  // A phone hands over HEIC and AVI; a broken-image glyph says nothing, the filename says both.
  const body = fnBody(driver, 'sendNow');
  assert.match(body, /addEventListener\("error"/, 'an undecodable attachment is left to break in place');
  assert.match(read('css/style.css'), /\.chat-msg__doc\{/, 'the chip it falls back to lost its rule');
});

test('the tray under the composer shows the real first frame of a clip', () => {
  const body = fnBody(driver, 'paintFiles');
  assert.match(body, /createElement\((?:\s*"video"|isClip \? "video")/, 'the tray paints a clip as a still that cannot exist');
});

test('attached media fills the bubble instead of a stamp', () => {
  const rules = rulesFor('.chat-msg__media img');
  assert.ok(rules.length, 'no rule sizes the attached picture');
  const win = rules[rules.length - 1];
  assert.match(win.sel, /\.chat-msg__media video/, `${win.sel} sizes a picture but leaves the clip to its own default`);
  const maxH = prop(win.body, 'max-height') || '';
  assert.match(win.body, /max-width:\s*100%/, `the picture is capped at ${prop(win.body, 'max-width')}, not the bubble`);
  assert.doesNotMatch(maxH, /12rem/, 'the bubble still caps at the old thumbnail height');
  const vh = Number((/(\d+(?:\.\d+)?)vh/.exec(maxH) || [])[1] || 0);
  const rem = Number((/(\d+(?:\.\d+)?)rem/.exec(maxH) || [])[1] || 0);
  assert.ok(vh >= 40 && rem >= 20, `max-height:${maxH} is too short for a flyer or a portrait photo`);
  assert.equal(prop(win.body, 'object-fit'), 'contain', 'the attachment gets cropped to its box');
  assert.equal(prop(win.body, 'height'), 'auto', 'the attachment cannot keep its own ratio');
});

test('several attachments stack so each one gets the full width', () => {
  const rules = rulesFor('.chat-msg__files');
  const win = rules[rules.length - 1];
  assert.ok(win, 'no rule lays out the attachment strip');
  assert.equal(prop(win.body, 'flex-direction'), 'column', 'attachments share a row and each one loses half the bubble');
});

test('a sent attachment keeps its top edge while the studio thinks', () => {
  // Measured in a real Blink frame. While the visitor waits, the composer still holds their
  // pending files, which leaves the thread 349px on a desk and 322px on a phone — and a flyer
  // shown at full width stands 415px and 333px, a flyer plus a clip in one message 610px. So
  // pinning the scroller's bottom lands the reader on the tail of their own picture, and the
  // dots are appended in the same tick, which means aligning only the send buys them a blink.
  const hold = fnBody(driver, 'holdSentMedia');
  assert.match(hold, /chat-msg__media/, 'the hold never looks for the attachment');
  assert.match(hold, /chat-msg--typing/, 'the hold ignores what was appended after the send');
  assert.match(fnBody(driver, 'sendNow'), /holdSentMedia\(\)/, 'the send pins the bottom of the thread');
  assert.match(fnBody(driver, 'typingBubble'), /holdSentMedia\(\)/, 'the waiting dots tear the picture the visitor just sent off the screen');
  // The answer itself is content the visitor is waiting for, so it still gets the view.
  assert.match(fnBody(driver, 'addPlain'), /scrollDown\(\)/, 'the answer no longer gets the view');
});
