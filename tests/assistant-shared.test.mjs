import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const BH = require("../js/assistant-shared.js");
const intent = (text) => /^(hi|hello|contact|talk to a human)$/i.test(text) ? "LOCAL:" + text : null;

test("substantive keyword-bearing questions reach the model", () => {
  assert.equal(BH.route("Can you redesign my flyer within two days and how much would it cost?", null, intent), null);
  assert.equal(BH.route("What are modern colour ideas for a church anniversary flyer?", null, intent), null);
  assert.equal(BH.route("Suggest a sophisticated visual direction", null, intent), null);
});

test("only exact commands and explicit quick actions stay deterministic", () => {
  assert.equal(BH.route("hello", null, intent), "LOCAL:hello");
  assert.equal(BH.route("Talk to a human", "Talk to a human", intent), "LOCAL:Talk to a human");
});

test("envelope drops unsafe cards and rejects a missing answer", () => {
  const out = BH.envelope({ answer: "A useful answer", matches: [{ id: "x", name: "X", reason: "Close", url: "javascript:alert(1)" }], sources: [{ title: "Bad", url: "file:///etc/passwd" }] });
  assert.deepEqual(out.matches, []);
  assert.deepEqual(out.sources, []);
  assert.throws(() => BH.envelope({ answer: "" }), TypeError);
});

test("every page that loads chat loads the shared assistant first", () => {
  const pages = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if ([".git", ".superpowers", "node_modules", ".worktrees"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) pages.push(file);
    }
  }
  walk(path.resolve(import.meta.dirname, ".."));
  const missing = [];
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const chat = html.indexOf("js/chat.js");
    if (chat === -1) continue;
    const before = html.slice(Math.max(0, chat - 220), chat);
    if (!before.includes("assistant-shared.js")) missing.push(page);
  }
  assert.deepEqual(missing, []);
});
