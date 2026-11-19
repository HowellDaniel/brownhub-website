// A visitor coming back for the second time is the whole reason an assistant is worth
// talking to, and the thread kept in js/chat.js is what lets it recall them. Two separate
// things were measured breaking that on the live origin on 2026-11-19.
//
// First, a failed model call was filed as if it had succeeded. The studio's apology —
// "I didn't quite catch that. I'm best at quick answers on graphic design and branding" —
// went into the remembered thread as a `model` turn, was replayed to the visitor as the
// last thing they had ever been told, and rode to the provider on every later turn. One
// bad minute of the provider becomes an assistant that looks as though it never listened.
// Captured off the live wire after a single 502:
//   stored: ["user:Hi, I'm Kwame...", "model:I didn't quite catch that..."]
//
// Second, that failure is a bad moment rather than a bad question. The byte-identical
// request that returned 502 returned 200 nine seconds later, twice over, with no change of
// input — so the question is worth putting once more before the visitor is handed an
// apology. Not after our own wait, though: a retry that follows a full wait is not a retry,
// it is a longer silence.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(root, "js/chat.js"), "utf8");

/* The source of one function declaration, braces matched so a nested block cannot end it
   early — the same lift the queue-settle harness uses, so the rule evaluated below is the
   one the page carries and not a copy kept alive in this file. */
function fnBody(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no function ${name}() in js/chat.js`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`${name}() never closed`);
}

/* A top-level constant lifted as its own declaration statement, so a compiled rule sees the
   numbers and tables the page carries. This file never restates a value it is checking. */
function given(...names) {
  return names
    .map((name) => {
      const m = src.match(new RegExp(`^ +(const ${name} = [^;\\n]+);$`, "m"));
      assert.ok(m, `no constant ${name} in js/chat.js`);
      return m[1];
    })
    .join("\n");
}

/* The only things lifted into the evaluator are whole declarations taken out of js/chat.js,
   and the gate that makes compiling them safe is the FORBIDDEN list: a rule that reaches for
   the page, the network or another evaluator fails here instead of being run. */
const FORBIDDEN = /\b(require|import|export|globalThis|process|Function|eval|window|document|fetch|localStorage|this|await|async)\b/;

function rule(name, ...deps) {
  const body = fnBody(name);
  assert.ok(!FORBIDDEN.test(body), `${name}() reaches for something outside its own arguments`);
  return new Function(`${given(...deps)}\n${body}; return ${name};`)();
}

test("an answer that never arrived is not filed as something the assistant said", () => {
  const memorise = rule("memorise", "FORGOTTEN");
  assert.equal(memorise("fallback"), false, "the apology must not enter the visitor's memory");
  assert.equal(memorise("model"), true, "a real answer must still be remembered");
  assert.equal(memorise("intent"), true, "a written answer must still be remembered");
});

test("the apology is still shown, so a failed turn never goes silent", () => {
  const body = fnBody("answer");
  assert.match(body, /replyWith\(fallback, "fallback"\)/, "the visitor must still be told nothing arrived");
  assert.match(body, /memorise\(source\)/, "what gets remembered is decided by the rule, not assumed");
});

test("the archive has four doors and every one of them is an answer that arrived", () => {
  // Before this fix there were five, and three of them could be handed the studio's apology
  // for a call that never came back — which is how one bad provider minute ended up being
  // what a visitor remembered of their own conversation. Anything that reaches this list is
  // what the thread is made of, so a new door has to be argued for rather than added quietly.
  const doors = src.match(/remember\("model",/g) || [];
  assert.equal(doors.length, 4, "one gated reply surface plus three answers that arrived");
  assert.equal((src.match(/if \(memorise\(source\)\) remember\("model",/g) || []).length, 1,
    "exactly one door is the reply surface, where the rule decides");
  assert.deepEqual([...src.matchAll(/remember\("model",\s*["'`]/g)].map((m) => m[0].trim()), [],
    "the other doors are answers, so none of them can be a sentence typed into this file");
});

test("a question the provider failed on fast is put once more", () => {
  const worthAskingAgain = rule("worthAskingAgain", "RETRY_WINDOW_MS");
  const waitMs = Number(given("WAIT_MS").match(/\d+/)[0]);
  assert.equal(worthAskingAgain(0), true, "a call that came back at once is a bad moment");
  assert.equal(worthAskingAgain(9000), true, "the request that failed and then succeeded today sat nine seconds apart");
  assert.equal(worthAskingAgain(20000), true, "a window read as a limit and not a head start");
  assert.equal(worthAskingAgain(waitMs), false, "a call that ran the whole wait is not a bad moment worth asking again");
});

test("the retry window sits inside the wait it follows", () => {
  const windowMs = Number(given("RETRY_WINDOW_MS").match(/\d+/)[0]);
  const waitMs = Number(given("WAIT_MS").match(/\d+/)[0]);
  assert.ok(windowMs < waitMs, `a retry worth taking has to finish before our own ${waitMs}ms wait ends`);
  assert.ok(windowMs >= 5000, "a window this side of a network blip would never let the good minute back in");
});

test("the wait is long enough for the answers that really do arrive", () => {
  const waitMs = Number(given("WAIT_MS").match(/\d+/)[0]);
  // Measured on the live origin on 2026-11-19: grounded answers landed at 8.6–19.2 s and at
  // least one was still on its way when our own 25 s gave up. An apology for an answer that
  // arrives a second later is the failure the visitor sees, so the wait sits above the
  // slowest answer the provider has actually produced, with room over it.
  assert.ok(waitMs >= 30000, `a ${waitMs}ms wait cuts off an answer measured arriving after 25s`);
});

test("the retry is one retry, and it is the typed question that gets it", () => {
  const m = src.match(/const RETRY = (\d+);/);
  assert.ok(m, "no RETRY constant in js/chat.js — the number of extra tries is not named");
  assert.equal(m[1], "1", "one extra try: enough for a bad minute, not enough to hold a visitor for a minute");
  assert.equal((fnBody("askTwice").match(/askModel\(/g) || []).length, 2, "two tries at most: the first and the one worth repeating");
  assert.match(fnBody("answer"), /askTwice\(clean\)/, "a typed question goes through the retry");
});
