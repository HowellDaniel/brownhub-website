import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const has = (p) => existsSync(path.join(root, p));

/* The twelve dictionaries that carry the whole site and the twenty-seven that carry only
   the shell add up to every language a pill bolted to the shell has to speak. An English
   dialog in a Vietnamese page is not localisation, it is a missing file. */
const ALL = readdirSync(path.join(root, 'i18n'))
  .filter((n) => n.endsWith('.json'))
  .map((n) => n.slice(0, -5))
  .sort();

// Pages that show the shared nav/footer — the same definition help-feedback uses.
const chromePages = (() => {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      // A leading dot is a rig fixture, and GitHub Pages never serves one anyway.
      if (name.startsWith('.') || !name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      if (read(rel).includes('footer__legal')) found.push(rel);
    }
  }
  return found;
})();

// Pages deliberately outside the shell that also cannot carry the pill at all.
const SHELLLESS = ['offline.html', 'google6f29a84dcee68241.html'];

/* Haul wears no site stylesheet on purpose: it renders from its own inline tokens so a
   visitor arriving from search still sees BrownHub even if the sheet moves. That is a
   reason the pill has to be dressed inside the page, not a reason to leave the page with
   no way to tell the studio anything went wrong. A page joins this list only when it owns
   every rule below in its own <style>. */
const STANDALONE = ['haul.html'];

/* The rules a pill cannot do without. Without .hp the hidden file picker and the honeypot
   both turn visible; without the [hidden] arm an author rule beats the UA sheet and the
   dialog sits as a permanent grid over the page; without the card the words land directly
   on the scrim. */
const DIALOG_RULES = ['.report-pill', '.report-modal', '.report-modal[hidden]', '.report-modal__card',
  '.report-modal__scrim', '.report-form', '.form-field', '.report__note', '.report__shots',
  '.report__send', '.hp', '.report-open'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `(?![-\w])` so `.report-modal` proves its own rule and is not credited to `.report-modal__card`.
const carries = (css, sel) => new RegExp(esc(sel) + '(?![-\\w])').test(css);

const dressesDialog = (page) => {
  const html = read(page);
  const sheetDresses = /href="(?:\.\.\/)?css\/style(?:\.min)?\.css/.test(html)
    && DIALOG_RULES.every((sel) => carries(sheet, sel));
  if (sheetDresses) return true;
  const inline = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
  return DIALOG_RULES.every((sel) => carries(inline, sel));
};

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

/* A regex on a key binding only proves the sentence is spelled the way the last author
   left it. Reaching the handler with a real event shape is the only thing that proves
   ⌘⌥F opens the dialog on the machine the hint was printed for, so the predicate is cut
   out of the file and run here — production logic, not a picture of it. */
function runnable(name, constants) {
  const at = script.indexOf(`function ${name}(`);
  assert.ok(at > -1, `js/report.js declares no ${name}() this file can run`);
  let depth = 0, i = script.indexOf("{", at);
  for (; i < script.length; i++) {
    if (script[i] === "{") depth++;
    else if (script[i] === "}" && --depth === 0) break;
  }
  assert.ok(depth === 0, `${name}() is never closed — this file cannot read it`);
  // From the `function` keyword, not the brace: a bare block runs the body at once.
  const src = script.slice(at, i + 1);
  // The gate reads its limits out of the file's own scope; hand it the real bytes, and fail
  // loudly if a constant it depends on is spelled but never declared.
  const preamble = (constants || []).map((c) => {
    const line = script.match(new RegExp(`^\\s*var ${c} = [^\\n]*\\n`, 'm'));
    assert.ok(line, `${name}() leans on ${c}, which this file cannot find to give it`);
    return line[0];
  }).join('');
  try {
    return new Function(`${preamble}${src}; return ${name};`)();
  } catch (e) {
    return assert.fail(`${name}() does not run as written: ${e.message}`);
  }
}

test('the pill stands on every page that wears the site shell, and on no page that cannot dress it', () => {
  assert.ok(has('js/report.js'), 'js/report.js is not there');
  assert.ok(chromePages.length >= 50, `expected the shell pages, found ${chromePages.length}`);
  for (const page of chromePages) {
    assert.match(read(page), /<script src="(?:\.\.\/)?js\/report\.js\?v=\d+" defer><\/script>/,
      `${page} wears the shell but never asks for the feedback pill`);
  }
  for (const page of SHELLLESS) {
    assert.doesNotMatch(read(page), /js\/report\.js/,
      `${page} is a fallback or a verification token, not a page a visitor reads — a pill there promises a send nobody is on hand to make`);
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

/* Adding the script to a page that owns no stylesheet is the easy half, and it is the half
   that ships broken: the pill lands as a bare unlabelled button, the dialog opens as a
   full-bleed grid with nothing inside it, and the file picker plus the honeypot both turn
   visible. So the claim this file tests is not "haul asks for report.js" but "haul can show
   a visitor a dialog they would recognise as the studio's". */
test('a page outside the shell that offers the pill clothes it in its own stylesheet block', () => {
  for (const page of STANDALONE) {
    const html = read(page);
    assert.match(html, /<script src="js\/report\.js\?v=\d+" defer><\/script>/,
      `${page} is a live indexed page with no way to report a problem and no printed shortcut`);
    assert.ok((asked('report', page) || 0) >= 4,
      `${page} caches the pill as v${asked('report', page)}; the screenshots tile needs v4`);
    assert.ok(!/href="css\/style/.test(html),
      `${page} is listed as standing alone but now links the shared sheet — move it to chromePages`);
    const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
    const bare = DIALOG_RULES.filter((sel) => !carries(css, sel));
    assert.equal(bare.length, 0,
      `${page} asks for the pill but paints it naked: ${bare.join(', ')}`);
    // The mark must sit above this page's own sticky header, and the dialog above the mark.
    const pillZ = Number((css.match(/\.report-pill\b[^}]*?z-index:\s*(\d+)/s) || [])[1]
      || (css.match(/\.report-pair\b[^}]*?z-index:\s*(\d+)/s) || [])[1] || 0);
    const modalZ = Number((css.match(/\.report-modal\b(?!__)[^}]*?z-index:\s*(\d+)/s) || [])[1] || 0);
    const headerZ = Number((css.match(/\bheader\b[^}]*?z-index:\s*(\d+)/s) || [])[1] || 0);
    assert.ok(pillZ > headerZ,
      `${page}'s sticky header (z${headerZ}) would cover the feedback mark (z${pillZ})`);
    assert.ok(modalZ > pillZ,
      `${page} opens its dialog behind the mark that summoned it (modal z${modalZ} vs pill z${pillZ})`);
  }
});

/* The repository-wide half of the same claim: any page, in any directory, that asks for the
   pill has to dress it — from the shared sheet or from its own <style>. A page added tomorrow
   with the tag and no rules fails here rather than in front of a visitor. */
test('no page in the repository hangs an undressed pill', () => {
  const wearers = [];
  let inlineWearers = 0;
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (name.startsWith('.') || !name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      const html = read(rel);
      if (!html.includes('js/report.js')) continue;
      wearers.push(rel);
      if (!/href="(?:\.\.\/)?css\/style(?:\.min)?\.css/.test(html)) inlineWearers++;
    }
  }
  assert.ok(wearers.length >= 55, `expected the pages that offer the pill, found ${wearers.length}`);
  assert.ok(inlineWearers >= 1,
    'every wearer links the shared sheet — the inline half of this gate never ran and proves nothing');
  const naked = wearers.filter((page) => !dressesDialog(page));
  assert.equal(naked.length, 0,
    `the pill is offered naked on:\n  ${naked.join('\n  ')}`);
});

test('the keyboard hint is a hint, not a sentence a translator has to render', () => {
  assert.match(script, /aria-hidden", "true"/,
    'the shortcut glyphs are printed to a screen reader as prose');
  assert.match(script, /metaKey \|\| e\.ctrlKey/,
    'the binding works on one platform only, so the printed hint is a lie on the other');
  /* The hint used to ride inside the corner mark. A 44px circle cannot carry ⌘⌥F, so it
     is printed in the dialog it opens instead — and still only where a keyboard exists. */
  assert.match(sheet, /\.report-modal__key\{display:none[^}]*\}[\s\S]{0,400}@media \(hover:hover\) and \(pointer:fine\)\{\.report-modal__key\{display:block\}\}/,
    'a phone with no keyboard is shown a ⌘⌥F it cannot press');
});

/* macOS holds Option and hands the browser the glyph the key would type, so ⌥+F on the US
   layout arrives as key:"ƒ" — never "f". A binding that tests e.key against the letter was
   dead on every Mac, and the rig that green-lit it dispatched key:"f", which is the shape no
   Mac produces. Physical code is the modifier- and layout-independent answer; the glyph list
   is kept beside it because code names the US position, so an AZERTY visitor pressing their
   own F is standing on KeyG. */
test('⌘⌥F opens the dialog on the machine the hint was printed for', () => {
  const feedbackKey = runnable('feedbackKey', ['FEEDBACK_GLYPHS']);
  const MAC = { code: "KeyF", key: "ƒ", metaKey: true, altKey: true };
  assert.equal(feedbackKey(MAC), true,
    'Option+F reaches the handler as "ƒ" on macOS, so a binding on the letter never fires');
  assert.equal(feedbackKey({ code: "KeyF", key: "f", metaKey: true, altKey: true }), true,
    'a Mac that reports the letter still opens it');
  assert.equal(feedbackKey({ code: "KeyF", key: "f", ctrlKey: true, altKey: true }), true,
    'the printed Ctrl+Alt+F does nothing on Windows and Linux');
  assert.equal(feedbackKey({ key: "ƒ", metaKey: true, altKey: true }), true,
    'a layout whose physical F is not KeyF still opens it through the typed glyph');
  assert.equal(feedbackKey({ code: "KeyF", key: "F", metaKey: true }), false,
    '⌘F alone is the browser’s own find bar; the dialog must not steal it');
  assert.equal(feedbackKey({ code: "KeyF", key: "f", altKey: true }), false,
    'Option+F alone is a typed character, not the shortcut');
  assert.equal(feedbackKey({ code: "KeyG", key: "g", metaKey: true, altKey: true }), false,
    'a different key opens the dialog');
  assert.match(script, /if \(feedbackKey\(e\)\)/, 'the predicate is written but never consulted');
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

test('the screenshots tile takes a picture and says where it goes', () => {
  /* The tile used to be printed, dashed, and dead, and the honest defence was that this
     project has no bucket. It has a mail rail instead — the one the assistant already
     sends documents down — so an inert tile is no longer caution, it is just a broken
     control that tells the visitor a lie about the next release. */
  assert.match(script, /\.type = "file"/, 'the tile has no file input, so nothing can be chosen');
  assert.match(script, /\.multiple = true/, 'a visitor with two pictures is allowed to send one');
  assert.match(script, /\.accept = "image\//, 'the picker will take anything, and a spreadsheet is not a screenshot');
  assert.match(script, /new FormData\(\)/, 'a chosen picture has no carrier to the studio');
  assert.match(script, /https:\/\/formsubmit\.co\/ajax\//, 'the pictures go somewhere this file cannot name');
  assert.match(script, /fd\.append\("picture", file\)/, 'a picture is not put in the envelope under the field the mail form reads');
  assert.match(script, /function mailShot\(file, meta, next\)/,
    'several pictures ride one POST, which is the shape nobody has proven against that endpoint');
  assert.match(script, /attempt >= 1/, 'a dropped send is never tried a second time');
  assert.match(script, /COPY\.shotsBusy/, 'the visitor is given no word that pictures are still going');
  assert.match(script, /COPY\.shotsPartial/, 'a note that arrived without its evidence reads as a full success');
  assert.match(script, /\.report__picker|class(Name)? = "hp"/, 'the input is left in the layout instead of hidden the way the honeypot hides');
  /* A press has to reach the picker through a real button: a div with a click handler is
     nothing to a keyboard or a screen reader. */
  assert.match(script, /el\("button", "report__shots-open"/, 'the tile is opened by a div, which a keyboard cannot press');
  assert.match(script, /addEventListener\("dragover"/, 'a dragged picture is refused by the page, not the mail form');
  assert.match(script, /addEventListener\("drop"/, 'the drop handler does not exist');
  assert.match(script, /addEventListener\("paste"/, 'a screenshot on the clipboard — the way a screenshot gets anywhere — is ignored');
  assert.match(script, /clipboardData/, 'the paste handler reads nothing off the clipboard');
  assert.match(script, /revokeObjectURL/, 'every thumbnail leaks a blob URL for the life of the tab');
  assert.match(script, /URL\.createObjectURL/, 'the chosen picture is never shown to the visitor');
  assert.doesNotMatch(script, /shots\.setAttribute\("aria-disabled"/,
    'the tile still tells an assistive technology that it does nothing');
  assert.doesNotMatch(script, /Screenshot attachments open with the next release/,
    'the dialog still promises attachments in a release that has arrived');
});

test('the picture gate runs, and rejects for the reason it states', () => {
  const acceptsShot = runnable('acceptsShot', ['SHOT_MAX', 'SHOT_KIND']);
  const png = { type: "image/png", size: 40 * 1024 };
  assert.equal(acceptsShot(png), true, 'a small PNG screenshot is rejected');
  assert.equal(acceptsShot({ type: "image/webp", size: 40 * 1024 }), true, 'a WebP screenshot is rejected');
  assert.equal(acceptsShot({ type: "video/mp4", size: 40 * 1024 }), false, 'a clip is accepted as a screenshot');
  assert.equal(acceptsShot({ type: "application/pdf", size: 40 * 1024 }), false, 'a document is accepted as a screenshot');
  assert.equal(acceptsShot({ type: "", size: 40 * 1024 }), false, 'a file with no type is accepted as a screenshot');
  assert.equal(acceptsShot({ type: "image/png", size: 11 * 1024 * 1024 }), false,
    'an 11 MB picture is accepted, and the mail rail the site rides drops it silently');
  assert.equal(acceptsShot(undefined), false, 'no file passes the gate');

  /* The caption states the limits, the gate enforces them, and the picker offers them. Three
     lists of one fact is where a change gets forgotten, so they are read against each other. */
  assert.equal(Number((script.match(/var SHOT_MAX = (\d+) \* 1024 \* 1024/) || [])[1]), 10,
    'the gate no longer matches the "up to 10 MB each" the visitor is told');
  assert.equal(Number((script.match(/var SHOT_CAP = (\d+)/) || [])[1]), 3,
    'the gate no longer matches the "up to 3 pictures" the visitor is told');
  assert.match(script, /picked\.length >= SHOT_CAP/, 'a fourth picture is pushed past the cap');
  const kindsLine = script.split("\n").find((l) => l.trim().indexOf("var SHOT_KIND = ") === 0) || "";
  const kinds = (kindsLine.match(/\(([^)]+)\)/) || [])[1];
  assert.ok(kinds, 'the picture gate is not an image list this file can read');
  const offered = ((script.match(/\.accept = "([^"]+)"/) || [])[1] || "")
    .split(",").map((s) => s.replace("image/", "").trim());
  const gate = kinds.split("|").flatMap((k) => (k === 'jpe?g' ? ["jpeg", "jpg"] : [k]));
  for (const type of gate) {
    if (type === "jpg") continue;
    assert.ok(offered.indexOf(type) > -1,
      `the gate takes ${type} but the picker will not offer it — a visitor cannot choose what the dialog says is fine`);
  }
});

/* FormSubmit prints the _subject field as the envelope subject. Building it from anything a
   visitor typed would let one line of the note choose what the studio’s mail client shows, and
   a reply header is not a place for unsanitised prose. */
test('the mail subject is built from the page, never from the visitor’s words', () => {
  const shotSubject = runnable('shotSubject');
  const line = shotSubject("/catalog.html", 2, 1);
  assert.match(line, /\/catalog\.html/, 'the subject does not say which page the picture came from');
  assert.match(line, /1 of 2/, 'the subject does not number the picture, so three mails cannot be reassembled');
  const src = script.slice(script.indexOf("function shotSubject("));
  assert.doesNotMatch(src.slice(0, src.indexOf("\n  }") + 4), /text\(\)|note\.value|contact\.value|message/,
    'the visitor’s note or number reaches the envelope subject');
});

/* GitHub Pages answers any path it does not have with 404.html, and that page wears the shell and
   loads this script — so the pathname the subject is built from is entirely the sender’s choosing.
   A stranger should not get to write the whole first line of a mail that lands in the studio’s
   inbox, so the path keeps only the characters a path can hold and is cut to a length a mail
   client can actually show. */
test('a crafted URL cannot write the whole mail subject', () => {
  const shotSubject = runnable('shotSubject');
  const loud = shotSubject("/" + "WIN".repeat(140) + "!.html", 1, 1);
  assert.ok(loud.length <= 160, `a URL runs the subject out to ${loud.length} characters`);
  const shaped = shotSubject("/price\n<b>ƒ</b>.html", 1, 1);
  assert.doesNotMatch(shaped, /[\n\r\t<>]/, 'a URL puts a line break or markup into the subject');
  assert.doesNotMatch(shaped, /[^\x20-\x7e]/, 'a URL puts a character outside plain text into the subject');
  assert.match(shaped, /price/, 'the subject stops naming the page the picture came from');
});

/* CSP is declared per page, and a page that allows the capture endpoint but not the mail host
   would offer a tile whose send can only ever fail. Fifty-four pages carry the pill. */
test('every page that offers the tile is allowed to send it', () => {
  const blocked = [];
  for (const page of chromePages) {
    const html = read(page);
    const m = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/);
    if (!m) { blocked.push(`${page}: no CSP`); continue; }
    const connect = (m[1].match(/connect-src([^;]*)/) || [])[1] || "";
    const img = (m[1].match(/img-src([^;]*)/) || [])[1] || "";
    if (connect.indexOf("formsubmit.co") < 0) blocked.push(`${page}: connect-src`);
    if (img.indexOf("blob:") < 0) blocked.push(`${page}: img-src has no blob:`);
  }
  assert.equal(blocked.length, 0,
    `the pill hangs on a page whose own CSP blocks the send:\n  ${blocked.join('\n  ')}`);
});

test('a send that succeeded hands back a form a visitor can use again', () => {
  /* Locking the fields after a accepted send is right; leaving them locked when the same
     visitor opens the dialog again is not — they meet a greyed box reading "thanks" with
     nowhere to write the second thing they remembered. */
  const body = script.slice(script.indexOf('function open()'), script.indexOf('function close('));
  assert.match(body, /delete form\.dataset\.sent/, 'a reopened dialog is still marked as already sent');
  assert.match(body, /note\.disabled = false/, 'the note box stays locked in the dialog the visitor just reopened');
  assert.match(body, /resetShots|clearShots/, 'the thumbnails from the sent batch are still hanging in the reopened dialog');
  assert.match(script, /sync\(\);/, 'Send is never re-armed after the reset');
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
     the lazy way through the gate above, so the sentences this change introduced are
     required to read differently in every language but English. */
  const NEW = [
    "Attach up to 3 pictures — PNG, JPG or WebP, up to 10 MB each",
    "Drop pictures here, or paste them",
    "Remove this picture",
    "That will not do — a picture up to 10 MB, three at most.",
    "Sending your screenshots…",
    "Your words reached the studio. The screenshots did not — attach them on the contact page.",
  ];
  for (const k of NEW) {
    assert.ok(keys.indexOf(k) > -1,
      `the dialog paints "${k}" from outside its copy table, so no dictionary is ever asked for it`);
  }
  const untranslated = [];
  for (const code of ALL) {
    const d = dict(code);
    for (const k of NEW) if (d[k] === k) untranslated.push(`${code}: ${k.slice(0, 40)}`);
  }
  assert.equal(untranslated.length, 0,
    `left in English:\n  ${untranslated.slice(0, 12).join('\n  ')}`);
  /* The sentence that told visitors attachments were coming in a later release has no page
     to speak for now. A key every dictionary still carries is a sentence nobody paints. */
  assert.equal(keys.indexOf("Screenshot attachments open with the next release."), -1,
    'the staged-attachments sentence is still in the copy table');
});

test('the pill is charged to the bottom edge the whole site is sized against', () => {
  assert.match(read('js/app.js'), /var QUEUE = "[^"]*\.report-pair/,
    'the badge is not charged to the queue, so a pinned band can paint under it');
  const pair = sheet.match(/\.report-pair\{([^}]*)\}/);
  assert.ok(pair, 'the badge has no CSS of its own');
  const bottom = (pair[1].match(/bottom:(?:calc\()?([\d.]+)rem/) || [])[1];
  const height = (pair[1].match(/height:([\d.]+)px/) || [])[1];
  assert.ok(bottom && height, 'the badge must state its own bottom offset and height for this check');
  /* reserve() reads each member's rect, so the arithmetic here is only a guard against a
     number nobody thought about again: the mark cannot reach past the bubble it stands
     under, or the queue would be charged to the badge while a stage sized itself to the
     bubble alone. */
  assert.ok(Number(bottom) * 16 + Number(height) <= 1.5 * 16 + 56,
    `the badge reaches ${Number(bottom) * 16 + Number(height)}px from the bottom edge; the bubble only reaches 80px`);
});

/* The badge and the assistant bubble are hung on the same right edge, so the corner can
   hold both only if they never share a row. The first version of this shipped both on
   `bottom:1.5rem`, which put the 44px mark at rows 832–876 of a 900px desk — entirely
   inside the bubble's own 820–876 — and the sheet comment read the two bottom-anchored
   numbers as if one were a top coordinate and declared they "never a row". The bubble
   therefore stands on the badge's top edge plus air, measured at every breakpoint that
   moves it, because each of them states its own offset. */
test('the assistant stands clear of the badge instead of wearing it', () => {
  const pair = sheet.match(/\.report-pair\{([^}]*)\}/);
  const badgeTop = Number(pair[1].match(/bottom:(?:calc\()?([\d.]+)rem/)[1]) * 16 +
    Number(pair[1].match(/height:([\d.]+)px/)[1]);
  const rules = [];
  const re = /\.chat-widget\{[^}]*?bottom:calc\(([\d.]+)rem([^;}]*)\)/g;
  let m;
  while ((m = re.exec(sheet))) rules.push({ base: Number(m[1]) * 16, rest: m[2] });
  assert.ok(rules.length >= 2, 'only one breakpoint positions the bubble, so this check reads a fraction of the layout');
  for (const rule of rules) {
    assert.ok(/var\(--report-lane\)/.test(rule.rest),
      `a bubble anchored at ${rule.base / 16}rem is not lifted over the ${badgeTop}px badge`);
  }
  const lane = sheet.match(/--report-lane:\s*(\d+)px/);
  assert.ok(lane, 'the lane the badge owns is never stated, so nothing can prove it is paid for');
  assert.ok(Number(lane[1]) >= 44 + 8, '--report-lane does not cover the 44px mark with air above it');
  assert.ok(badgeTop + Number(lane[1]) - 8 >= badgeTop, 'the lane overlaps its own mark');
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

/* The Luggage page dims the room and walks the visitor through it with its own takeover:
   lights.js paints a full-viewport [aria-modal] at z-index 2147483000 and traps Tab itself.
   The feedback key is bound on the document with no qualifier, so ⌘⌥F while that was up
   opened this dialog underneath the veil — hidden=false, caret on the note, and a visitor
   staring at a darkened room who could not reach anything they had just been told to type.
   The arrival card above has its own close control to click; a takeover has none the visitor
   did not ask for, and stealing it would be worse than waiting. So the open is refused while
   someone else's modal owns the point the visitor is looking at. The centre is hit-tested
   rather than compared by z-index because the pill's own dialog is legitimately the topmost
   modal when it is open, and because Element.checkVisibility is too new for Safari. */
test('the feedback key waits rather than open behind a takeover', () => {
  const body = script.slice(script.indexOf('function open()'), script.indexOf('function close('));
  assert.match(body, /if \(occupied\(\)\) return/,
    'open() paints the dialog while another takeover owns the screen, so the caret lands where the visitor cannot reach it');
  assert.match(script, /function occupied\(\)/,
    'the takeover test lives inside open() and cannot be reused by the key handler');
  const held = script.slice(script.indexOf('function occupied()'), script.indexOf('function occupied()') + 700);
  assert.match(held, /\[aria-modal="true"\]/,
    'occupied() does not ask what modal is up');
  assert.match(held, /elementFromPoint/,
    'occupied() compares z-index or identity instead of asking what the visitor can actually reach');
});

test('the cache ledger moved with the files it caches', () => {
  const ledger = Number((read('index.html').match(/css\/style\.min\.css\?v=(\d+)/) || [])[1]);
  assert.ok(ledger >= 203, `the stylesheet is still served as v${ledger}; this change rewrote it`);
  for (const page of chromePages) {
    assert.ok((asked('report', page) || 0) >= 5, `${page} caches a pill that opens behind a takeover`);
    const sheetMatch = read(page).match(/css\/style\.min\.css\?v=(\d+)/);
    if (sheetMatch) assert.ok(Number(sheetMatch[1]) >= 203, `${page} still caches an older sheet`);
    if (/js\/chat\.js/.test(read(page))) {
      assert.ok(asked('chat', page) >= 48, `${page} caches a chat that cannot hear bh-chat-open`);
    }
    if (/js\/app\.js/.test(read(page))) {
      assert.ok(asked('app', page) >= 13, `${page} caches an app.js whose queue ignores the pair`);
    }
  }
  /* An alternation here let any three-digit number through, which is not a floor. Read the
     number and compare it — a ledger check that cannot fail is decoration. */
  const dictV = Number((read('js/translate.js').match(/i18n\/" \+ code \+ "\.json\?v=(\d+)/) || [])[1]);
  assert.ok(dictV >= 122, `the dictionaries were rewritten and are still fetched under v${dictV}`);
  const translateV = Number((read('index.html').match(/js\/translate\.js\?v=(\d+)/) || [])[1]);
  assert.ok(translateV >= 128, `translate.js changed and the pages still cache it as v${translateV}`);
  const cache = Number((read('sw.js').match(/const CACHE = "brownhub-v(\d+)"/) || [])[1]);
  assert.ok(cache >= 179,
    `installed copies still read brownhub-v${cache}; an HTML and CSS change shows no installed copy unless the cache name is renamed`);
});

test('the dialog is built, not pasted', () => {
  assert.doesNotMatch(script, /innerHTML/,
    'innerHTML is where a visitor-typed sentence becomes markup');
  assert.match(script, /createElement/, 'the dialog is not built from nodes');
});
