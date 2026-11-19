// A visitor who opens a chat on a laptop and finishes it on a phone was talking to a fresh
// assistant, because the thread lives in that browser's localStorage and localStorage does
// not cross a device. The fix is a second copy of the thread on the server under a code only
// the visitor holds: the code is the entire proof of who is asking, which is why carrying a
// chat involves no name, no email, no phone number and no sign-in, and why the studio's
// transcript archive is still write-only.
//
// Everything below is lifted out of the files the site actually loads and run with no page,
// no network and no database, so a rule that reaches for `window` or `fetch` fails the gate
// rather than passing on a copy kept alive in this file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(root, "js/chat.js"), "utf8");
const sql = readFileSync(path.join(root, "sql/supabase-schema.sql"), "utf8");

function fnBody(name, file = src) {
  const start = file.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no function ${name}()`);
  let depth = 0;
  for (let i = file.indexOf("{", start); i < file.length; i++) {
    if (file[i] === "{") depth++;
    else if (file[i] === "}" && --depth === 0) return file.slice(start, i + 1);
  }
  assert.fail(`${name}() never closed`);
}

/* A dependency is either a constant at the top of the file or another of the file's own
   rules, and a rule only runs under the gate below if it needs nothing but those. */
function given(...names) {
  return names
    .map((name) => {
      if (src.includes(`function ${name}(`)) return fnBody(name);
      const m = src.match(new RegExp(`^ +(const ${name} = [^;\\n]+);$`, "m"));
      assert.ok(m, `no constant or rule ${name} in js/chat.js`);
      return m[1];
    })
    .join("\n");
}

const FORBIDDEN = /\b(require|import|export|globalThis|process|Function|eval|window|document|fetch|localStorage|this|await|async)\b/;

function rule(name, ...deps) {
  const body = fnBody(name);
  const consts = given(...deps);
  const whole = `${consts}\n${body}`;
  const bad = whole.match(FORBIDDEN);
  assert.ok(!bad, `${name}() reaches for ${bad && bad[0]} — it cannot be evaluated as a rule`);
  return new Function(`${whole}; return ${name};`)();
}

const FULL = ["ar", "de", "es", "fr", "hi", "it", "nl", "pt", "ru", "sw", "tw", "zh"];
const dict = (code) => JSON.parse(readFileSync(path.join(root, `i18n/${code}.json`), "utf8"));

/* One database function, from its declaration to the end of its dollar-quoted body. fnBody()
   cannot be used on SQL: a plpgsql body has no braces for it to match, so it would either run
   past the function or fail to close. This reads the $$ the migration itself uses. */
function sqlFn(name) {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, `no function public.${name}() in sql/supabase-schema.sql`);
  const end = sql.indexOf("$$;", start);
  assert.ok(end > start, `${name}() in the migration has no closing dollar quote`);
  return sql.slice(start, end + 3);
}

/* ------------------------------------------------------------------ the code itself */

test("a recall code is read from anything a person could type or paste", () => {
  const codeFrom = rule("codeFrom", "CODE_ALPHABET", "CODE_LENGTH");
  assert.equal(codeFrom("K4QZ-7MBT-2XWD-PF3G"), "K4QZ7MBT2XWDPF3G", "the groups the page shows are not part of the code");
  assert.equal(codeFrom("k4qz 7mbt 2xwd pf3g"), "K4QZ7MBT2XWDPF3G", "typed lower case with spaces, still the same code");
  assert.equal(codeFrom("here is my code: K4QZ-7MBT-2XWD-PF3G, thanks"), "K4QZ7MBT2XWDPF3G",
    "a code said inside a sentence is still the code");
  assert.equal(codeFrom("SEND THAT CODE HERE"), "",
    "sixteen ordinary letters with no digit in them is a sentence, not a code");
  assert.equal(codeFrom("K4QZ-7MBT-2XWD-PF3I"), "", "I is out of the alphabet so a misread letter never resolves");
  assert.equal(codeFrom("K4QZ-7MBT-2XWD-PF3"), "", "one group short is not a code");
  assert.equal(codeFrom("K4QZ-7MBT-2XWD-PF3GQ"), "", "one character long is not a code");
  assert.equal(codeFrom("how much for 500 flyers"), "", "an ordinary question carries no code");
});

test("the code the visitor is shown is the code in groups they can read back", () => {
  const formatCode = rule("formatCode", "CODE_LENGTH");
  assert.equal(formatCode("K4QZ7MBT2XWDPF3G"), "K4QZ-7MBT-2XWD-PF3G");
  const alphabet = given("CODE_ALPHABET").match(/"([^"]+)"/)[1];
  assert.equal(alphabet.length, 32, "thirty-two signs: no I, O, 0 or 1, which a code read off a screen turns into wrong digits");
  assert.ok(!/[IO01]/.test(alphabet), `${alphabet} still holds a letter that looks like a digit`);
});

test("a minted code is the shape the server will accept, with no sign favoured", () => {
  const mint = rule("mintCode", "CODE_ALPHABET", "CODE_LENGTH");
  const signs = given("CODE_ALPHABET").match(/"([^"]+)"/)[1];
  assert.equal(mint(new Array(16).fill(0)), "A".repeat(16), "byte zero maps to the first sign, and nothing else");
  assert.equal(mint([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), signs.slice(0, 16));
  assert.equal(mint(new Array(16).fill(32)), "A".repeat(16), "32 signs into 256 byte values divides exactly, so a byte never overflows");
  const seen = {};
  for (let b = 0; b < 256; b++) seen[mint([b, ...new Array(15).fill(0)])[0]] = (seen[mint([b, ...new Array(15).fill(0)])[0]] || 0) + 1;
  assert.deepEqual(Object.values(seen).sort(), new Array(32).fill(8), "every sign is minted by exactly eight byte values");
});

/* ------------------------------------------------------------------ the turns carried */

test("a thread coming off the server is treated as data and not as an object", () => {
  const validTurns = rule("validTurns", "TURN_CAP");
  const kept = validTurns([
    { role: "user", text: "  I need   500 flyers  " },
    { role: "model", text: "Right — 500 A5 flyers." },
    { role: "assistant", text: "a role this page never writes" },
    { role: "user", text: 42 },
    null,
    "a bare string",
  ]);
  assert.deepEqual(kept.map((t) => t.role), ["user", "model"], "only the two roles the page itself files survive");
  assert.equal(kept[0].text, "I need 500 flyers", "whitespace is normalised the same way a saved turn is");
  assert.ok(validTurns([{ role: "user", text: "x".repeat(900) }])[0].text.length <= 400,
    "a turn is capped at the length this page caps its own at");
  assert.equal(validTurns(Array.from({ length: 60 }, (_, i) => ({ role: "user", text: `q${i}` }))).length, 24,
    "the window is the same 24 turns the local copy keeps");
  assert.deepEqual(validTurns("not an array"), [], "a scalar where an array should be leaves an empty thread, not a throw");
});

/* ------------------------------------------------------------------ where it hooks in */

test("a code is answered before the model is asked, and never as markup", () => {
  const body = fnBody("answer");
  const recall = body.search(/recallTurn|carryThread/);
  assert.ok(recall >= 0, "answer() has no recall branch — a code would go to the model as a question");
  assert.ok(body.indexOf("BHAssistant.route") > recall, "the code must be read before an intent or a command gets the message");
  assert.ok(body.indexOf("askTwice") > recall, "the code must be read before a model call is spent on it");
  assert.match(fnBody("offerCarry"), /addPlain\(/, "the code itself goes through textContent, never innerHTML");
  assert.doesNotMatch(src, /innerHTML\s*=\s*[^;]*(formatCode|codeLine)/, "no code path writes a recall code with innerHTML");
});

test("the copy of the thread on the server is only kept once the visitor has taken a code", () => {
  assert.match(fnBody("keep"), /mirror\(/, "what is remembered is what is mirrored, from the one place that saves");
  const body = fnBody("mirror");
  assert.match(body, /if \(!carryCode\(\)\) return;/, "with no code taken out there is nothing to mirror, and nothing leaves the device");
  assert.equal((src.match(/saveThread\(/g) || []).length, 1, "one call site, so the server copy cannot be written from two places");
  assert.match(body, /setTimeout\(/, "a turn files two remember() calls, so the mirror waits for the turn to settle");
});

test("what the studio keeps of a recall never holds the code", () => {
  // The code is the whole proof of who a carried thread belongs to, and the studio reads
  // chat_logs in the dashboard. Filing a code there would hand anyone with that access the
  // one string that unlocks a stranger's conversation — so the exchange is archived as what
  // it was (a carry asked for) and never as the characters that proved it.
  const forArchive = rule("forArchive", "CODE_ALPHABET", "CODE_LENGTH", "CARRY_LOGGED", "codeFrom");
  assert.equal(forArchive("LZZR-K8AV-NUW5-DREB"), "A chat carried to another device",
    "a code in the shape the page shows is filed as the marker, never as itself");
  assert.equal(forArchive("lzzrk8avnuw5dreb"), forArchive("LZZR-K8AV-NUW5-DREB"),
    "the same code typed bare is redacted the same way");
  assert.equal(forArchive("my code is LZZR-K8AV-NUW5-DREB, thanks"), forArchive("LZZR-K8AV-NUW5-DREB"),
    "a code said inside a sentence takes the sentence with it, because the sentence names the code");
  assert.equal(forArchive("I need 500 flyers for a launch"), "I need 500 flyers for a launch",
    "an ordinary question is archived whole, or the studio loses what visitors ask");
  const ask = given("RECALL_ASK").match(/"([^"]+)"/)[1];
  assert.equal(forArchive(ask), ask, "the chip label is not a code and stays readable in the archive");
  const body = fnBody("logExchange");
  assert.match(body, /q: forArchive\(question\)/, "the redaction sits at the one place that writes the archive");
  assert.match(body, /a: answer/, "the reply is still filed, so a carry counted is a carry understood");
});

test("the visitor has a way to ask for this that is on the screen", () => {
  assert.match(given("defaultChips"), new RegExp(`"${"Carry this chat to another device"}"`),
    "the offer is a chip, so it needs no markup on the fifty pages that load the widget");
  const ask = given("RECALL_ASK").match(/"([^"]+)"/)[1];
  assert.equal(ask, "Carry this chat to another device", "the chip label and the branch that answers it are one string");
  assert.match(fnBody("answer"), /routeAs === RECALL_ASK/, "a chip press lands on the recall branch and not on the model");
});

/* ------------------------------------------------------------------ the doors in the database */

test("the carried thread is reachable only through the two functions, never the table", () => {
  assert.match(sql, /alter table public\.chat_threads enable row level security/);
  assert.match(sql, /revoke all on table public\.chat_threads from anon, authenticated/);
  assert.equal((sql.match(/create policy[\s\S]{0,160}on public\.chat_threads/gi) || []).length, 0,
    "a policy on this table would be a second door to the same rows, and a role that can select can select every code in it");
  for (const fn of ["chat_thread_save", "chat_thread_load"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`), `no ${fn}()`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon;`),
      `${fn} is not callable by the key a visitor's browser holds`);
    const body = sqlFn(fn);
    assert.match(body, /security definer/, `${fn} must run as the owner, not as the caller`);
    assert.match(body, /set search_path = public/, `${fn} leaves its search path to whoever called it`);
    assert.match(body, /rate_take\(/, `${fn} is reachable anonymously, so it has to be counted as well as checked`);
  }
  assert.match(sql, /interval '30 days'/, "a carried chat expires on the server as well as in the browser");
  const load = sqlFn("chat_thread_load");
  assert.match(load, /chat_threads\.code = p_code/, "the load finds one row by the code and by nothing else");
  assert.match(load, /jsonb_build_object\('turns', turns, 'at', /,
    "the load hands back the thread and its age, never the code the visitor just proved they hold");
  assert.doesNotMatch(load, /select \*|returning/, "no function reads or writes a whole row");
});

test("the save function will not take what it is not shown", () => {
  const body = sqlFn("chat_thread_save");
  assert.match(body, /p_code !~ /, "a code this page would never mint is refused before it reaches the table");
  assert.match(body, /char_length\(p_code\) <> 16/, "the length is checked as well as the alphabet");
  assert.match(body, /jsonb_typeof\(p_turns\)/, "the turns are read as an array or refused");
  assert.match(body, /jsonb_array_length\(p_turns\) > 24/, "the window is enforced server-side too");
  assert.match(body, /e ->> 'role'/, "a turn is checked against the two roles this page writes");
  assert.match(body, /length\(e ->> 'text'\) > 400/, "a turn is capped at the length this page caps its own at");
  assert.ok((body.match(/raise exception/g) || []).length >= 4,
    "each refusal has to be an error the caller sees, not a silent yes that leaves the page thinking it was saved");
  assert.match(body, /on conflict \(code\) do update/, "the same code over its whole life is one row, not one row a turn");
});

test("a function that takes a rate credit is not declared read-only", () => {
  // PostgREST dispatches a stable or immutable function inside a read-only
  // transaction, and rate_take() inserts its own count row: the credit IS a write.
  // So a load that pays for itself cannot be declared read-only, and the page has
  // no way to tell that from a code nobody ever minted — it can only say "I don't
  // have a chat under that code" to every visitor who did.
  for (const fn of ["chat_thread_save", "chat_thread_load"]) {
    const whole = sqlFn(fn);
    const head = whole.slice(0, whole.indexOf("$$"));
    assert.match(whole, /rate_take\(/, `${fn} is expected to take a credit`);
    assert.doesNotMatch(head, /\b(?:stable|immutable)\b/,
      `${fn} takes a rate credit, so PostgREST must be free to open a write transaction for it`);
  }
});

/* ------------------------------------------------------------------ what the site says about it */

const NEW_LINES = [
  "Take this code. Say it to me on any other device and we pick up this chat right there.",
  "Found it — we pick up where you left off.",
  "I don't have a chat under that code. Check it and say it again.",
  "There is nothing to carry over yet. Ask me something first.",
  "Carry this chat to another device",
];

test("every line the recall layer speaks is a key in all twelve full dictionaries", () => {
  for (const code of FULL) {
    const d = dict(code);
    for (const line of NEW_LINES) {
      assert.ok(Object.prototype.hasOwnProperty.call(d, line), `${code}.json has no "${line}"`);
      assert.ok(String(d[line]).trim().length > 0, `${code}.json has "${line}" empty`);
      assert.notEqual(d[line], line, `${code}.json leaves "${line}" in English`);
    }
  }
});

test("the privacy pages tell the truth about a chat that leaves the device", () => {
  const privacy = readFileSync(path.join(root, "privacy.html"), "utf8");
  const security = readFileSync(path.join(root, "security.html"), "utf8");
  const cookie = readFileSync(path.join(root, "js/cookies.js"), "utf8");
  assert.doesNotMatch(security, /never lets it read/,
    "the archive is still write-only, but a thread copy is now readable with a code — the sentence has to say that");
  assert.match(privacy + security, /code you can (keep|take)|recall code/i,
    "the pages must name the one thing that unlocks a carried chat");
  assert.match(privacy, /another device|other device/i, "the carried-over copy must be disclosed where storage is disclosed");
  for (const text of [cookie]) {
    assert.doesNotMatch(text, /your chat with our assistant in your browser\. "\s*\+\s*"No analytics/,
      "the cookie notice can no longer claim the chat is only in the browser");
  }
  for (const code of FULL) {
    const d = dict(code);
    const stale = Object.keys(d).filter((k) => /never lets it read/.test(k));
    assert.deepEqual(stale, [], `${code}.json still keys a sentence the pages no longer carry`);
  }
});
