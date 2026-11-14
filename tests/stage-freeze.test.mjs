// A pinned stage measures the room it has, and the room a phone's stage has is one screen
// minus the notices at the bottom of it. Measured on the live origin at 390x844 with the
// reader standing inside the Customer experience band (scrollY 11,112), dismissing nothing
// and arriving nowhere:
//
//   q=228px  run 2,754px  body 653px   the stage as applied
//   q=509px  run 1,806px  body 439px   the .leadask quote card lands -> the pass re-trims
//                                       the picture and re-heights the window under a
//                                       reader who is standing in it
//   layout-shift 0.6645
//
// `#579` settled the first answer against the queue, and the driver already refuses two
// corrections in place: a page-count flip (js/pinband.js, `this.paged !== (n >= 2)`) and a
// stage that has become impossible (`cut > 0`). The third case was left to fall through —
// the stage is still possible, there is simply less of it now — so the queue jump paid for
// itself by rewriting `--pin-media-h`, the window height and `--pin-pages` on screen.
//
// The owner's call, 2026-11-14: freeze the stage until they scroll past it. The numbers
// a standing stage is built on are held exactly as they were, and the corrected measurement
// is applied by the scroll path the next time the band lies out of sight.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const src = strip(readFileSync(path.join(root, "js/pinband.js"), "utf8"));

/* The source text from the first `{` after `from` to the brace that closes it. */
function block(text, from) {
  const open = text.indexOf("{", from);
  assert.ok(open >= 0, "no block to read");
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(from, i + 1);
  }
  assert.fail("unbalanced block");
}

function at(re, what) {
  const found = src.search(re);
  assert.ok(found >= 0, `js/pinband.js: ${what} is not in the driver`);
  return found;
}

/* The same reading, asked of a file the helper above is not bound to. */
function at2(text, re, what) {
  const found = text.search(re);
  assert.ok(found >= 0, `${what} is not in the story driver`);
  return found;
}

/* The rule is a sentence of five booleans, so the characters in it are enumerable and the
   test can run the production text instead of paraphrasing it. */
const FORBIDDEN = /\b(require|import|export|globalThis|process|Function|eval|window|document|fetch|this|new|await|async)\b/;
const SAFE = /^[A-Za-z0-9_&|!(),=<>?\s]+$/;
const ARGS = /^const stageFrozen = \(([A-Za-z_$, ]+)\) =>/;

function predicate() {
  const line = src.match(/\bconst stageFrozen = \([^)]*\) =>[^;]+;/);
  assert.ok(line, "js/pinband.js: no stageFrozen rule — a standing stage is not held");
  const args = ARGS.exec(line[0])[1].split(",").map((s) => s.trim());
  assert.deepEqual(args, ["decided", "standing", "inSight", "roomSame", "moved"],
    "js/pinband.js: unexpected stageFrozen signature");
  const body = line[0].slice("const stageFrozen = ".length).replace(/;$/, "");
  assert.ok(SAFE.test(body), "js/pinband.js: the freeze rule reaches past its five arguments");
  assert.ok(!FORBIDDEN.test(body), "js/pinband.js: the freeze rule is not a plain sentence of booleans");
  return new Function(`return (${body});`)();
}

const frozen = predicate();

test("the stage freezes only for a standing band the reader can still see", () => {
  // The measured defect: decided, paged, on screen, same room, and only the notices moved.
  assert.equal(frozen(true, true, true, true, true), true, "a queue-only move inside a stage must hold");

  // Out of sight, the correction is free — that is when it is owed.
  assert.equal(frozen(true, true, false, true, true), false, "a band nobody can see is not frozen");

  // Nothing has been applied yet, so there is no measurement to overturn: the first answer
  // is #579's job, not this one.
  assert.equal(frozen(false, true, true, true, true), false, "a band that has not decided is not frozen");

  // A plain grid takes nothing from the queue in JS, so freezing it would only strand it.
  assert.equal(frozen(true, false, true, true, true), false, "a stage that is not standing is not frozen");

  // The window changed size, a filter changed the set, or the page size moved: that is a
  // different question, and it is answered where it always was.
  assert.equal(frozen(true, true, true, false, true), false, "a room that moved is a new question");

  // The queue did not move at all — nothing has any right to hold.
  assert.equal(frozen(true, true, true, true, false), false, "a pass the queue is not part of is not frozen");
});

test("a held pass writes nothing a reader could see", () => {
  const at = src.search(/if \(stageFrozen\(/);
  assert.ok(at >= 0, "js/pinband.js: the freeze rule is never asked");
  const held = block(src, at);
  assert.match(held, /this\.pending = false;/, "js/pinband.js: a held pass books no debt to pay later");
  assert.match(held, /return;/, "js/pinband.js: a held pass does not fall through to the geometry");
  // The numbers that were measured are the numbers that stay: none of them is touched, and
  // neither is the picture's cut, which `trim()` writes as a side effect.
  for (const write of ["setProperty", "style.height", "--pin-media-h", "this.trim(", "standAside("]) {
    assert.ok(!held.includes(write), `js/pinband.js: a held pass still writes ${write}`);
  }
});

test("the hold is asked before the stage is measured or rearranged", () => {
  /* Judged inside the pass itself: `setPaged` is also called from `standAside`, which sits
     earlier in the file and would otherwise read as a write that got ahead of the hold. */
  const layout = block(src, at(/Band\.prototype\.layout = function/, "the layout pass"));
  const held = layout.search(/if \(stageFrozen\(/);
  assert.ok(held >= 0, "js/pinband.js: the pass never asks the freeze rule");
  for (const [re, what] of [
    [/this\.setPaged\(/, "the arrangement flip"],
    [/const room = this\.spare\(\);/, "the room measurement"],
    [/const cut = this\.trim\(/, "the picture cut"],
    [/this\.win\.style\.height = page/, "the window height"],
    [/"--pin-pages"/, "the page count"],
  ]) {
    const wrote = layout.search(re);
    assert.ok(wrote >= 0, `js/pinband.js: ${what} is not in the pass`);
    assert.ok(held < wrote, `js/pinband.js: ${what} happens before the hold can stop it`);
  }
});

test("the room and the queue are named apart, and an applied pass records both", () => {
  // charge() is the term that moves under a standing reader, so it cannot be folded into
  // one opaque key with the things that say the band was asked the same question. Since #582
  // the queue term is the band's own number where it has one, and the page's live charge is
  // only the fallback it was before any band was read.
  at(/\bconst shape = innerWidth \+ "x" \+ innerHeight \+ "\/" \+ this\.cards\.length \+ "\/" \+ this\.page;/,
    "the room key");
  at(/\bconst owed = own >= 0 \? own : charge\(\);/, "the queue reading");
  at(/\bconst ctx = shape \+ "\/" \+ owed;/, "the question key built from both");
  at(/if \(ctx !== this\.ctx\) \{ this\.ctx = ctx; this\.aside = false; \}/, "the question gate");
  // Written only where geometry is actually applied, so a deferred pass cannot claim a
  // measurement it never made.
  const applied = at(/this\.run\.style\.setProperty\("--pin-pages", String\(n - 1\)\);/, "the page-count write");
  const pages = src.slice(applied, applied + 700);
  assert.match(pages, /this\.shape = shape;/, "js/pinband.js: an applied pass records no room");
  assert.match(pages, /this\.qc = owed;/, "js/pinband.js: an applied pass records no queue");
  assert.ok(at(/this\.shape = shape;/, "the room record") > applied,
    "js/pinband.js: the room is recorded before it is applied");
});

test("the debt is still paid off the screen, by the scroll path", () => {
  const follow = block(src, at(/Band\.prototype\.follow = function \(\)/, "follow()"));
  assert.match(follow, /this\.pending !== undefined/, "js/pinband.js: the scroll path ignores a booked debt");
  assert.match(follow, /this\.belowReader\(\)/, "js/pinband.js: the debt is paid somewhere the reader can see");
  assert.match(follow, /this\.ask\(\)/, "js/pinband.js: the debt is paid without re-measuring");
});

test("the story driver is held by its own flip rule and by the band's own number", () => {
  /* js/pstory.js writes no stage geometry — it only ever flips the arrangement, and that
     flip is already barred while the reader can see it. What it does share with pinband is
     the queue number the arrangement is measured against, tested below. */
  const story = strip(readFileSync(path.join(root, "js/pstory.js"), "utf8"));
  assert.doesNotMatch(story, /--pin-media-h|--pin-page-h|--pin-pages/,
    "js/pstory.js: the story now writes stage geometry, so the freeze has to cover it");
  assert.match(story, /if \(decided && want !== pinned && \(!belowReader\(\) \|\| awaitingArrival\(\)\)\) \{/,
    "js/pstory.js: the arrangement flip is no longer barred in front of the reader");
});

/* ------------------------------------------------------------ the shipped rule (#580) */

const css = strip(readFileSync(path.join(root, "css/style.css"), "utf8"));
const min = readFileSync(path.join(root, "css/style.min.css"), "utf8");
const pin = strip(readFileSync(path.join(root, "js/pinband.js"), "utf8"));
const story = strip(readFileSync(path.join(root, "js/pstory.js"), "utf8"));

test("the stage spends the band's own number before the page's live queue", () => {
  /* One expression, on the band, in both viewport variants: the lock is what a read band
     keeps, and a band nobody has reached yet still follows --queue-h like the rest of the
     page. If the chain ever goes back to :root, one notice re-fits every stage at once —
     which is the defect, measured at 0.4208 for a band the reader was standing in. */
  assert.match(css, /--stage-queue:var\(--queue-lock, var\(--queue-h, 0px\)\)\;/,
    "css/style.css: the stage no longer prefers the band's locked queue");
  const spent = css.indexOf("--stage-queue:var(--queue-lock");
  const named = css.lastIndexOf(".pinband, .pstory{", spent);
  assert.ok(named >= 0 && spent - named < 60,
    "css/style.css: --stage-queue is not named on the band");
  assert.ok(!/:root\{[^}]*--stage-/.test(css),
    "css/style.css: a stage height is back on :root, so one notice moves every band");
  // And the file the phone actually downloads says the same thing.
  assert.ok(min.includes("--stage-queue:var(--queue-lock,var(--queue-h,0px))") ||
    min.includes("--stage-queue:var(--queue-lock, var(--queue-h, 0px))"),
    "css/style.min.css: the shipped sheet does not spend the band's lock");
});

test("both stage drivers name the lock once, ahead of sight", () => {
  for (const [src, file] of [[pin, "js/pinband.js"], [story, "js/pstory.js"]]) {
    const arm = src.search(/\bconst arm = \(\) => \{/);
    assert.ok(arm >= 0, `${file}: the band is never given a queue number of its own`);
    const body = src.slice(arm, src.indexOf("};", arm));
    assert.match(body, /typeof IntersectionObserver !== "function"/,
      `${file}: the arming is not guarded for an engine without the observer`);
    // Asking when the band is already visible is asking a frame too late.
    assert.match(body, /rootMargin: "0px 0px 100% 0px"/,
      `${file}: the lock is not asked ahead of sight`);
    assert.match(body, /disconnect\(\)/, `${file}: the band keeps being watched after it was read`);
    assert.match(body, /"--queue-lock", Math\.round\(charge\(\)\) \+ "px"/,
      `${file}: the lock is not the band's own live charge`);
    assert.ok(src.indexOf("arm();") > arm, `${file}: arm() is defined and never called`);
  }
});

test("a phone band sizes its stage only against a queue number it owns", () => {
  /* #582, measured at 390x844 on catalog.html (throttled phone rig, 2026-11-14): the shelf
     answered "stage" at 830ms against a 68px bottom queue, the cookie bar and the install
     pill both landed by 1,115ms and charged 304px, the row stopped fitting, and that pass
     tore the stage down — 15,583px of band becoming a 4,675px grid — and Chrome billed
     0.6801 of the layout-shift score for the destruction of a picture 859px above a reader
     who never saw it. The owner's law: sized once, before it is ever visible, never
     re-sized. So the number a first answer is measured against has to be the number the
     sheet spends for that band from then on — its lock — and the lock is taken a viewport
     ahead of sight, so waiting for it costs nobody a look. */
  const own = at(/\bconst locked = \(/, "the band's own queue number");
  const helper = block(pin, own);
  assert.match(helper, /getPropertyValue\("--queue-lock"\)/,
    "js/pinband.js: the band's own number is not read from its lock");
  assert.match(helper, /-1/, "js/pinband.js: a band with no lock reads as if it had one");

  // The decision spends it, with the page's live queue only as the fallback it always was.
  const reading = at(/\bconst owed = own >= 0 \? own : charge\(\);/, "the queue reading");
  assert.ok(own < reading, "js/pinband.js: the queue reading does not use the band's number");
  at(/\bconst own = locked\(this\.band\);/, "the band's number taken into the pass");

  /* And the first answer waits for it. A band nobody has approached has no lock, so at boot
     it would size a stage against whichever notice happened to have arrived — the exact
     gamble the teardown is made of. The hold is void where no lock can ever arrive (an engine
     with no observer), so it cannot hang, and a desk, which pays the queue nothing, is never
     asked to wait at all. */
  const hold = at(/Band\.prototype\.awaitingLock = function/, "the first-answer lock hold");
  const held = block(pin, hold);
  assert.match(held, /this\.decided/, "js/pinband.js: a decided band is still held for its number");
  assert.match(held, /paysQueue\(\)/, "js/pinband.js: a desk is asked to wait for a queue it does not pay");
  assert.match(held, /IntersectionObserver/, "js/pinband.js: the hold does not give up where no lock can arrive");
  assert.match(held, /locked\(this\.band\) < 0/, "js/pinband.js: the hold is not asked of the band's number");
  assert.ok(hold < reading, "js/pinband.js: the hold is named after the pass that must consult it");

  const permission = at(/const below = !this\.awaitingArrival\(\) && !this\.awaitingQueue\(\) && !this\.awaitingLock\(\)/,
    "the off-screen permission");
  // Asked before anything is built: the whole point is that the stage is never raised twice.
  const measured = at(/const room = this\.spare\(\);/, "the room measurement");
  assert.ok(permission < measured, "js/pinband.js: the stage is measured before the hold can stop it");

  /* The observer that gives the number has to hand the band back its question: a lock
     written a viewport early, with nothing re-asking, is a number nobody ever sizes to. */
  const arm = pin.slice(pin.search(/\bconst arm = \(\) => \{/));
  const write = arm.indexOf('"--queue-lock"');
  assert.ok(write >= 0, "js/pinband.js: the arming never writes the lock");
  assert.ok(arm.indexOf("this.ask()") > write, "js/pinband.js: taking the lock never re-asks the band");
});

test("the story holds its first arrangement for a queue number it owns", () => {
  /* Measured at 390x844 on index.html with the same rig, 2026-11-14: the collection bands
     stopped paying for a phantom stage, and the home page still billed 0.7808 of the layout
     shift score at 850ms for `div.container.pstory__body` going from 390x659 to nothing.
     The process story is the other half of the same layer — it raises a pinned stage, and it
     was the one stage left sizing its first answer against whichever queue number happened to
     be on the page. The hold js/pinband.js takes is taken here too, in the same words. */
  const hold = at2(story, /function awaitingLock\(\) \{/, "the story's first-answer lock hold");
  const held = block(story, hold);
  assert.match(held, /if \(decided \|\| !paysQueue\(\)\) return false;/,
    "js/pstory.js: a decided story is still held for its number");
  assert.match(held, /typeof IntersectionObserver !== "function"/,
    "js/pstory.js: the hold does not give up where no lock can arrive");
  /* The trap this hold first shipped with: the band has no number until its observer writes
     one, so the property is absent, and `parseFloat("")` is NaN — and `NaN < 0` is false. Read
     that way the hold let a band with no number answer as if it owned one, which is the defect
     it was written to stop. js/pinband.js names -1 for the case; the story has to ask the same
     question its own owed() asks, where a missing property is a missing number. */
  assert.match(held, /--queue-lock"\)\) >= 0/,
    "js/pstory.js: the hold reads the band's number with the comparison owed() uses");
  assert.doesNotMatch(held, /--queue-lock"\)\) < 0/,
    "js/pstory.js: `< 0` is never true of a band with no number, so the hold would not hold");

  // Asked before the settle window, so a band with no number is never answered by a timer.
  const asked = at2(story, /if \(awaitingLock\(\)\) \{/, "the hold being taken in the pass");
  const settle = at2(story, /if \(!decided && paysQueue\(\) && !queueSettled\(/, "the settle hold");
  assert.ok(asked < settle, "js/pstory.js: the settle window answers before the lock can hold");
  const booking = block(story, asked);
  assert.match(booking, /pending = want;/, "js/pstory.js: a held story books no debt to pay later");
  assert.match(booking, /classList\.toggle\("js-pstory", pinned\)/,
    "js/pstory.js: a held pass leaves the measuring class standing");

  // And the observer that gives the number re-asks, or the hold is a hang.
  const arm = story.slice(story.search(/\bconst arm = \(\) => \{/));
  const write = arm.indexOf('"--queue-lock"');
  assert.ok(write >= 0, "js/pstory.js: the arming never writes the lock");
  assert.ok(arm.indexOf("evaluate()") > write, "js/pstory.js: taking the lock never re-asks the story");
});

test("only a room that changed width takes the number back", () => {
  /* A phone's toolbar tucks away while the reader scrolls and moves innerHeight alone; the
     svh the stage is built from already ignores it, so releasing on that would thaw the
     freeze on every scroll. A rotation and a dragged window are the room changing. */
  assert.match(pin, /const rewider = innerWidth !== wide;/,
    "js/pinband.js: the pinband release no longer keys on the width");
  assert.match(pin, /if \(rewider\) unkeep\(\);/,
    "js/pinband.js: the pinband release is not tied to the width key");
  assert.match(story, /if \(innerWidth !== wide\) \{ wide = innerWidth; unkeep\(\); \}/,
    "js/pstory.js: the story release is not tied to the width");
  for (const [src, file] of [[pin, "js/pinband.js"], [story, "js/pstory.js"]]) {
    const unkeep = src.slice(src.search(/\bconst unkeep = \(\) => \{/));
    assert.match(unkeep, /removeProperty\("--queue-lock"\)/, `${file}: unkeep does not give the number back`);
    assert.match(unkeep.slice(0, 400), /arm\(\);/, `${file}: unkeep gives the number back and never re-asks`);
  }
});

test("the story measures its room against the number it holds, not the live queue", () => {
  /* A frozen lock and a live charge() disagree as soon as a notice lands, and fits() was
     the one place the story compared the two: it would have un-pinned the story off screen,
     four steps of picture folding into a stack the reader never asked for. */
  const owed = story.slice(story.search(/\bconst owed = \(\) => \{/));
  assert.match(owed.slice(0, 400), /getPropertyValue\("--queue-lock"\)/,
    "js/pstory.js: owed() does not read the band's own lock");
  assert.match(owed.slice(0, 400), /return held >= 0 \? held : charge\(\);/,
    "js/pstory.js: owed() does not fall back to the live queue");
  const fits = story.slice(story.search(/function fits\(\) \{/));
  assert.match(fits.slice(0, 500), /innerHeight - navH\(\) - owed\(\)/,
    "js/pstory.js: fits() is measured against the live queue again");
});

test("every page that runs a stage driver asks the sheet that spends its lock", () => {
  /* The freeze is two files: JS names the number, CSS spends it. A reader whose cache still
     holds the pre-#580 sheet computes the stage from :root no matter what the driver writes
     on the band, so the two ledgers have to move together on every page that carries a band. */
  const asked = (page, re) => Number((page.match(re) || [])[1] || 0);
  for (const file of ["index.html", "catalog.html", "engineering.html"]) {
    const page = readFileSync(path.join(root, file), "utf8");
    const drivers = asked(page, /js\/pinband\.js\?v=(\d+)/), sheets = asked(page, /css\/style\.min\.css\?v=(\d+)/);
    const storyDriver = asked(page, /js\/pstory\.js\?v=(\d+)/);
    assert.ok(drivers >= 23 && sheets >= 189,
      `${file}: stage driver ${drivers} against sheet ${sheets} — a cached pre-#582 sheet ignores the band's number`);
    if (/class="[^"]*\bpstory\b/.test(page)) {
      assert.ok(storyDriver >= 11,
        `${file}: carries a process story but asks pstory.js v${storyDriver}, which answers before it owns a number`);
    }
  }
});
