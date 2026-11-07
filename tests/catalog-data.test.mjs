import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("catalog export is current and every item has a stable public target", () => {
  execFileSync("/usr/bin/python3", ["tools/assistant_catalog.py", "--check"]);
  const data = JSON.parse(readFileSync("data/assistant-catalog.json", "utf8"));
  assert.equal(data.version, 1);
  assert.equal(data.items.length, 29);
  const ids = new Set(data.items.map((item) => item.id));
  assert.equal(ids.size, data.items.length);
  for (const item of data.items) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(item.name && item.description && item.images.length);
    assert.ok(item.images.every((path) => /^images\/catalog\/[a-z0-9./_-]+$/i.test(path)));
    assert.equal(item.url, "catalog.html?q=" + encodeURIComponent(item.name));
  }
});
