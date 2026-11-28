import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const FULL = ['zh', 'tw', 'sw', 'ru', 'pt', 'nl', 'it', 'hi', 'fr', 'es', 'de', 'ar'];

// Every document that shows the cookie notice and the preferences centre. That list
// is the whole permission the pixel has: a page which never offers a visitor the
// choice can never claim the visitor made it.
const consentDocs = (() => {
  const found = [];
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      if (read(rel).includes('js/cookies.js')) found.push(rel);
    }
  }
  return found;
})();

const csp = (file) => {
  const m = read(file).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  return m ? m[1] : null;
};

const directive = (policy, name) => {
  if (!policy) return null;
  const hit = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '));
  return hit ? hit.slice(name.length + 1).trim() : null;
};

// Runs js/pixel.js inside a bare window/document, then settles the document the way a
// page of defer tags does, and reports what the loader asked the page to do. Assertions
// here are about behaviour, not about the shape of the source.
// The sequencing matters: every tag on the site is defer, and a defer script runs at
// readyState "interactive" — never "loading" — with the tags after it still unexecuted.
// So js/cookies.js publishes window.bhConsent only AFTER this file has run, and the
// document settles after that. This fixture models that order; pass `inline` for the
// world a script placed in <head> would see.
function runPixel(source, { advertising, decided, asked, inline, events }) {
  const injected = [];
  const listeners = {};
  const window = {};
  const publish = () => {
    window.bhConsent = () => ({ decided, analytics: false, advertising: !!advertising });
  };
  if (asked !== false && inline) publish();
  const document = {
    readyState: inline ? 'loading' : 'interactive',
    head: { appendChild: (node) => injected.push(node) },
    createElement: (tag) => ({ tagName: tag }),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const sandbox = { window, document, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  if (asked !== false && !inline) publish();
  const fire = (type) => (listeners[type] || []).forEach((fn) => fn({}));
  if (events) for (const type of events) fire(type);
  else { fire('DOMContentLoaded'); fire('bhconsent'); }
  return { injected, window, fire };
}

const withId = (value) =>
  read('js/pixel.js').replace(/var PIXEL_ID = "[^"]*";/, `var PIXEL_ID = ${JSON.stringify(value)};`);

/* ---------- the loader itself ---------- */

test('a pixel with no id cannot send a visitor anywhere', () => {
  const { injected, window } = runPixel(read('js/pixel.js'), { advertising: true, decided: true });
  assert.equal(injected.length, 0, 'the shipped file reached out for Facebook with no id configured');
  assert.equal(window.bhPixel('Lead', {}), false, 'an event was accepted with no id configured');
});

test('an id is only honoured when it looks like a real one', () => {
  // Meta's own ids run to fifteen or sixteen digits, so a gate that caps below that
  // silently switches the whole feature off on the one value it exists to accept.
  for (const good of ['12345678', '123456789012345', '12345678901234567890']) {
    const { injected } = runPixel(withId(good), { advertising: true, decided: true });
    assert.equal(injected.length, 1, `a ${good.length}-digit id was refused`);
    assert.match(injected[0].src, /^https:\/\/connect\.facebook\.net\/.{0,60}fbevents\.js$/);
  }
  for (const bad of ['', '   ', '12345', 'ca-pub-9752746325683248', 'https://fbq', '98 76 54 32',
    '123456789012345678901']) {
    const { injected } = runPixel(withId(bad), { advertising: true, decided: true });
    assert.equal(injected.length, 0, `${JSON.stringify(bad)} was treated as a pixel id`);
  }
});

test('only an explicit yes to advertising lets the pixel load', () => {
  const source = withId('123456789012345');
  for (const [label, state] of [
    ['no consent centre on the page', { asked: false }],
    ['no decision yet', { decided: false, advertising: false }],
    ['advertising refused', { decided: true, advertising: false }],
  ]) {
    const { injected, window } = runPixel(source, state);
    assert.equal(injected.length, 0, `${label} still loaded the pixel`);
    assert.equal(window.bhPixel('Lead', {}), false, `${label} still accepted an event`);
  }
  const ok = runPixel(source, { decided: true, advertising: true });
  assert.equal(ok.injected.length, 1, 'a yes to advertising did not load the pixel');
});

/* ---------- the returning visitor ---------- */

// js/cookies.js only dispatches "bhconsent" when a visitor changes their mind, so a yes
// stored on an earlier visit never produces an event on this one. The document settling is
// the sole moment that visitor's answer can be read — and a defer script runs at
// readyState "interactive", never "loading", which is why testing the document instead of
// the dependency is what made a stored yes look like no decision at all.
const settleOnly = { events: ['DOMContentLoaded'] };

test('a stored yes resumes the pixel when the document settles, with no event and nothing touched', () => {
  const { injected } = runPixel(withId('123456789012345'), { decided: true, advertising: true, ...settleOnly });
  assert.equal(injected.length, 1, 'a returning consenting visitor loaded no pixel');
});

test('a stored no keeps the pixel down when the document settles', () => {
  for (const state of [{ decided: true, advertising: false }, { decided: false, advertising: false }]) {
    const { injected } = runPixel(withId('123456789012345'), { ...state, ...settleOnly });
    assert.equal(injected.length, 0, `${JSON.stringify(state)} loaded the pixel on settle`);
  }
});

test('no consent centre on the page means no pixel, whichever way the document settles', () => {
  for (const extra of [settleOnly, {}, { events: [] }]) {
    const { injected, window } = runPixel(withId('123456789012345'), { asked: false, ...extra });
    assert.equal(injected.length, 0, 'the pixel loaded on a page that never asks');
    assert.equal(window.bhPixel('Lead', {}), false, 'an event was accepted with no consent centre');
  }
});

test('a loader that runs after the consent centre still starts on its first pass', () => {
  const { injected } = runPixel(withId('123456789012345'), { decided: true, advertising: true, inline: true, ...settleOnly });
  assert.equal(injected.length, 1, 'the pixel waited for a document event that had no answer to give');
});

test('the loader is silent about a visitor who never decides', () => {
  const { window, injected } = runPixel(withId('123456789012345'),
    { decided: false, advertising: false });
  assert.equal(window.bhPixel('Purchase', { currency: 'GHS', value: 1200 }), false);
  assert.equal(injected.length, 0, 'an event from an undecided visitor reached the network');
});

/* ---------- wiring ---------- */

test('every page that offers the consent centre carries the pixel, and no page that does not', () => {
  assert.ok(consentDocs.length >= 50, `only ${consentDocs.length} pages offer a consent centre`);
  for (const doc of consentDocs) {
    const html = read(doc);
    assert.match(html, /<script src="(?:\.\.\/)?js\/pixel\.js\?v=\d+" defer><\/script>/,
      `${doc} lets a visitor decide about advertising but cannot act on the answer`);
    const at = html.indexOf('js/pixel.js');
    const cookieAt = html.indexOf('js/cookies.js');
    assert.ok(cookieAt > -1 && at < cookieAt,
      `${doc} runs the pixel after the consent centre, so the first pass reads a stale answer`);
  }
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      if (consentDocs.includes(rel)) continue;
      assert.equal(read(rel).includes('js/pixel.js'), false,
        `${rel} loads the pixel but never asks the visitor for permission`);
    }
  }
});

test('the content policy admits Meta and nothing it does not need', () => {
  for (const doc of consentDocs) {
    const policy = csp(doc);
    assert.ok(policy, `${doc} has no content policy to widen`);
    assert.match(directive(policy, 'script-src') || '', /https:\/\/connect\.facebook\.net\b/,
      `${doc} would block the pixel script`);
    assert.match(directive(policy, 'connect-src') || '', /https:\/\/www\.facebook\.com\b/,
      `${doc} would block the pixel from reporting an event`);
    assert.match(directive(policy, 'img-src') || '', /https:\/\/www\.facebook\.com\b/,
      `${doc} would block the pixel's picture fallback`);
    for (const value of ['script-src', 'img-src', 'connect-src', 'frame-src', 'default-src']) {
      const list = directive(policy, value) || '';
      assert.equal(/\*\.facebook\.com|\*\.facebook\.net|facebook\.net\/\*|\*\.fbcdn\.net|graph\.facebook\.com/.test(list),
        false, `${doc} admits ${value} wider than the pixel needs`);
    }
  }
});

test('one ledger version of the pixel is asked for across the site', () => {
  const seen = new Set();
  for (const doc of consentDocs) {
    const m = read(doc).match(/<script src="(?:\.\.\/)?js\/pixel\.js\?v=(\d+)"/);
    assert.ok(m, `${doc} loads the pixel without a cache version`);
    seen.add(m[1]);
  }
  assert.equal(seen.size, 1, `the pixel is referenced at ${seen.size} different versions`);
});

/* ---------- the events ---------- */

test('an accepted enquiry reports a Lead, and a honeypotted one reports nothing', () => {
  const leads = read('js/leads.js');
  const handoff = leads.slice(leads.indexOf('function handoff'), leads.indexOf('function fallback'));
  assert.match(handoff, /if\s*\(\s*!honeypot\s*\)\s*window\.bhPixel\("Lead"/,
    'a filed enquiry either never reports a Lead, or reports one for spam too');
  const after = leads.slice(leads.indexOf('function fallback'));
  assert.equal(after.includes('bhPixel'), false, 'a lead that was never filed reports one');
});

test('a payment reports Purchase only once the money has settled, and without a person', () => {
  const store = read('js/store.js');
  const paid = store.slice(store.indexOf('function paid'), store.indexOf('function buy'));
  const at = paid.indexOf('bhPixel("Purchase"');
  assert.ok(at > -1, 'a completed payment is never reported');
  for (const early of ['still being processed', 'Payment not completed']) {
    assert.ok(paid.indexOf(early) < at, `the pixel fires before "${early}" leaves the screen`);
  }
  const call = paid.slice(at, paid.indexOf(');', at));
  assert.match(call, /currency:\s*"GHS"/, 'the purchase amount has no currency');
  assert.match(call, /value:\s*item\.price\b/, 'the purchase amount is not the price on the card');
  assert.equal(/mail|email|whatsapp|reference|item\.name/i.test(call), false,
    `a purchase carries something personal: ${call}`);
});

test('nothing personal is ever handed to the pixel from any caller', () => {
  const calls = [];
  for (const f of readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    const body = read(path.join('js', f));
    for (const m of body.matchAll(/bhPixel\(\s*"[^"]+"\s*,?\s*([^)]*)\)/g)) calls.push([f, m[1]]);
  }
  assert.ok(calls.length >= 2, `only ${calls.length} callers ask the pixel for anything`);
  for (const [f, args] of calls) {
    assert.equal(/mail|email|whatsapp|phone|reference|\bname\b|message/i.test(args), false,
      `${f} passes something identifying to Meta: ${args}`);
  }
});

/* ---------- telling the visitor ---------- */

const AD_DESC = "Lets the studio's display ad slot load, and lets Meta — the company behind " +
  'Facebook and Instagram — count which pages you read and whether an enquiry or a payment ' +
  'followed. No advertising script runs here unless you turn this on, and switching it off ' +
  'does not stop a partner setting their own cookie once you have followed a link to them.';

const PRIVACY_AD = 'The same choice also lets the Meta Pixel run on these pages. It tells ' +
  'Facebook and Instagram that a page was read and, when it happens, that an enquiry was sent ' +
  'or a payment made; the only figures it carries are the amount and currency of that payment. ' +
  'No name, email, phone number or message is ever sent to Meta, and refusing advertising stops ' +
  'the pixel before it loads.';

const OLD_AD_DESC = "Lets the studio's display ad slot load, along with the cookies Google and " +
  'its partners set to choose and measure the ads. No advertising script runs here unless you ' +
  'turn this on, and switching it off does not stop a partner setting their own cookie once you ' +
  'have followed a link to them.';

test('the cookie centre says Meta, and says it in every full dictionary', () => {
  const cookies = read('js/cookies.js');
  assert.ok(cookies.includes(AD_DESC), 'the advertising category does not describe the pixel');
  assert.equal(cookies.includes(OLD_AD_DESC), false, 'the old description is still offered too');
  for (const code of FULL) {
    const dict = JSON.parse(read(`i18n/${code}.json`));
    assert.ok(dict[AD_DESC], `${code} has no translation for the advertising description`);
    assert.ok(/ميتا|Meta|페이스북|facebook/i.test(dict[AD_DESC]),
      `${code} does not name Meta in its own script`);
    assert.equal(dict[OLD_AD_DESC], undefined, `${code} still carries the retired description`);
  }
});

test('the privacy page names the pixel and the dictionary carries it', () => {
  const privacy = read('privacy.html');
  const section = privacy.slice(privacy.indexOf('id="7"'), privacy.indexOf('id="8"'));
  assert.ok(section.includes(PRIVACY_AD), 'the Advertising section does not disclose the pixel');
  assert.ok(section.includes('Google'), 'the Advertising section stopped naming Google');
  for (const code of FULL) {
    const dict = JSON.parse(read(`i18n/${code}.json`));
    assert.ok(dict[PRIVACY_AD], `${code} has no translation for the pixel disclosure`);
    assert.ok(/ميتا|Meta|facebook/i.test(dict[PRIVACY_AD]),
      `${code} does not name Meta in its own script`);
  }
});

test('a page with no consent centre never asks Facebook for anything', () => {
  for (const dir of ['', 'blog', 'gallery']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.html')) continue;
      const rel = path.join(dir, name);
      if (consentDocs.includes(rel)) continue;
      const policy = csp(rel) || '';
      assert.equal(/facebook/.test(policy), false, `${rel} admits Facebook without asking`);
    }
  }
});
