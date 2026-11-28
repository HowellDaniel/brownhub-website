import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

/* ------------------------------------------------------------------ *
 * A digit range inside right-to-left prose paints backwards.

 * "1–3" is two European numbers joined by an en dash. Under UAX #9 the digits
 * resolve to R in an RTL paragraph (rule W7), and the dash — a neutral — takes
 * the same resolved type from its neighbours (rule N1), so the sequence is
 * ordered as the paragraph runs and 3 lands to the left of 1. The studio
 * publishes turnaround windows and opening hours this way, so an Arabic,
 * Hebrew, Persian or Urdu reader is shown "3–1" days and a closing time before
 * an opening one. Measured per glyph in Blink: left edges 825→806 for "1"→"3".
 *
 * The repair is a directional isolate around the range: U+2066 LEFT-TO-RIGHT
 * ISOLATE opens a run whose content is ordered left to right whatever the
 * paragraph is, and U+2069 POP DIRECTIONAL ISOLATE closes it. The dictionary
 * carries the marks because js/translate.js applies translations as plain text
 * — node.nodeValue or setAttribute — so no element could be wrapped around the
 * range, and a CSS rule on the containing block cannot reach into the middle of
 * a sentence. 4431b7d fixed the same defect on .proof__num with
 * unicode-bidi: plaintext; that works only where a figure stands alone in its
 * own element, which dictionary prose never is.
 * ------------------------------------------------------------------ */

// translate.js owns which languages flip the page. Read from it rather than
// restating the list, so a language added to that map is covered the day it
// lands and this test cannot drift away from the code it guards.
const rtlCodes = (() => {
  const m = read('js/translate.js').match(/var RTL = \{([^}]*)\}/);
  assert.ok(m, 'translate.js no longer declares its RTL map as `var RTL = { ... }`');
  return [...m[1].matchAll(/([a-z]{2})\s*:\s*1/g)].map((x) => x[1]).filter((c) => existsSync(path.join(root, `i18n/${c}.json`)));
})();

/* Spelled as escapes on purpose. A bidi mark sitting literally in a source file
   cannot be reviewed by eye, and one wrong codepoint silently changes what is
   being tested — an early draft of this probe wrote RLM where it meant LRM. */
const chr = (c) => String.fromCharCode(c);
const LRM = chr(0x200e), LRI = chr(0x2066), RLI = chr(0x2067), FSI = chr(0x2068), PDI = chr(0x2069);
const EMBED = chr(0x202a), NSTACK = chr(0x202b), OVERRIDE = chr(0x202d);

const hex = (s) => (s ? [...s].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') : 'end of string');

// European digits, Arabic-Indic, and Extended Arabic-Indic — fa writes its
// hours as U+06F0..U+06F9, which \d does not match, so a \d-only sweep reports
// Persian as clean while it is in fact the most reversed value on the site.
const ND = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
const DASH = '[\\u2010-\\u2015~]';
// One optional colon between digits so "8:30" reads as a single token, and the
// dash is what makes it a range rather than a number.
const RANGE = new RegExp(ND + '(?::?' + ND + ')*\\s*' + DASH + '\\s*' + ND + '(?::?' + ND + ')*', 'g');

const GUARDS = new Map([[LRI, PDI], [FSI, PDI], [LRM, LRM]]);

// Every range in a value, with the character on each side, guarded or not.
function ranges(value) {
  const out = [];
  let m;
  RANGE.lastIndex = 0;
  while ((m = RANGE.exec(value))) {
    const before = value.slice(Math.max(0, m.index - 1), m.index);
    const after = value.slice(m.index + m[0].length, m.index + m[0].length + 1);
    out.push({ text: m[0], before, after, guarded: GUARDS.get(before) === after });
  }
  return out;
}

const dictionaryEntries = () => {
  const rows = [];
  for (const code of rtlCodes) {
    const dict = JSON.parse(read(`i18n/${code}.json`));
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') continue;
      for (const r of ranges(value)) rows.push({ code, key, ...r });
    }
  }
  return rows;
};

test('the RTL language list this test covers is the one translate.js serves', () => {
  assert.ok(rtlCodes.length >= 4,
    `expected the four RTL languages with dictionaries, read ${JSON.stringify(rtlCodes)}`);
});

test('every digit range in RTL dictionary prose is wrapped in a directional isolate', () => {
  const bare = dictionaryEntries().filter((r) => !r.guarded);
  const listed = bare.map((r) =>
    `\n  ${r.code}  "${r.text}"  sits between ${hex(r.before)} and ${hex(r.after)}   [${r.key.slice(0, 60)}…]`).join('');
  assert.equal(bare.length, 0,
    `${bare.length} numeric range(s) in an RTL dictionary are unguarded and will paint ` +
    `right-to-left for a visitor reading ${rtlCodes.join(', ')}:${listed}`);
});

/* ------------------------------------------------------------------ *
 * The same defect reaches past dictionary prose, and a dictionary sweep
 * structurally cannot see it: a phone number in a footer is not a key, and the
 * timeline date never enters a dictionary at all — js/stats.js builds that
 * <p class="tl__date"> straight out of data/metrics.json. Measured on 40 live
 * RTL page loads (ar, he, fa, ur over ten pages), 23 bare digit sequences paint
 * right to left: "2022 – 2026" arrives as "2026 – 2022" and "+233 50 295 4541"
 * arrives as "4541 295 50 233" — the studio's own contact number, backwards, on
 * the page whose whole job is to be dialled.
 *
 * So the guard belongs where the text is authored, in whichever form that text
 * can carry one:
 *   <bdi>  — markup, for HTML and for the JS template strings that are written
 *            with innerHTML. Costs no advance and leaves the surrounding alignment
 *            alone. It is NOT interchangeable with <span style="unicode-bidi:isolate">:
 *            measured in Blink on ar contact.html, the span paints "+233 50 295 4541"
 *            as "4541 295 50 +233" while <bdi> holds it upright. A bdi's isolate takes
 *            its direction from the first strong character inside it and defaults to LTR
 *            when there is none — which is exactly the case here, since a phone number
 *            has no strong character at all. Same reason plaintext cannot save .tl__date.
 *            It follows that the isolate must hold digits ONLY: measured, a <bdi> that
 *            also swallows the following Arabic word reverses the number again.
 *   LRI…PDI — marks, for dictionary values, which js/translate.js writes as
 *            plain text where an element would only print as literal tags.
 *
 * The two are not interchangeable, and choosing wrongly loses a translation.
 * js/translate.js collects one key per text node (collect() walks SHOW_TEXT and
 * looks up dict[trimKey(nodeValue)]), so wrapping part of a keyed node in a
 * <bdi> splits that node in two and neither half matches its key any more — the
 * paragraph would fall back to English in all thirty-nine languages to fix four
 * digits. Hence: markup guards only where the text is not a key, and the value
 * carries its own guard where it is.
 * ------------------------------------------------------------------ */

// Space-separated digit groups — a phone number, a year span. One group cannot
// be reordered, and a comma or a colon stays inside its group, so "1,200" and
// "08:30" are each a single upright atom. A dash is deliberately absent: the
// dashed ranges live inside keyed prose, where the guard is in the value.
const GROUPED = /\+?[\d\u0660-\u0669\u06F0-\u06F9]{2,}(?: [\d\u0660-\u0669\u06F0-\u06F9]{2,})+/g;

const docs = (() => {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  };
  walk('.');
  return out;
})();

const ALL_KEYS = new Set();
for (const f of readdirSync(path.join(root, 'i18n')).filter((n) => n.endsWith('.json'))) {
  for (const k of Object.keys(JSON.parse(read(`i18n/${f}`)))) ALL_KEYS.add(k.trim());
}

/* The visible text of a document, with its guards kept and everything else a browser does
   not paint thrown away: script and style blocks (the JSON-LD graph holds ungrouped
   telephone numbers), comments, and tag attributes — an attribute is its own bidi problem,
   since a placeholder cannot contain an element. Any other tag ends a run, because a number
   is guarded inside its own element or not at all.

   A <bdi> becomes an opaque sentinel rather than staying a tag. The rule that cuts runs on
   tags matches <bdi> as well, so a guard the sweep cannot see is worse than no guard: it
   splits the number it was meant to protect and reports a wrapped number as naked. */
const BDI_OPEN = '\u0001', BDI_CLOSE = '\u0002';
function textRuns(src) {
  const body = src
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '\n');
  const kept = body
    .replace(/<bdi\b[^>]*>/gi, BDI_OPEN)
    .replace(/<\/bdi>/gi, BDI_CLOSE)
    .replace(/<[^>]*>/g, '\u0000');
  return kept.split('\u0000').map((s) => s.trim()).filter(Boolean);
}

// The text as it would read with no guard at all, for matching against a dictionary key.
const ungarded = (run) => run.split(BDI_OPEN).join('').split(BDI_CLOSE).join('');

// Numbers sitting outside a <bdi> span: everything between an open and its close is removed
// before matching, so a guarded number is credited and a naked one is not.
function nakedNumbers(text) {
  const open = new RegExp(BDI_OPEN + '[\\s\\S]*?' + BDI_CLOSE, 'g');
  return [...text.replace(open, '').matchAll(GROUPED)].map((x) => x[0]);
}

test('every grouped number in unkeyed HTML text is wrapped in a <bdi>', () => {
  const offenders = [];
  let seen = 0;
  for (const rel of docs) {
    for (const run of textRuns(read(rel))) {
      if (ALL_KEYS.has(ungarded(run))) continue; // keyed: the dictionary value owns this guard
      seen += (ungarded(run).match(GROUPED) || []).length;
      for (const n of nakedNumbers(run)) offenders.push(`\n  ${rel}  "${n}"  in: ${ungarded(run).slice(0, 64)}`);
    }
  }
  // A sweep that sees no numbers passes for the wrong reason, so the count it found is
  // part of what this test asserts. It is checked before the offenders so a broken probe
  // reports "found nothing" instead of hiding behind an empty offender list.
  assert.ok(seen > 0, 'the sweep found no grouped number in HTML text at all, so it cannot prove anything');
  assert.equal(offenders.length, 0,
    `${offenders.length} of ${seen} grouped number(s) in HTML text carry no isolate; on an RTL page ` +
    `they paint group-last:${offenders.slice(0, 8).join('')}${offenders.length > 8 ? `\n  … ${offenders.length - 8} more` : ''}`);
});

test('the JS render sites that build digits guard what they emit', () => {
  // The timeline date is not dictionary text at all: data/metrics.json is read
  // straight into innerHTML by js/stats.js, so no dictionary can reach it.
  const stats = read('js/stats.js');
  assert.ok(/class="tl__date"><bdi>/.test(stats),
    'js/stats.js writes the milestone date naked; "2022 – 2026" reverses on an RTL page ' +
    'and nothing downstream can fix it');
  /* A chat reply is looked up in the dictionary as its WHOLE markup string and
     then painted through innerHTML (js/chat.js:184 `el.innerHTML = T(html)`), so
     the English source is a key: a guard added here would change the lookup
     string and lose the translation in all thirty-nine languages. `${WA}` is
     resolved first because the dictionary stores the number, not the placeholder.
     What is keyed is therefore credited here and guarded in i18n/<code>.json,
     which the test below owns; what is unkeyed is guarded in place. */
  const chat = read('js/chat.js');
  const vars = {};
  for (const m of chat.matchAll(/const (WA[A-Z_]*)\s*=\s*"([^"]+)"/g)) vars[m[1]] = m[2];
  const replies = (chat.match(/html:\s*`[\s\S]*?`/g) || []).map((block) =>
    block.slice(block.indexOf('`') + 1, block.lastIndexOf('`'))
      .replace(/\$\{(\w+)\}/g, (all, name) => (name in vars ? vars[name] : all)));
  const keyed = replies.filter((r) => ALL_KEYS.has(r.trim()));
  const naked = [];
  for (const reply of replies.filter((r) => !ALL_KEYS.has(r.trim()))) {
    for (const n of nakedNumbers(reply.split('<bdi>').join(BDI_OPEN).split('</bdi>').join(BDI_CLOSE))) {
      naked.push(`"${n}" in ${reply.slice(0, 50)}`);
    }
  }
  // The lookup is proved rather than trusted: if the key match silently accepted
  // every reply this gate would pass by checking nothing, and if it matched none
  // the number-bearing reply would already be listed as naked above. Today the
  // three phone numbers sit in a keyed reply, which is exactly what hands their
  // guard to the dictionary.
  const holdsNumbers = (list) => list.some((r) => (r.match(GROUPED) || []).length > 0);
  assert.ok(holdsNumbers(keyed) && !holdsNumbers(replies.filter((r) => !ALL_KEYS.has(r.trim()))),
    `the grouped numbers in js/chat.js are no longer confined to a keyed reply ` +
    `(${keyed.length} of ${replies.length} replies matched a dictionary key), so this gate must guard them here`);
  assert.deepEqual(naked, [], 'js/chat.js paints unguarded grouped numbers: ' + naked.join(' | '));
});

test('a script that rewrites an isolated node rebuilds the isolate', () => {
  /* The two gates above read markup, and markup is only a promise until the page runs.
     haul.html wrapped its call number as <a id="phone"><bdi>+233 53 558 3460</bdi></a> and
     then did `tel.textContent = h.phone` from its own inline script: assigning textContent
     replaces the element's children, so the <bdi> the sweep credited was gone before an
     Arabic visitor finished reading the button, and the number painted "+233 558 3460 53"
     reversed. Measured on a live ar haul.html, then re-measured holding after the repair.

     So: wherever markup guards a node, whatever writes into that node at runtime has to put
     a guard back. An element, not a CSS class — unicode-bidi:isolate on a span was measured
     to reverse where <bdi> holds, because UAX #9 BD3 treats an isolated run as its own
     paragraph and a strong-char-free digit run then defaults to LTR. */
  const guarded = new Map(); // id -> doc that guards it in markup
  for (const rel of docs) {
    for (const m of read(rel).matchAll(/<[a-z][a-z0-9-]*\b[^>]*\bid="([\w:.-]+)"[^>]*>\s*<bdi>/gi)) {
      if (!guarded.has(m[1])) guarded.set(m[1], rel);
    }
  }
  const sources = [];
  for (const rel of docs) {
    for (const m of read(rel).matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (m[1].trim()) sources.push([rel, m[1]]);
    }
  }
  for (const rel of readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    sources.push([`js/${rel}`, read(`js/${rel}`)]);
  }

  const offenders = [];
  let writes = 0;
  for (const [rel, src] of sources) {
    // name -> id, for `var tel = document.getElementById("phone")`
    const bound = new Map();
    for (const m of src.matchAll(/(?:var|let|const)\s+(\w+)\s*=\s*(?:document\s*\.)?\s*(?:getElementById\(\s*["']|querySelector\(\s*["']#)([\w:.-]+)["']\s*\)/g)) {
      bound.set(m[1], m[2]);
    }
    const targets = new Set([...bound.values()]);
    for (const id of targets) {
      if (!guarded.has(id)) continue;
      const from = [...bound.keys()].find((k) => bound.get(k) === id);
      const re = new RegExp(
        `(?:\\b${from}\\s*\\.\\s*|getElementById\\(\\s*["']${id}["']\\s*\\)\\s*\\.\\s*|querySelector\\(\\s*["']#${id}["']\\s*\\)\\s*\\.\\s*)` +
        `(textContent|innerText|innerHTML)\\s*(?:=[^=]|\\+=)`, 'g');
      for (const w of src.matchAll(re)) {
        writes++;
        // The isolate has to come back after the write that removed it, and close enough to
        // that write to be the thing put there, not an unrelated guard elsewhere in the file.
        if (!/createElement\(\s*["']bdi["']|<bdi/.test(src.slice(w.index, w.index + 240))) {
          offenders.push(`\n  ${rel} overwrites #${id}.${w[1]} (guarded in ${guarded.get(id)}) and never rebuilds the isolate`);
        }
      }
    }
  }
  // Neither arm may be empty or this test is asserting on nothing: no guarded ids means the
  // markup sweep found no isolates, no writes means no script was ever matched.
  assert.ok(guarded.size > 0, 'no id in any document carries a <bdi> guard, so this gate cannot prove anything');
  assert.ok(writes > 0,
    `${guarded.size} isolated node(s) exist in markup (${[...guarded.keys()].slice(0, 6).join(', ')}…) but no script ` +
    `writes into any of them, which means the binding pattern no longer matches how the site reaches the DOM`);
  assert.deepEqual(offenders, [],
    `${offenders.length} runtime rewrite(s) delete a bidi guard:` + offenders.join(''));
});

test('every grouped number in RTL dictionary values is isolated', () => {
  // Same bug class, reached through a value: "راسلنا على WhatsApp عبر الرقم
  // +233 50 295 4541" is four digit groups sitting between RTL letters, so the
  // group order alone decides whether the number can be dialled. A value may be
  // painted as text (guarded with marks) or as innerHTML by js/chat.js (guarded
  // with <bdi>), so both count.
  const offenders = [];
  for (const code of rtlCodes) {
    const dict = JSON.parse(read(`i18n/${code}.json`));
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') continue;
      let rest = value;
      for (const [open, close] of [[LRI, PDI], [FSI, PDI]]) {
        const parts = rest.split(open);
        rest = parts.map((p, i) => (i ? p.split(close).join('') : p)).join('\u0000');
      }
      rest = rest.split('<bdi>').join('\u0000').split('</bdi>').join('\u0000')
        .split('\u0000').filter((_, i) => i % 2 === 0).join('');
      for (const m of rest.matchAll(GROUPED)) offenders.push(`\n  ${code}  "${m[0]}"  [${key.slice(0, 55)}…]`);
    }
  }
  assert.equal(offenders.length, 0,
    `${offenders.length} grouped number(s) in an RTL dictionary paint right to left:` +
    `${offenders.slice(0, 10).join('')}${offenders.length > 10 ? `\n  … ${offenders.length - 10} more` : ''}`);
});

test('the isolate convention stays one convention, and no embedding control leaks in', () => {
  const offenders = [];
  for (const code of rtlCodes) {
    const raw = read(`i18n/${code}.json`);
    for (const ch of [RLI, EMBED, NSTACK, OVERRIDE]) {
      if (raw.includes(ch)) offenders.push(`${code}.json contains ${hex(ch)}`);
    }
    // An isolate that is opened and never closed leaks its direction to the end
    // of the paragraph, which is a worse defect than the one being fixed.
    const opens = (raw.match(new RegExp(LRI, 'g')) || []).length;
    const closes = (raw.match(new RegExp(PDI, 'g')) || []).length;
    if (opens !== closes) offenders.push(`${code}.json opens ${opens} LRI but has ${closes} PDI`);
  }
  assert.deepEqual(offenders, []);
});

test('bidi marks never reach a dictionary key', () => {
  // Keys are matched by js/translate.js with dict[trimKey(source)]: a mark in a
  // key means the English on the page no longer finds its translation, and the
  // sentence fails to translate in silence.
  const marks = [LRM, LRI, RLI, FSI, PDI, EMBED, NSTACK, OVERRIDE];
  const marked = [];
  for (const f of readdirSync(path.join(root, 'i18n')).filter((n) => n.endsWith('.json'))) {
    for (const key of Object.keys(JSON.parse(read(`i18n/${f}`)))) {
      if (marks.some((m) => key.includes(m))) marked.push(`${f}  ${hex(key.match(new RegExp(m))) }  ${key.slice(0, 50)}`);
    }
  }
  assert.deepEqual(marked, [], `these keys carry a bidi mark and can never match:\n${marked.join('\n')}`);
});

test('the marks survive the trim that keys and sources are matched with', () => {
  // trimKey() is on both sides of the lookup. If trim() treated a Cf mark as
  // whitespace, a guarded value would be written back stripped of its guard.
  const sample = 'Before ' + LRI + '1–3' + PDI + ' after';
  assert.equal(sample.trim(), sample, 'String.trim() is eating a bidi mark; the isolate approach is not safe');
  assert.equal(ranges(sample).length, 1);
  assert.equal(ranges(sample)[0].guarded, true);
});

test('a marked dictionary forces its own cache bust, and translate.js with it', () => {
  // sw.js serves i18n/*.json cache-first: "code and dictionaries keep their
  // cache-first reading because those are versioned by the ?v= ledger". Without
  // the bump in translate.js's fetch, a returning visitor or an installed copy
  // keeps the reversed dictionary forever and the fix never reaches anyone.
  const fetchLine = read('js/translate.js').match(/i18n\/" \+ code \+ "\.json\?v=(\d+)/);
  assert.ok(fetchLine, 'translate.js no longer busts its dictionary fetch with ?v=');
  const docs = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith('.html')) docs.push(path.join(dir, e.name));
    }
  };
  walk('.');
  const seen = new Map();
  for (const d of docs) {
    for (const m of read(d).matchAll(/translate\.js\?v=(\d+)/g)) {
      seen.set(m[1], (seen.get(m[1]) || []).concat(d));
    }
  }
  assert.equal(seen.size, 1,
    `translate.js is fetched under ${[...seen.keys()].join(' and ')} across the docs; a split ledger ` +
    `means some pages keep a stale translator: ` +
    [...seen].filter(([v]) => v !== [...seen.keys()][0]).map(([v, f]) => `${v} → ${f.slice(0, 3)}`).join('; '));
  assert.ok(seen.has('134'),
    `dictionary content changed, so every doc must ask for translate.js?v=134 (found ${[...seen.keys()].join(', ')})`);
});
