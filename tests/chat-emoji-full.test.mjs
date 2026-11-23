import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

/* The composer's emoji sheet shipped as a typed-out list of fifty-six glyphs, which
   is what a person writes down when there is no source to read from. There is a
   source: the Unicode Consortium publishes emoji-test.txt, and every line marked
   `fully-qualified` in it is an emoji a keyboard is allowed to offer — 3,963 of them
   in version 18.0, in the order CLDR recommends for palettes, each with the English
   name that makes a search box possible. That file is committed under tools/vendor/
   so the data set can be audited against it and regenerated when Unicode moves, and
   the picker below is checked against it here rather than against a number someone
   remembered.

   The set is too big to bake into js/chat.js, which every page loads: the phone has
   been measured, and byte it does not need at boot is byte it pays for. So the glyphs
   live in data/emoji.json and the sheet fetches them the first time somebody opens
   it, and paints them in chunks because three and a half thousand buttons handed to a
   phone at once is a different kind of slow. */

const FULL = ['zh', 'tw', 'sw', 'ru', 'pt', 'nl', 'it', 'hi', 'fr', 'es', 'de', 'ar'];

/* Every fully-qualified line in the Unicode source, kept in group order. The
   Component group holds skin tones and hair, which are never shown on their own, so
   it drops out with the other empty groups. */
function sourceGroups() {
  const out = [];
  let current = null;
  for (const line of read('tools/vendor/emoji-test.txt').split('\n')) {
    const g = line.match(/^# group: (.+)$/);
    if (g) {
      current = { label: g[1], items: [] };
      out.push(current);
      continue;
    }
    const fq = line.match(/^([0-9A-F ]+) +; fully-qualified +# (\S+) E[0-9.]+ (.+)$/);
    if (fq && current) current.items.push(fq[2] + ' ' + fq[3]);
  }
  return out.filter((g) => g.items.length);
}

function pages() {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (name.endsWith('.html') && read(path.join(dir, name)).includes('js/chat.js')) found.push(path.join(dir, name));
    }
  }
  return found;
}

test('the emoji data file is the Unicode set, glyph for glyph and in order', () => {
  const json = JSON.parse(read('data/emoji.json'));
  const expected = sourceGroups();
  assert.deepEqual(Object.keys(json.groups), expected.map((g) => g.label),
    'the sheet must offer the Unicode groups, in the Unicode order');
  let total = 0;
  for (const group of expected) {
    assert.deepEqual(json.groups[group.label], group.items,
      group.label + ' is not what the source says it is');
    total += group.items.length;
  }
  assert.equal(json.count, total, 'the file miscounts its own glyphs');
  assert.ok(total >= 3900, 'only ' + total + ' emoji — that is a shortlist, not the set');
  assert.ok(json.source.includes('emoji-test.txt'), 'the file must say where its glyphs come from');
});

test('the set is fetched when the sheet opens, never at boot', () => {
  const chat = read('js/chat.js');
  assert.doesNotMatch(chat, /const EMOJI = \[/, 'the typed-out shortlist is still in the boot file');
  assert.match(chat, /fetch\("\/data\/emoji\.json/,
    'the fetch must be root-relative — a blog page would ask for blog/data/emoji.json');
  assert.match(chat, /function showEmoji\(\)[\s\S]{0,400}loadEmoji\(\)/,
    'opening the sheet does not ask for the set');
  const bought = pages().filter((p) => /emoji\.json/.test(read(p)));
  assert.deepEqual(bought, [], 'a page that loads the emoji set at boot costs every phone its bytes');
  assert.doesNotMatch(read('sw.js'), /emoji\.json/,
    'the service worker precaching the set would put it in the shell the phone installs');
});

test('the sheet can be searched, tabbed and scrolled without drowning the panel', () => {
  const chat = read('js/chat.js');
  for (const cls of ['chat-widget__emoji-search', 'chat-widget__emoji-tabs', 'chat-widget__emoji-grid']) {
    assert.ok(chat.includes(cls), 'the sheet has no ' + cls);
  }
  assert.match(chat, /type\s*=\s*["']search["']/, 'the search row is not a search field');
  assert.match(chat, /role["']?\s*(?:=|,)\s*["']dialog["']/, 'the sheet lost its dialog role');
  assert.match(chat, /data-i18n-off/, 'the grid must be exempt: 3,963 English names are not dictionary keys');

  const chunk = chat.match(/CHUNK\s*=\s*(\d+)/);
  assert.ok(chunk, 'nothing paints the grid in chunks');
  assert.ok(Number(chunk[1]) <= 260, 'a chunk of ' + chunk[1] + ' buttons is not a chunk');
  assert.match(chat, /addEventListener\(["']scroll["']/, 'nothing asks for the next chunk');

  const css = read('css/style.css');
  const grid = css.match(/\.chat-widget__emoji-grid\{([^}]*)\}/);
  assert.ok(grid, 'the grid has no rule of its own');
  assert.match(grid[1], /overflow-y:\s*auto/, 'the grid cannot scroll, so it would grow the panel');
  const sheet = css.match(/\.chat-widget__emoji\{([^}]*)\}/g).filter((r) => /display:flex/.test(r));
  assert.equal(sheet.length, 1, 'the sheet should be one flex column, not ' + sheet.length);
  assert.match(sheet[0], /max-height:/, 'the sheet is unbounded, so a long list would eat the panel');
  assert.match(sheet[0], /overflow:hidden/, 'the sheet must clip its own rows, not pass the growth up');

  // The phone sheet is found by what it styles, not by where it sits: the sheet is
  // append-only CSS, so any later 640 block for another component used to steal this.
  const phone = [...css.matchAll(/@media \(max-width:640px\)\{[\s\S]*?\n\}/g)]
    .filter((b) => b[0].includes('.chat-widget__emoji')).pop();
  assert.ok(phone, 'no phone block styles the emoji sheet at all');
  assert.match(phone[0], /\.chat-widget__emoji\{[^}]*max-height/, 'the phone sheet is unbounded');
  assert.match(phone[0], /\.chat-widget__emoji-grid\{[^}]*grid-template-columns:repeat\(7/,
    'the phone grid stopped being seven across');
});

test('every word the sheet speaks is keyed in the twelve full dictionaries', () => {
  const chrome = ['Search emoji', 'Loading emoji', 'No emoji match that search', 'More emoji',
    'The emoji list could not load'];
  const words = chrome.concat(sourceGroups().map((g) => g.label));
  for (const code of FULL) {
    const dict = JSON.parse(read('i18n/' + code + '.json'));
    for (const key of words) {
      assert.ok(Object.prototype.hasOwnProperty.call(dict, key), code + ' has no "' + key + '"');
      assert.notEqual(dict[key], key, code + ' leaves "' + key + '" untranslated');
    }
  }
});

test('a pick still lands where the caret is', () => {
  const chat = read('js/chat.js');
  assert.match(chat, /function putEmoji\(glyph\)/, 'the caret-aware insert is gone');
  assert.match(chat, /putEmoji\(glyph\)/, 'nothing calls it from the sheet');
  assert.match(chat, /if \(e\.key !== "Escape" \|\| emojiPop\.hidden\) return;/,
    'Escape no longer closes the sheet before it closes the chat');
  assert.match(chat, /emojiBtn\.setAttribute\("aria-expanded"/, 'the toggle button stopped saying when it is open');
});
