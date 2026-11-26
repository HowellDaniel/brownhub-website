import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// The 12 dictionaries that carry the whole site, not just the nav. A new page is
// only finished when its English is a key in each of them.
const FULL = ['zh', 'tw', 'sw', 'ru', 'pt', 'nl', 'it', 'hi', 'fr', 'es', 'de', 'ar'];

// Pages that show the shared nav/footer, which is what a visitor finds Help from.
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

const sheetVersion = (file) => {
  const m = read(file).match(/href="(?:\.\.\/)?css\/style\.min\.css\?v=(\d+)"/);
  return m ? m[1] : null;
};

const csp = (file) => {
  const m = read(file).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  return m ? m[1] : null;
};

test('help.html exists and is dressed in the site shell, not a new one', () => {
  const help = read('help.html');
  assert.ok(/<h1[^>]*>Help/.test(help), 'the page has no Help heading a visitor can see');
  assert.equal(csp('help.html'), csp('privacy.html'),
    'the page carries a different content policy from the rest of the site');
  assert.match(help, /<link rel="canonical" href="https:\/\/www\.brownhub283\.com\/help\.html">/);
  assert.equal(sheetVersion('help.html'), sheetVersion('privacy.html'),
    'the page links a stylesheet version no other page asks for');
  assert.ok(/<nav class="nav container"/.test(help), 'the page has no shared navigation');
  assert.ok(help.includes('footer__legal'), 'the page has no shared footer');
  assert.ok(/application\/ld\+json/.test(help), 'the page offers no structured answers to a search engine');
  assert.match(read('sw.js'), /const CACHE = "brownhub-v\d+"/);
});

test('every FAQ answer offers its own 1-5 rating', () => {
  const help = read('help.html');
  const forms = [...help.matchAll(/<form[^>]*class="feedback[^"]*"[^>]*data-article="([^"]+)"/g)];
  assert.ok(forms.length >= 7, `only ${forms.length} answers ask for feedback`);
  assert.equal((help.match(/class="feedback__vote"/g) || []).length, 0,
    'the old Yes/No control is still competing with the star rating');

  const articles = forms.map((m) => m[1]);
  assert.equal(new Set(articles).size, articles.length, 'two answer forms share one article slug');
  assert.ok(articles.includes('where-is-the-studio'), 'a visitor cannot rate directions to the studio');

  for (const article of articles) {
    const start = help.indexOf(`data-article="${article}"`);
    const block = help.slice(start, help.indexOf('</form>', start));
    assert.equal((block.match(/type="radio"/g) || []).length, 5, `${article} does not offer five stars`);
    for (let rating = 1; rating <= 5; rating++) {
      const label = `${rating} star${rating === 1 ? '' : 's'}`;
      assert.ok(block.includes(`aria-label="${label}"`), `${article} has no accessible ${label} control`);
    }
    assert.ok(/class="feedback__rest"[^>]*hidden/.test(block), `${article} hides its Send control`);
    assert.ok(/class="form-success"[^>]*hidden/.test(block), `${article} hides its thank-you`);
    assert.ok(block.includes('name="_site"'), `${article} has no honeypot`);
  }
});

test('a chosen star posts its rating to the answer it came from', () => {
  const js = read('js/feedback.js');
  assert.match(js, /querySelectorAll\(['"]\.feedback--answer['"]\)/,
    'the script still drives only one page-level feedback form');
  assert.match(js, /input:checked\[name=["']?rating/,
    'the submitted rating is not read from the answer the visitor chose');
  assert.match(js, /payload\s*=\s*\{[^}]*rating\s*:/s, 'the feedback request carries no rating');
  assert.match(js, /payload\s*=\s*\{[^}]*topic:\s*["']answer["']/s, 'a per-answer note is not filed as an answer');
  assert.match(js, /payload\s*=\s*\{[^}]*article\s*:/s, 'the note loses the answer slug');
  assert.match(js, /dataset\.sent/, 'one form can be sent twice');
});

test('the stars are tappable and show the chosen value', () => {
  const css = read('css/style.css');
  const star = /\.feedback__star\s*\{([^}]*)\}/.exec(css);
  assert.ok(star, 'the star control has no styles');
  assert.match(star[1], /min-width:\s*44px/, 'a star is too small for a phone thumb');
  assert.match(star[1], /min-height:\s*44px/, 'a star is too short for a phone thumb');
  for (let value = 1; value <= 5; value++) {
    assert.match(css, new RegExp(
      `\\.feedback__stars\\[data-selected="${value}"\\][\\s\\S]*?\\.feedback__star:nth-child\\(-n\\+${value}\\)`,
    ), `choosing ${value} stars does not fill that many stars`);
  }
  assert.match(css, /\.feedback__star:focus-within/, 'keyboard focus disappears from the star row');
});

test('every page that shows the site chrome links to help.html', () => {
  const missing = chromePages.filter((f) => !read(f).includes('href="help.html"')
    && !read(f).includes('href="../help.html"'));
  assert.deepEqual(missing, [], `${missing.length} pages still have no route to the help page`);
  assert.ok(chromePages.length > 40, `only ${chromePages.length} pages were checked`);
});

test('the help page is in site search, the sitemap, robots and llms.txt', () => {
  const search = read('js/search.js');
  assert.match(search, /h:\s*"(?:\.\.\/)?help\.html"/, 'site search can never offer the help page');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/www\.brownhub283\.com\/help\.html<\/loc>/);
  assert.match(read('robots.txt'), /^Allow: \/help\.html$/m);
  assert.match(read('llms.txt'), /help\.html/);
});

// translate.js looks each string up by its trimmed text, so an unkeyed paragraph is
// not a missing translation — it is a paragraph that stays English for everyone and
// silently reports full coverage. Collect the same strings the collector would.
//
// The collector walks real text nodes, which the parser has already turned back into
// characters: an &amp; in the source reaches it as &. Reading the raw markup instead
// would ask the dictionaries for a key containing the five characters "a-m-p-" that no
// browser ever looks up, so a page could pass this gate while every one of its
// ampersand-bearing strings stayed English. Decode the entities the site actually uses.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', times: '×', deg: '°', middot: '·', rarr: '→',
};
const decode = (s) => s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
  if (body[0] === '#') {
    const cp = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
  }
  return NAMED[body.toLowerCase()] !== undefined ? NAMED[body.toLowerCase()] : m;
});

const keysOn = (file) => {
  let body = read(file).split('<body')[1] || '';
  // Only the page's own content. The nav, footer and assistant markup arrive from the
  // shell every page shares, and that shell carries its own unkeyed strings: measured on
  // privacy.html, fourteen of its strings are not keys in es.json — the address line,
  // "Call: +233 53 558 3460", and the sentence fragments an inline link cuts out of a
  // paragraph. A new page must not be blamed for that debt, and must not be allowed to
  // add to it, so this reads the <main> and nothing outside it.
  const main = /<main>([\s\S]*?)<\/main>/.exec(body);
  body = main ? main[1] : '';
  body = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const out = new Set();
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const s = decode(m[1]).replace(/\s+/g, ' ').trim();
    if (s && !/^[|·—–\-\s]+$/.test(s) && !/^&[a-z]+;$/.test(s)) out.add(s);
  }
  for (const m of body.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]+)"/g)) {
    const s = decode(m[1]).replace(/\s+/g, ' ').trim();
    if (s) out.add(s);
  }
  return [...out];
};

test('the shared shell still carries the localisation debt this page is not blamed for', () => {
  const shell = keysOn('privacy.html');
  const dict = JSON.parse(read('i18n/es.json'));
  const unkeyed = shell.filter((k) => /[a-z]{3}/i.test(k) && !(k in dict));
  assert.ok(unkeyed.length > 0,
    'privacy.html now has every string keyed — this baseline should be retired and the gate widened to the whole page');
});

test('every string on the help page is keyed in the twelve full dictionaries', () => {
  const keys = keysOn('help.html');
  assert.ok(keys.length > 20, `only found ${keys.length} strings — the extractor missed the page`);
  const dicts = FULL.map((code) => [code, JSON.parse(read(`i18n/${code}.json`))]);
  const missing = [];
  for (const [code, dict] of dicts) {
    for (const k of keys) {
      // Numbers, currency, file names and bare punctuation carry nothing a translator
      // can render differently, so they stay exempt. A two-letter word is not one of
      // those: the "No" pill passed this gate for a whole review cycle while every
      // dictionary left it in English letters in an Arabic page.
      if (!/[a-z]/i.test(k)) continue;
      if (/^https?:\/\/|^[a-z0-9._%+-]+@|^GH₵[\d,.]+$/.test(k)) continue;
      if (!(k in dict)) missing.push(`${code}: ${k.slice(0, 60)}`);
    }
  }
  assert.equal(missing.length, 0,
    `${missing.length} strings are not keys:\n  ${missing.slice(0, 25).join('\n  ')}`);
});

// This used to demand that each dictionary's keys be in code-unit order from first to
// last. That rule is false in the repository as it stands, so the test could never pass
// and said nothing about the change it was written to police. Measured on the twelve full
// dictionaries as they are: 1,313 keys apiece, six places where a key does not sort after
// its neighbour. Every dictionary carries the same six, in the same positions — the files
// are kept as one order across all twelve, and that is the property worth holding, because
// it is what forces a new key into the same slot in every language instead of letting it
// hide at the end of one. The six exceptions are the deliberate groupings: the two video
// sample cards sitting beside their own "View details" keys rather than under V, and the
// four recall-code strings filed after the chat keys they belong to rather than under T.
const KNOWN_UNSORTED = 6;

test('the twelve dictionaries stay in one shared key order, and the exceptions stay few', () => {
  const lists = FULL.map((code) => [code, Object.keys(JSON.parse(read(`i18n/${code}.json`)))]);
  for (const [code, keys] of lists) {
    if (code === FULL[0]) continue;
    assert.deepEqual(keys, lists[0][1],
      `${code}.json no longer lists its keys in the same order as ${FULL[0]}.json`);
  }
  const ref = lists[0][1];
  const descents = [];
  for (let i = 1; i < ref.length; i++) if (ref[i - 1] >= ref[i]) descents.push(ref[i]);
  assert.equal(descents.length, KNOWN_UNSORTED,
    `${ref.length} keys hold ${descents.length} out-of-order positions, expected ${KNOWN_UNSORTED}: ${descents.slice(0, 8).join(" | ")}`);
});

test('capture files the rating and alerts the studio owner', () => {
  const fn = read('supabase/functions/capture/index.ts');
  const branch = fn.slice(fn.indexOf('kind === "feedback"'));
  const block = branch.slice(0, branch.indexOf('return json({ error: "Unknown"'));
  assert.match(block, /Number\.isInteger\(rawRating\)[\s\S]*rawRating >= 1[\s\S]*rawRating <= 5/,
    'a rating outside 1-5 can reach the table');
  assert.match(block, /body\.rating/, 'the numeric star rating is ignored');
  assert.match(block, /await write\("feedback", \{[\s\S]*\brating\b/, 'the row stores no rating');
  const writeAt = block.indexOf('await write("feedback"');
  const alertAt = block.indexOf('await alertOwner');
  assert.ok(writeAt >= 0 && alertAt > writeAt, 'the owner is alerted before the feedback row is saved');
  assert.match(block, /if\s*\(ok\)\s*await alertOwner/, 'a failed database write still texts the owner');
  assert.match(fn, /const OWNER_MSISDN = "233535583460"/, 'feedback does not reach the owner number');
  assert.match(fn, /const SMS_GATEWAY = "https:\/\/sms\.arkesel\.com\/api\/v2\/sms\/send"/,
    'the studio alert does not use the Arkesel route already proven by the payment webhook');
  assert.match(fn, /const summary[\s\S]{0,160}\.slice\(0,\s*160\)/, 'the SMS has no 160-character segment budget');
});

test('capture answers a feedback post, and the same guards cover it', () => {
  const fn = read('supabase/functions/capture/index.ts');
  assert.match(fn, /kind === "feedback"/, 'the function still answers 404 to a feedback post');
  assert.match(fn, /write\("feedback"/, 'the feedback branch writes to no table');
  const branch = fn.slice(fn.indexOf('kind === "feedback"'));
  const block = branch.slice(0, branch.indexOf('return json({ error: "Unknown"'));
  assert.match(block, /limited\(feedbacks, ip, FEEDBACK_PER_MINUTE, FEEDBACK_PER_DAY\)/,
    'a feedback post is the one write with no per-address limit');
  assert.match(block, /str\(body\._site/, 'the honeypot does not cover the feedback route');
  assert.match(block, /message/, 'nothing of what the visitor typed is kept');
  assert.match(block, /topic/, 'the note is filed without saying what it is about');
  assert.match(block, /hostOf|pathOf/, 'the page the note came from is not sanitised');
});

test('feedback keeps a rating without discarding a legacy vote', () => {
  const sql = read('sql/supabase-schema.sql');
  const table = /create table if not exists public\.feedback \([\s\S]*?\);/.exec(sql);
  assert.ok(table, 'public.feedback is missing from the schema');
  assert.match(table[0], /\brating\s+smallint\b/i, 'the table has no numeric rating column');
  assert.match(table[0], /check\s*\(rating between 1 and 5\)/i,
    'a rating can be stored outside the visible 1-5 range');
  assert.match(sql, /alter table public\.feedback add column if not exists rating smallint;/i,
    'live schema updates do not add the rating column idempotently');
});

test('the feedback table is closed to a browser key by construction', () => {
  const sql = read('sql/supabase-schema.sql');
  const table = /create table if not exists public\.feedback \([\s\S]*?\);/.exec(sql);
  assert.ok(table, 'sql/supabase-schema.sql does not create public.feedback');
  assert.match(sql, /alter table public\.feedback enable row level security;/);
  assert.match(sql, /revoke all on table public\.feedback from anon, authenticated;/);
  // Scope the check to the policy statements themselves: the schema already holds three
  // create policy statements for other tables, and a "any create policy anywhere before
  // the words public.feedback" test fires on those and says nothing about feedback.
  const policies = sql.split(/;\s*\n/).filter((s) => /^\s*create policy\b/i.test(s));
  assert.equal(policies.some((p) => /\bpublic\.feedback\b/.test(p)), false,
    'a policy on public.feedback would open the table to every holder of the public key');
  const cols = table[0];
  for (const col of ['topic', 'vote', 'article', 'message', 'contact', 'page', 'lang']) {
    assert.match(cols, new RegExp(`\\b${col}\\b`), `public.feedback has no ${col} column`);
  }
  assert.match(cols, /check \(topic in/, 'the table accepts any topic a caller invents');
});

// The note and the thank-you are both hidden by attribute, but a class rule that
// sets its own display beats the browser's [hidden]{display:none} — so the page
// would show both surfaces to a visitor who has tapped nothing. Every class the
// help page hides has to be re-hidden by an author rule.
test('the hidden attribute can still hide what the help page hides', () => {
  const help = read('help.html');
  const css = read('css/style.css');
  const blind = [];
  for (const tag of (help.match(/<[a-z]+[^>]*>/gi) || []).filter((t) => /\shidden(?=[\s>])/.test(t))) {
    const classes = ((tag.match(/class="([^"]*)"/) || [, ''])[1]).trim().split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      const rules = css.match(new RegExp(`\\.${cls}\\b[^{}]*\\{[^}]*\\}`, 'g')) || [];
      const paints = rules.some((r) => !/\[hidden\]/.test(r) && /display:\s*(?!none\s*[;}])/.test(r));
      if (!paints) continue;
      if (!rules.some((r) => /\[hidden\]/.test(r) && /display:\s*none/.test(r))) blind.push(cls);
    }
  }
  assert.deepEqual(blind, [],
    `${blind.join(', ')} set their own display, so [hidden] cannot hide them`);
});

test('the panel posts to the studio function and holds nothing back', () => {

  const js = read('js/feedback.js');
  assert.match(js, /capture\/feedback/);
  assert.match(js, /_site/, 'the form does not fill the honeypot the function checks');
  assert.doesNotMatch(js, /service_role|SB_SECRET|Bearer sb_service/,
    'a browser copy of the service role key would let anyone write the table');
  assert.match(js, /content-type.{0,40}application\/json/is);
  const html = read('help.html');
  assert.match(html, /class="feedback feedback--answer"/, 'the answers have no feedback forms');
  assert.match(html, /aria-hidden="true"/, 'the honeypot is reachable by a keyboard or a reader');
});

test('the note opens with its Send button pressable', () => {
  const js = read('js/feedback.js');
  /* Measured on a 390x844 phone frame: tapping No focuses the textarea, and the browser
     scrolls the textarea — never the button — into view. The Send then lands at viewport
     y 773..811 while the install ask holds 740..832, so document.elementFromPoint at the
     button's own centre returned the ask's <p>. The visitor had the note open and no way
     to send it. Desk was 5px clear on the same landing, so this is not a phone-only bug.
     The fix has to be the one the rest of the site already uses: read --queue-h, the
     height the bottom asks publish for themselves, and move the button above it. */
  assert.match(js, /--queue-h/,
    'the note opens blind to the bottom queue, so its Send can land under an ask');
  assert.match(js, /preventScroll/,
    'focus alone decides where the page stops, and focus scrolls to the textarea, not the Send');
  const helper = /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{0,700}?button\[type=["']?submit[\s\S]{0,700}?scroll(?:By|To)/.exec(js);
  assert.ok(helper, 'nothing scrolls the submit button clear after the note opens');
});

test('the thank-you says thanks in the language on screen', () => {
  const js = read('js/feedback.js');
  // translate.js fills the dictionary asynchronously, after feedback.js has already
  // initialized. Caching the hidden English text at init makes a successful Arabic or
  // Twi submission overwrite the visitor's own thank-you with English.
  assert.match(js, /function\s+thanksText\b/, 'the driver has no late-language thank-you lookup');
  assert.match(js, /if\s*\(done\.hidden\)\s*success\s*=\s*done\.textContent/, 'the thank-you is never refreshed while still hidden');
  assert.match(js, /say\(thanksText\(\)\)/, 'a sent form announces its stale cached thank-you');
  assert.doesNotMatch(js, /var\s+thanks\s*=/, 'a thank-you cached before translation can overwrite the live dictionary');
});

test('the privacy page admits what feedback keeps', () => {
  const privacy = read('privacy.html');
  const section = /<h2 id="1">What you send us<\/h2>([\s\S]*?)<h2/.exec(privacy);
  assert.ok(section, 'the privacy page lost the section that names what is sent');
  assert.match(section[1], /feedback/i,
    'feedback is collected but privacy.html still does not say so');
});
