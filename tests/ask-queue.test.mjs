// One bottom ask at a time.
//
// Measured on the live origin at 390x844 for #581: a first-time visitor on a phone was
// handed four things fixed to the bottom edge of the same screen — the cookie notice at
// ~150px, the install pill at ~90px, the quote card at ~330px and the assistant's teaser
// at ~50px — 623px of an 844px screen, so the page they came to read was gone and the
// pinned stage was told to stop below all of it. Each script had its own politeness
// (the quote card waits for consent, the teaser waits for the welcome card) and none of
// them could see the others, so four separate courtesies still stacked.
//
// The queue in js/app.js already measures how much of the bottom edge is owned; what was
// missing is that the measurement was allowed to grow. So the same hand that measures it
// now hands out the right to stand there: one owner, the rest wait, and when the owner
// leaves the edge, the waiting ask with the strongest claim takes it.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASK = require("../js/askqueue.js");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = strip(readFileSync(path.join(root, "js/app.js"), "utf8"));
const read = (f) => strip(readFileSync(path.join(root, f), "utf8"));

const KEYS = ["consent", "build", "install", "quote", "teaser"];
const RANKS = ASK.RANKS;

function build(standing) {
  return ASK.make(RANKS, standing || (() => true));
}

function logger() {
  const seen = [];
  return { seen, fn: (key) => () => { seen.push(key); } };
}

test("every bottom ask has a rank, and consent outranks every marketing ask", () => {
  assert.deepEqual(Object.keys(RANKS).sort(), KEYS.slice().sort(), "every ask must have a rank");
  assert.ok(RANKS.consent < RANKS.build && RANKS.build < RANKS.install,
    "an update prompt must not bury the consent notice it waits behind");
  assert.ok(RANKS.install < RANKS.quote && RANKS.quote < RANKS.teaser,
    "install before quote before teaser — the order the four were stacking in");
});

test("the first ask to arrive takes the bottom edge and the next one waits", () => {
  const q = build();
  const l = logger();
  assert.equal(q.request("quote", l.fn("quote")), true, "an empty queue grants the first ask");
  assert.equal(q.request("install", l.fn("install")), false, "a second ask must wait, not stack");
  assert.deepEqual(l.seen, ["quote"], "the waiting ask was shown anyway");
  assert.equal(q.owner(), "quote");
});

test("the edge passes to the strongest claim, not to whoever asked first", () => {
  const q = build();
  const l = logger();
  q.request("quote", l.fn("quote"));
  q.request("teaser", l.fn("teaser"));
  q.request("consent", l.fn("consent"));
  q.request("install", l.fn("install"));
  l.seen.length = 0;
  q.release("quote");
  assert.deepEqual(l.seen, ["consent"], "consent outranks install and teaser");
  q.release("consent");
  assert.deepEqual(l.seen, ["consent", "install"], "install is next");
  q.release("install");
  assert.deepEqual(l.seen, ["consent", "install", "teaser"], "the teaser is last");
  assert.equal(q.owner(), "teaser");
});

test("an ask already standing is not shown a second time", () => {
  const q = build();
  const l = logger();
  q.request("install", l.fn("install"));
  assert.equal(q.request("install", l.fn("install")), true, "the owner keeps its claim");
  assert.deepEqual(l.seen, ["install"], "the same card was raised twice on one edge");
});

test("an ask that declines the edge hands it straight to the next waiter", () => {
  /* js/leads.js re-checks its own eligibility when its turn comes — the visitor may have
     answered the card on another page — so a grant it no longer wants cannot be allowed
     to hold the bottom edge empty. */
  const q = build();
  const l = logger();
  q.request("quote", l.fn("quote"));
  q.request("teaser", () => { l.seen.push("teaser"); q.release("teaser"); });
  l.seen.length = 0;
  q.release("quote");
  assert.deepEqual(l.seen, ["teaser"], "the declined grant never reached the screen");
  assert.equal(q.owner(), null, "a declined grant locked the queue");
});

test("a waiter that lets go before its turn is dropped, not remembered", () => {
  const q = build();
  const l = logger();
  q.request("quote", l.fn("quote"));
  q.request("teaser", l.fn("teaser"));
  q.release("teaser");
  l.seen.length = 0;
  q.release("quote");
  assert.deepEqual(l.seen, [], "a teaser that had already been cancelled came back");
  assert.equal(q.owner(), null);
});

test("a release from an ask that does not own the edge changes nothing", () => {
  const q = build();
  const l = logger();
  q.request("quote", l.fn("quote"));
  q.request("install", l.fn("install"));
  l.seen.length = 0;
  assert.equal(q.release("teaser"), false, "a stranger released the queue");
  assert.equal(q.release("install"), false, "a waiter released the owner");
  assert.deepEqual(l.seen, [], "the owner lost the edge to an ask that never had it");
  assert.equal(q.owner(), "quote");
});

test("sweep() frees the edge from an ask that left it without saying so", () => {
  /* Dismissing a notice is five code paths across four files, and a missed one would
     park every other ask forever. So the same pass that measures the bottom edge also
     checks that whoever holds the claim is still on screen. */
  const up = new Set(["quote"]);
  const q = build((key) => up.has(key));
  const l = logger();
  q.request("quote", l.fn("quote"));
  q.request("install", l.fn("install"));
  q.sweep();
  assert.deepEqual(l.seen, ["quote"], "a standing ask was treated as gone");
  up.delete("quote");                       // removed from the DOM with no release()
  q.sweep();
  assert.deepEqual(l.seen, ["quote", "install"], "the vanished owner kept the edge locked");
  assert.equal(q.owner(), "install");
});

test("an unknown ask is refused rather than queued forever", () => {
  const q = build();
  assert.equal(q.request("popularity", () => assert.fail("shown")), false,
    "a key with no rank must not take the bottom edge");
  assert.equal(q.owner(), null);
});

test("every ask script goes through the queue and gives the edge back", () => {
  for (const [file, key] of [["js/cookies.js", "consent"], ["js/leads.js", "quote"], ["js/chat.js", "teaser"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`bhAsk\\.request\\("${key}"`), `${file}: raises its ask uninvited`);
    assert.match(src, new RegExp(`bhAsk\\.release\\("${key}"`), `${file}: never gives the edge back`);
  }
  assert.match(app, /bhAsk\.request\("install"/, "js/app.js: the install pill is uninvited");
  assert.match(app, /bhAsk\.request\("build"/, "js/app.js: the update card is uninvited");
  assert.match(app, /bhAsk\.release\("install"/, "js/app.js: the install pill never lets go");
  assert.match(app, /bhAsk\.release\("build"/, "js/app.js: the update card never lets go");
});

test("the queue is built once, from app.js, against what is really on screen", () => {
  assert.match(app, /window\.bhAsk = BHAskQueue\.make\(/, "nothing builds the queue");
  const probe = app.slice(app.indexOf("function askStanding"), app.indexOf("function askStanding") + 900);
  assert.ok(probe.length > 60, "js/app.js: the queue is not given a way to see the edge");
  assert.match(probe, /querySelector/, "the standing check does not look at the DOM");
  assert.match(probe, /hidden/, "the standing check counts a hidden notice as on screen");
  for (const key of KEYS) assert.ok(probe.includes(key), `the standing check knows nothing about ${key}`);
});

test("the measured pass that reserves the bottom edge also sweeps the queue", () => {
  const at = app.indexOf("function reserve()");
  assert.ok(at >= 0, "js/app.js: the bottom-edge measurement is gone");
  const body = app.slice(at, app.indexOf("\n  }", at));
  assert.match(body, /bhAsk\.sweep\(\)/, "the measured pass never frees a vanished owner");
});

test("every page that loads app.js loads the queue module first", () => {
  const pages = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if ([".git", ".superpowers", "node_modules", ".worktrees"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) pages.push(file);
    }
  }
  walk(root);
  const missing = [];
  let tagged = 0;
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const at = html.indexOf("js/app.js?v=");
    if (at === -1) continue;
    tagged++;
    if (!html.slice(Math.max(0, at - 200), at).includes("js/askqueue.js?v=")) {
      missing.push(path.relative(root, page));
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(tagged >= 50, `only ${tagged} pages carry the queue`);
});

function htmlPages(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", ".superpowers", "node_modules", ".worktrees"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlPages(file));
    else if (entry.name.endsWith(".html")) found.push(file);
  }
  return found;
}

// Putting the queue onto every page meant editing the script row on 50+ files, and on five
// of them the edit swallowed the `<script src="` of the tag next to it: the page still
// carried askqueue, so the test above stayed green while app.js became loose text in the
// body and the whole bottom-queue layer never ran. A tag that loads nothing is not wired in.
test("no page leaves script markup stranded between tags", () => {
  const stranded = [];
  for (const page of htmlPages(root)) {
    const html = readFileSync(page, "utf8");
    for (const m of html.matchAll(/<\/script>\s*([^\s<][^\n]*)/g)) {
      stranded.push(`${path.relative(root, page)} -> ${m[1].slice(0, 60)}`);
    }
  }
  assert.deepEqual(stranded, []);
});
