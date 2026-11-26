import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const has = (p) => existsSync(path.join(root, p));

/* The twelve dictionaries that carry the whole site and the twenty-seven that carry
   only the shell. A pill bolted to the shell has to speak every one of them: an
   English dialog in a Vietnamese page is not localisation, it is a missing file. */
const FULL = ['zh', 'tw', 'sw', 'ru', 'pt', 'nl', 'it', 'hi', 'fr', 'es', 'de', 'ar'];
const ALL = readdirSync(path.join(root, 'i18n'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => n.slice(0, -5))
  .sort();

// Pages that show the shared nav/footer — the same definition help-feedback uses.
const chromePages = (() => {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      if (read(rel).includes('footer__legal')) found.push(rel);
    }
  }
  return found;
})();

// Pages that are deliberately outside the shell: no stylesheet, no chrome, no chat.
const SHELLLESS = ['offline.html', 'haul.html', 'google6f29a84dcee68241.html'];

const script = has('js/report.js') ? read('js/report.js') : '';
const sheet = read('css/style.css');
const dict = (code) => JSON.parse(read(`i18n/${code}.json`));

/* The dialog's whole vocabulary, read out of the one object that holds it. A copy
   table is a table on purpose: this file can enumerate it, and a sentence added
   anywhere else is a sentence no dictionary has ever been asked about. */
const copyTable = () => {
  const block = script.match(/\bvar COPY = \{([\s\S]*?)\n\s*\};/);
  assert.ok(block, 'js/report.js keeps no COPY table — every sentence it paints must be enumerable');
  const out = [];
  for (const m of block[1].matchAll(/^\s*\w+:\s*"((?:[^"\\]|\\.)*)"/gm)) out.push(m[1]);
  assert.ok(out.length >= 12, `the copy table holds ${out.length} sentences, expected the dialog's full set`);
  return out;
};

const asked = (file, page) => {
  const m = read(page).match(new RegExp(`js/${file}\\.js\\?v=(\\d+)`));
  return m ? Number(m[1]) : null;
};

test('the pill stands on every page that wears the site shell, and on no page that cannot dress it', () => {
  assert.ok(has('js/report.js'), 'js/report.js is not there');
  assert.ok(chromePages.length >= 50, `expected the shell pages, found ${chromePages.length}`);
  for (const page of chromePages) {
    assert.match(read(page), /<script src="(?:\.\.\/)?js\/report\.js\?v=\d+" defer><\/script>/,
      `${page} wears the shell but never asks for the feedback pill`);
  }
  for (const page of SHELLLESS) {
    assert.doesNotMatch(read(page), /js\/report\.js/,
      `${page} carries no site stylesheet, so a pill there would paint unstyled or promise a send it cannot make`);
  }
  /* A page at the root asks for its scripts bare. `../js/…` there only works because a
     browser clamps above the origin root, which is a courtesy a subpath deploy does not
     extend — and one prefixed tag among fourteen bare ones is how a bulk edit betrays
     itself. Depth has to be measured, not assumed the same for every directory. */
  for (const page of chromePages) {
    const depth = page.split('/').length - 1;
    const tag = read(page).match(/<script src="((?:\.\.\/)?)js\/report\.js\?v=\d+"/);
    assert.ok(tag, `${page} has a pill tag this file cannot read`);
    assert.equal(tag[1].split('../').length - 1, depth,
      `${page} sits ${depth} directories down and asks for the pill with the wrong prefix`);
  }
});

test('the keyboard hint is a hint, not a sentence a translator has to render', () => {
  assert.match(script, /aria-hidden", "true"/,
    'the shortcut glyphs are printed to a screen reader as prose');
  assert.match(script, /e\.key === "f"[\s\S]{0,120}(e\.metaKey|e\.ctrlKey)/,
    'nothing binds the feedback key');
  assert.match(script, /metaKey \|\| e\.ctrlKey/,
    'the binding works on one platform only, so the printed hint is a lie on the other');
  /* The hint used to ride inside the corner mark. A 44px circle cannot carry ⌘⌥F, so it
     is printed in the dialog it opens instead — and still only where a keyboard exists. */
  assert.match(sheet, /\.report-modal__key\{display:none[^}]*\}[\s\S]{0,400}@media \(hover:hover\) and \(pointer:fine\)\{\.report-modal__key\{display:block\}\}/,
    'a phone with no keyboard is shown a ⌘⌥F it cannot press');
});

test('the corner holds one round mark, and says in words what it means', () => {
  assert.match(sheet, /\.report-pill\{display:grid;place-items:center;width:44px;height:44px;border-radius:50%/,
    'the corner is not the single round badge the reference hangs');
  assert.match(script, /el\("span", "report-pill__mark", "\?"\)/,
    'the mark itself is missing');
  assert.match(script, /pill\.setAttribute\("aria-label", COPY\.pill\)/,
    'a "?" paints nothing a screen reader can name, so the badge has to say what it opens');
  assert.doesNotMatch(script, /report-pill__label/,
    'the badge grew its sentence back and now the corner is a bar again');
  assert.doesNotMatch(sheet, /\.report-help\{/,
    'a second question mark hangs beside the first, and the two do different things');
  assert.match(script, /el\("a", "report__help", COPY\.help\)/,
    'the way into the help centre went out with the second circle');
});

test('the dialog behaves like the dialogs the rest of the site already has', () => {
  assert.match(script, /setAttribute\("role", "dialog"\)/);
  assert.match(script, /setAttribute\("aria-modal", "true"\)/);
  assert.match(script, /setAttribute\("aria-labelledby", "report-title"\)/);
  assert.match(script, /e\.key === "Escape"/, 'Escape leaves the visitor inside the dialog');
  assert.match(script, /e\.key !== "Tab"/, 'Tab walks out of the dialog into the page behind it');
  assert.match(script, /lastFocus[\s\S]{0,80}focus\(\{ preventScroll: true \}\)/,
    'closing the dialog drops the visitor where the page was scrolled, not on the pill they opened it from');
  assert.match(script, /scrim/, 'the backdrop cannot be clicked away, unlike every other modal here');
});

test('Send waits for words, and the row it writes says where the words came from', () => {
  assert.match(script, /send\.disabled = !text\(\)/,
    'an empty note can be posted, which the studio reads as noise');
  const payload = script.match(/var payload = \{([\s\S]*?)\n\s*\};/);
  assert.ok(payload, 'js/report.js builds its request somewhere this file cannot read');
  assert.match(payload[1], /topic: "other"/, 'a dialog note is filed as an answer rating');
  assert.match(payload[1], /article: "site"/, 'a dialog note is filed against one named page it did not come from');
  assert.match(payload[1], /page: location\.pathname/,
    'the row loses the page the visitor was actually standing on');
  assert.doesNotMatch(payload[1], /rating|vote/,
    'the dialog claims a star rating it never asked for, which would bend the help page numbers');
  assert.match(payload[1], /_site/, 'the dialog posts without the honeypot every other writer posts');
  assert.match(script, /AbortSignal\.timeout/, 'a dead function leaves Send pressed forever');
});

test('the screenshots tile promises nothing it cannot do', () => {
  assert.match(script, /setAttribute\("aria-disabled", "true"\)/,
    'the tile looks pressable to an AT user while nothing is behind it');
  assert.match(script, /Screenshot attachments open with the next release\./,
    'the tile says nothing about why it will not take a file');
  assert.doesNotMatch(script, /type="file"|FormData|input\[type=file\]/,
    'the dialog accepts a screenshot it has nowhere to put — there is no storage bucket in this project');
});

test('it only offers the assistant to pages that have one', () => {
  const guard = script.indexOf('.chat-widget__toggle');
  const ask = script.indexOf('report__ask');
  assert.ok(guard > -1, 'the footer action is added whether or not an assistant exists on this page');
  assert.ok(ask > -1, 'there is no ask-the-assistant action at all');
  assert.ok(ask > guard && ask - guard < 400,
    'the ask action is built outside the guard that looks for an assistant, so 404.html would offer a chat it has no script for');
});

test('every sentence the dialog paints is a key in all thirty-nine dictionaries', () => {
  const keys = copyTable();
  const missing = [];
  for (const code of ALL) {
    const d = dict(code);
    for (const k of keys) if (!(k in d)) missing.push(`${code}: ${k.slice(0, 52)}`);
  }
  assert.equal(missing.length, 0,
    `${missing.length} dialog sentences are unkeyed:\n  ${missing.slice(0, 20).join('\n  ')}`);

  /* Presence is not translation. A tier dictionary that carries the English bytes is
     the lazy way through the gate above, so the eight sentences this change introduced
     are required to read differently in every language but English. */
  const NEW = keys.filter((k) => /^(Problem feedback|What would you like to share\?|Tell us about a problem|Problem or suggestion \(required\)|Describe what happened|Screenshots$|Screenshot attachments|Ask the studio assistant)/.test(k));
  assert.equal(NEW.length, 8, `expected the eight new sentences, matched ${NEW.length}`);
  const untranslated = [];
  for (const code of ALL) {
    if (FULL.includes(code) && code === 'en') continue;
    const d = dict(code);
    for (const k of NEW) if (d[k] === k) untranslated.push(`${code}: ${k.slice(0, 40)}`);
  }
  assert.equal(untranslated.length, 0,
    `left in English:\n  ${untranslated.slice(0, 12).join('\n  ')}`);
});

test('the pill cannot make the bottom edge the whole site is sized against grow', () => {
  assert.match(read('js/app.js'), /var QUEUE = "[^"]*\.report-pair/,
    'the badge is not charged to the queue, so a pinned band can paint under it');
  const pair = sheet.match(/\.report-pair\{([^}]*)\}/);
  assert.ok(pair, 'the badge has no CSS of its own');
  const bottom = (pair[1].match(/bottom:([\d.]+)rem/) || [])[1];
  const height = (pair[1].match(/height:([\d.]+)px/) || [])[1];
  assert.ok(bottom && height, 'the badge must state its own bottom offset and height for this check');
  /* The assistant bubble the badge shares a column with is 56px tall and stands on the
     same 1.5rem, so the edge is already paid for at 80px. A 44px mark on that same line
     costs 68px, which is why the corner can hold it without a single stage being
     re-measured — reserve() reads the rect, not this arithmetic. */
  assert.ok(Number(bottom) * 16 + Number(height) <= 1.5 * 16 + 56,
    `the badge reaches ${Number(bottom) * 16 + Number(height)}px from the bottom edge; the bubble only reaches 80px`);
});

test('a send that locked its own button still hands the visitor back to the badge', () => {
  /* A successful send disables Send, and focus cannot land on a disabled control, so the
     old restore left the caret inside a dialog that had already closed. A visitor who
     opened it by its key from the page body was stranded the same way, because focusing
     the body is nothing at all. */
  assert.match(script, /lastFocus !== doc\.body && !lastFocus\.disabled\) \? lastFocus : pill/,
    'closing can hand focus back to something that cannot take it');
});

/* Two dialogs cannot both own the tab order. The arrival card the home page raises is a
   modal with its own Tab trap, and the feedback key is bound on the document with no
   qualifier, so a visitor who pressed ⌘⌥F while the studio's offer was up got this dialog
   painted over the card with both traps live — Tab then moved focus around a card the
   visitor could not see. Opening therefore retires the card through its own close control,
   which is the path promo.js already exposes, instead of reaching into its state. */
test('the feedback key never leaves two dialogs fighting for the tab order', () => {
  const body = script.slice(script.indexOf('function open()'), script.indexOf('function close('));
  assert.match(body, /#home-promo:not\(\[hidden\]\) \.promo__close/,
    'the dialog opens without noticing the arrival card the home page raises');
  assert.match(body, /if \(arrival\) arrival\.click\(\)/,
    'the card is dismissed by something other than its own close control, so promo.js state can drift');
  assert.match(body, /lastFocus = arrival \? pill : doc\.activeElement/,
    'focus is captured from a card that has just been hidden, so closing the dialog strands the caret');
});

test('the cache ledger moved with the files it caches', () => {
  const ledger = Number((read('index.html').match(/css\/style\.min\.css\?v=(\d+)/) || [])[1]);
  assert.ok(ledger >= 201, `the stylesheet is still served as v${ledger}; this change rewrote it`);
  for (const page of chromePages) {
    assert.ok((asked('report', page) || 0) >= 3, `${page} caches a pill that leaves the arrival card up`);
    const sheetMatch = read(page).match(/css\/style\.min\.css\?v=(\d+)/);
    if (sheetMatch) assert.ok(Number(sheetMatch[1]) >= 201, `${page} still caches an older sheet`);
    if (/js\/chat\.js/.test(read(page))) {
      assert.ok(asked('chat', page) >= 48, `${page} caches a chat that cannot hear bh-chat-open`);
    }
    if (/js\/app\.js/.test(read(page))) {
      assert.ok(asked('app', page) >= 13, `${page} caches an app.js whose queue ignores the pair`);
    }
  }
  assert.match(read('js/translate.js'), /i18n\/" \+ code \+ "\.json\?v=(1[2-9]\d|[2-9]\d\d)/,
    'the dictionaries were rewritten and are still fetched under the old version');
  assert.match(read('sw.js'), /const CACHE = "brownhub-v(1[7][4-9]|[1-9]\d\d)"/,
    'an HTML and CSS change shows no installed copy unless the cache name is renamed');
});

test('the dialog is built, not pasted', () => {
  assert.doesNotMatch(script, /innerHTML/,
    'innerHTML is where a visitor-typed sentence becomes markup');
  assert.match(script, /createElement/, 'the dialog is not built from nodes');
});
