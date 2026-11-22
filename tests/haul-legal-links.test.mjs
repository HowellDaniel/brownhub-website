// A traveller lands on haul.html to read about a luggage service, then wants the
// terms of CARRYING THEIR BAGS. Until now the only Terms/Privacy on that page were
// the studio's agency documents (legal.html), which say nothing about custody,
// seals, PINs or the GH₵60,000 cover the app advertises. The Haul app publishes its
// own three pages; this holds the promise that the product page reaches them — and
// that the studio's own © line still points at the studio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const PAGES = ['terms.html', 'privacy.html', 'liability.html'];

function appOrigin() {
  const feed = JSON.parse(read('data/haul.json'));
  return new URL(feed.haul.app).origin;
}

test('the haul page links the three Haul legal documents, by absolute address', () => {
  const html = read('haul.html');
  const origin = appOrigin();
  for (const page of PAGES) {
    const href = `${origin}/${page}`;
    assert.ok(
      html.includes(`href="${href}"`),
      `expected an absolute link to ${href} so the page works from any host`,
    );
  }
});

test('the links move with the app, because the feed rewrites their origin', () => {
  const html = read('haul.html');
  // Every static address must sit beside the data-page the feed script resolves,
  // otherwise a new app host silently leaves three dead links behind.
  for (const page of PAGES) {
    assert.ok(html.includes(`data-page="${page}"`), `${page} needs a data-page for the feed to rewrite`);
  }
  assert.match(
    html,
    /getElementById\("haul-"\s*\+\s*key\)|getElementById\('haul-'\s*\+\s*key\)/,
    'the feed script must address the haul-<page> links by the same ids the markup uses',
  );
});

test('each link is reachable in the product band, not buried in a footer', () => {
  const html = read('haul.html');
  const band = html.slice(html.indexOf('<section class="app-band">'), html.indexOf('</main>'));
  for (const page of PAGES) assert.ok(band.includes(page), `${page} is not offered where the app is offered`);
});

test('the studio keeps its own legal line in the copyright row', () => {
  const html = read('haul.html');
  const copy = html.slice(html.indexOf('class="copy"'), html.indexOf('</footer>'));
  assert.ok(copy.includes('href="legal.html"'), "the agency's own terms must stay the agency's");
  assert.ok(copy.includes('href="privacy.html"'), "the agency's own privacy page must stay the agency's");
});

test('the Haul app really serves all three pages at those addresses', async () => {
  const origin = appOrigin();
  for (const page of PAGES) {
    const res = await fetch(`${origin}/${page}`, { cache: 'no-store' });
    const body = await res.text();
    assert.equal(res.status, 200, `${page} did not serve 200 from the deployed app`);
    assert.ok(!/id="track-code"/.test(body), `${page} was answered by the app shell, not the document`);
    assert.ok(/:root\{--paper/.test(body), `${page} shipped without the studio palette injected`);
  }
});
