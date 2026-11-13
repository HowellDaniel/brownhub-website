#!/usr/bin/env node
// Build css/style.min.css from css/style.css.
//
// The authored sheet is the one people read: 5,800 lines with the reasoning written
// beside every layer. GitHub Pages gzips it, and the phone downloads all of it before
// it paints a word — the notes and the indentation were 62% of what came down the pipe.
// So the site ships this file instead, and css-wire.test.mjs fails if the two ever drift.
//
// Deliberately conservative. Only whitespace a parser cannot need is removed:
// next to a block or declaration boundary. Spaces that carry meaning — inside calc(),
// between a descendant combinator and its colon, around `and` in a media query,
// anywhere a string says so — survive untouched.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DROP_AFTER = new Set(['{', '}', ';', ':', ',']);
const DROP_BEFORE = new Set(['}', ';', ',', '{']);

export function minify(src) {
  const out = [];
  let pending = false;
  let i = 0;

  const flush = () => {
    if (pending) {
      out.push(' ');
      pending = false;
    }
  };
  const emit = (text) => {
    flush();
    out.push(text);
    pending = false;
  };
  const last = () => out[out.length - 1] || '';

  while (i < src.length) {
    const c = src[i];

    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      // A comment squeezed between two words separated them; keep that one space.
      const before = last();
      const after = src[stop] || '';
      pending = pending || (/[A-Za-z0-9_)\]/]/.test(before) && /[A-Za-z0-9_(\[]/.test(after));
      i = stop;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        j++;
      }
      emit(src.slice(i, j));
      i = j;
      continue;
    }

    if (c === '\\') {
      emit(src.slice(i, i + 2));
      i += 2;
      continue;
    }

    if (/\s/.test(c)) {
      pending = true;
      i++;
      continue;
    }

    if (pending && (DROP_AFTER.has(last()) || DROP_BEFORE.has(c))) {
      pending = false;
    }
    // A declaration's trailing semicolon says nothing a closing brace has not said.
    if (c === '}' && last() === ';') out.pop();
    flush();
    out.push(c);
    pending = false;
    i++;
  }

  return out.join('').trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = readFileSync(path.join(root, 'css/style.css'), 'utf8');
  writeFileSync(path.join(root, 'css/style.min.css'), minify(src) + '\n');
  const bytes = Buffer.byteLength(minify(src));
  console.log(`css/style.min.css written (${(bytes / 1024).toFixed(0)} KB from ${(src.length / 1024).toFixed(0)} KB)`);
}
