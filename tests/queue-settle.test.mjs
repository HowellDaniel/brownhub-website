// A phone's first stage answer is a promise about the bottom queue, so it has to be made
// against the queue and not against the document. Measured on the live origin at 390x844
// (throttled phone rig, 2026-11-14):
//
//   @5001  q=71px   the load pass decides — stage built (body 1283 -> 656, run 0 -> 2754)
//   @5201  q=268px  the cookie bar arrives            (queue-change)
//   @5452  q=268px  the stage no longer fits — torn down, and the teardown passes a
//                    390x656 .pinband__body / .pstory__body through a 0x0 frame
//   @5309           layout-shift 0.7773
//   @5610  q=304px  the install pill arrives — the settled number the first answer
//                    should have been given
//
// `document.readyState === "complete"` was chosen as the proxy for "the notices have all
// landed", and two of the three queue members land *after* load. The band the reader is
// 7,856px away from was raised and taken back down while nobody could see it, and the
// visitor paid 0.78 of the score for the correction. So the settle test is asked of the
// queue itself: complete, and quiet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

/* The source text from the first `{` after `from` to the brace that closes it. */
function block(src, from) {
  const open = src.indexOf("{", from);
  assert.ok(open >= 0, "no block to read");
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(from, i + 1);
  }
  assert.fail("unbalanced block");
}

/* Both drivers make the same promise, so both are held to the same three things: a named
   settle window, a predicate that answers from the queue's own last movement, and a hold
   that re-asks itself. Without the third the hold is a hang, and the band never decides. */
const FORBIDDEN = /\b(require|import|export|globalThis|process|Function|eval|window|document|fetch|this|new|await|async)\b/;

function driver(file) {
  const src = strip(readFileSync(path.join(root, file), "utf8"));
  const settle = src.match(/\bconst SETTLE = ([0-9]+);/);
  const pred = src.match(/\bconst queueSettled = \([^)]*\) =>[^;]+;/);
  assert.ok(settle, `${file}: no SETTLE window — the queue's quiet period is not named`);
  assert.ok(pred, `${file}: no queueSettled predicate — the first answer is not asked of the queue`);
  return { file, src, settle: Number(settle[1]), pred: pred[0] };
}

/* The predicate is a pure arithmetic expression of its three arguments and the window, so
   the characters that may appear in it are enumerable. Anything outside the allowlist — a
   property lookup, a call, an identifier that is not one of the four in the signature —
   fails the test rather than reaching the evaluator, so what gets run is a number sentence
   and not whatever happens to be in the file. */
const ARGS = /^const queueSettled = \(([A-Za-z_$, ]+)\) =>/;
const SAFE = /^[A-Za-z0-9_+\-*/%().,=!&|?:<>\s]+$/;

function predicate(d) {
  const args = ARGS.exec(d.pred)[1].split(",").map((s) => s.trim());
  assert.deepEqual(args, ["moved", "now", "complete"], `${d.file}: unexpected predicate signature`);
  const body = d.pred.slice("const queueSettled = ".length).replace(/;$/, "");
  assert.ok(SAFE.test(body), `${d.file}: the settle rule is not a plain comparison of moved/now/complete`);
  assert.ok(!FORBIDDEN.test(body), `${d.file}: the settle rule reaches for something that is not its arguments`);
  assert.match(body, /SETTLE/, `${d.file}: the settle rule ignores its own window`);
  return new Function("SETTLE", `return (${body});`)(d.settle);
}

for (const file of ["js/pinband.js", "js/pstory.js"]) {
  test(`${file} settles a phone's first stage answer on the queue, not on load`, () => {
    const d = driver(file);
    const settled = predicate(d);
    assert.ok(d.settle >= 300, `${file}: a ${d.settle}ms window cannot outlast a notice that animates in`);

    // The document is not finished: nothing is settled yet, whatever the queue looks like.
    assert.equal(settled(0, 5000, false), false, "complete=false must never read as settled");
    assert.equal(settled(4900, 5000, false), false, "complete=false must never read as settled");

    // Finished, and no notice ever registered a change: there is nothing left to arrive.
    assert.equal(settled(0, 5000, true), true, "a queue that never moved is settled");

    // The measured failure: the load pass fired 24ms after a notice moved the edge
    // (@5001 the bubble at 71px), and the cookie bar was still on its way to 268px.
    assert.equal(settled(5000, 5024, true), false, "a queue that just moved is not settled");
    assert.equal(settled(5000, 5000 + d.settle - 1, true), false, "still inside the window");

    // The correction the driver used to make immediately: quiet past the window.
    assert.equal(settled(5000, 5000 + d.settle, true), true, "quiet for the whole window");
  });

  test(`${file} holds its first answer only while the queue is moving, and re-asks itself`, () => {
    const d = driver(file);
    const at = d.src.search(/if \([^\n]*!queueSettled\(/);
    assert.ok(at >= 0, `${file}: the first answer is not held by the queue's own settle`);
    const hold = block(d.src, at);
    /* The load pass is no longer allowed to be the answer on its own: it is the moment the
       measured queue was 71px while its final number was 304px. Readiness is still an input
       to the settle rule — a queue that never reported a movement has not finished arriving
       until the page has — but `!== "complete"` standing in for "the notices have landed"
       is exactly the proxy that cost the visitor the 0.78. */
    assert.match(hold, /queueSettled\(/, `${file}: the hold is not asked of the queue`);
    assert.doesNotMatch(hold, /readyState\s*!==\s*"complete"/, `${file}: the hold still decides on readiness alone`);
    assert.match(hold, /\breask\(\)/, `${file}: nothing re-asks after the hold — a quiet queue never decides`);

    const def = d.src.indexOf("function reask()") >= 0
      ? block(d.src, d.src.indexOf("function reask()"))
      : block(d.src, d.src.indexOf("reask = function"));
    assert.ok(def.includes("setTimeout("), `${file}: reask() does not schedule itself`);
    assert.ok(/this\.ask\(\)|evaluate\(\)/.test(def), `${file}: reask() does not re-run the layout`);
  });
}
