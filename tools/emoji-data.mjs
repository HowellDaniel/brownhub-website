/* Regenerate data/emoji.json — the emoji the assistant's composer offers.

   node tools/emoji-data.mjs

   The input is Unicode's own test file for UTS #51, committed at
   tools/vendor/emoji-test.txt so the shipped set can be audited without a network.
   When Unicode moves, drop the new file in its place:
   https://www.unicode.org/Public/emoji/latest/emoji-test.txt
   and run this again. Nothing else in the picker changes: the sheet reads whatever
   groups the file holds. */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'tools/vendor/emoji-test.txt');
const OUT = path.join(root, 'data/emoji.json');

let text;
try {
  text = readFileSync(SRC, 'utf8');
} catch (e) {
  console.error('Missing ' + SRC + '. Download https://www.unicode.org/Public/emoji/latest/emoji-test.txt and put it there.');
  process.exit(1);
}

const version = (text.match(/^# Version: (.+)$/m) || [])[1] || 'unknown';
const date = (text.match(/^# Date: (.+)$/m) || [])[1] || 'unknown';

const groups = [];
let current = null;
let malformed = 0;

for (const line of text.split('\n')) {
  const g = line.match(/^# group: (.+)$/);
  if (g) {
    current = { label: g[1], items: [] };
    groups.push(current);
    continue;
  }
  if (!current || !line.includes('; fully-qualified')) continue;
  const m = line.match(/^([0-9A-F ]+) +; fully-qualified +# (\S+) (E[0-9.]+) (.+)$/);
  if (!m) {
    malformed++;
    continue;
  }
  // The code points are the answer; the glyph in the comment is a rendering of them.
  // If they ever disagree, the parse is wrong and the build must say so rather than
  // ship a picker full of blank boxes.
  const glyph = String.fromCodePoint(...m[1].trim().split(/ +/).map((h) => parseInt(h, 16)));
  if (glyph !== m[2]) {
    console.error('Parse disagree at "' + m[1].trim() + '": built ' + JSON.stringify(glyph) +
      ', source shows ' + JSON.stringify(m[2]));
    process.exit(1);
  }
  current.items.push(glyph + ' ' + m[4]);
}

const shown = groups.filter((g) => g.items.length && g.label !== 'Component');
const total = shown.reduce((n, g) => n + g.items.length, 0);
if (malformed || total < 3000) {
  console.error('Refusing to write: ' + total + ' emoji, ' + malformed + ' unreadable lines.');
  process.exit(1);
}

const body = shown.map((g) =>
  '    ' + JSON.stringify(g.label) + ': [' + g.items.map((i) => JSON.stringify(i)).join(',') + ']'
).join(',\n');

const json = '{\n' +
  '  "source": "Unicode Emoji ' + version + ' (emoji-test.txt, ' + date + '), fully-qualified sequences only",\n' +
  '  "count": ' + total + ',\n' +
  '  "groups": {\n' + body + '\n  }\n}\n';

writeFileSync(OUT, json);
console.log(total + ' emoji in ' + shown.length + ' groups → ' + OUT +
  ' (' + Buffer.byteLength(json) + ' bytes, v' + version + ')');
for (const g of shown) console.log('  ' + g.label + ': ' + g.items.length);
