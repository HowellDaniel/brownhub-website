# BrownHub Grounded Multimodal Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keyword-first, attachment-emailing chat with a model-first assistant that analyses supported media, performs grounded creative research, compares designs with BrownHub's real catalog, and returns server-built redesign estimates.

**Architecture:** A small browser-shared module owns exact-command routing and response validation; `chat.js` owns presentation and attachment state, while `accounts.js` owns multipart transport. A runtime-neutral TypeScript core owns file policy, catalog scoring, grounding extraction, and the approved estimate card. An injectable runtime-neutral request handler owns provider calls, media cleanup, retrieval, research, and final response construction; the Supabase entry point only supplies Deno environment access and starts the server. Generated catalog JSON comes only from `catalog.html`.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node.js 24 built-in test runner, Python 3 standard library, TypeScript/Deno Supabase Edge Functions, Gemini generateContent plus Files API and Google Search grounding.

**Spec:** `docs/superpowers/specs/2026-11-07-brownhub-assistant-multimodal-design.md`

## Global Constraints

- Do not change existing Paystack prices, payment flows, contact details, catalog inventory, booking behaviour, or visual design outside the chat panel.
- Gemini credentials remain only in Supabase secrets; never print, commit, or return credentials, attachment bytes, provider file URIs, or bearer tokens.
- Browser-supplied prices and catalog entries are never authoritative.
- The model never supplies numeric estimate fields; all estimates are design-only, exclude printing, and require studio confirmation.
- Approved ranges: flyer/poster GH₵200–300; social media GH₵300–450; logo/brand GH₵700–1,200; packaging GH₵500–800; complex/multi-page from GH₵1,200.
- At most three files, 10 MB each and 30 MB in total, and at most three catalog matches. Direct candidates are PNG, JPEG, WebP, PDF, DOCX, XLSX, PPTX, TXT, CSV, RTF, MP4, MOV, and WebM where the configured provider supports them.
- Public research may inform creative ideas only. BrownHub-owned data alone determines services, catalog, prices, availability, and turnaround.
- Preserve JSON text requests during rollout, plus existing chat history, retry, new-chat, voice notes, emoji, sound, dragging, and WhatsApp handoff.
- Use `T()` for new static interface strings and preserve the 12-full/27-tier dictionary coverage pattern.
- Use the explicit runtime `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node`; no dependency installation is needed. Keep server TypeScript to erasable syntax that Node 24 can import directly in tests.
- Run the standing L3 deep review before any push or deployment. A local commit is not a ship.

## File Map

- Create `js/assistant-shared.js`: exact-command routing and safe response-envelope normalization for browser and Node tests.
- Modify `js/chat.js`: model-first routing, attachment analysis, retry state, safe match/source/estimate DOM, explicit email handoff.
- Modify `js/accounts.js`: multipart assistant transport and complete-envelope return.
- Create `supabase/functions/brownhub-assistant/core.ts`: pure request/media/catalog/grounding/estimate/response logic.
- Create `supabase/functions/brownhub-assistant/handler.ts`: injectable runtime-neutral multipart compatibility, Gemini media lifecycle, analysis/research/final passes, and server-owned business data.
- Modify `supabase/functions/brownhub-assistant/index.ts`: thin Deno adapter that calls `createHandler` and starts `Deno.serve`.
- Create `tools/assistant_catalog.py`: generate or check `data/assistant-catalog.json` from `catalog.html`.
- Create `data/assistant-catalog.json`: stable public catalog IDs, metadata, and image paths.
- Create `tests/assistant-shared.test.mjs`, `tests/assistant-core.test.mjs`, `tests/assistant-transport.test.mjs`, `tests/assistant-browser.test.mjs`: dependency-free red-green tests.
- Create `tests/fixtures/`: tiny harmless image, document, Office, text, and video fixtures used locally and for live probes.
- Modify `css/style.css`: chat-only match/source/estimate/handoff presentation.
- Modify `privacy.html`, `i18n/*.json`, and HTML cache ledgers: disclosure, localization, and cache invalidation.

---

### Task 1: Generated server-owned catalog data

**Files:**
- Create: `tools/assistant_catalog.py`
- Create: `data/assistant-catalog.json`
- Test: `tests/catalog-data.test.mjs`

**Interfaces:**
- Consumes: `<article class="product-card" data-name data-cat data-catlabel data-img data-imgs data-desc>` in `catalog.html`.
- Produces: `{ version: 1, items: [{ id, name, category, categoryLabel, description, images, url }] }`; `id` is the existing gallery slug and `url` is `catalog.html?q=<encoded name>`.

- [ ] **Step 1: Write the failing drift and shape test**

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/catalog-data.test.mjs`
Expected: FAIL because `tools/assistant_catalog.py` and the generated JSON do not exist.

- [ ] **Step 3: Implement the generator**

Use the existing `galcollections.py` attribute parser pattern. Convert `&amp;` and other entities with `html.unescape`, derive slugs with the same lowercase/non-alphanumeric-hyphen rule used by gallery pages, split `data-imgs` before falling back to `data-img`, reject missing names/descriptions/images/duplicate IDs, and support both write and check modes:

```python
def main():
    check = "--check" in sys.argv
    payload = json.dumps({"version": 1, "items": items()}, ensure_ascii=False, indent=2) + "\n"
    if check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != payload:
            raise SystemExit("assistant catalog is stale; run tools/assistant_catalog.py")
    else:
        OUT.write_text(payload, encoding="utf-8")
```

- [ ] **Step 4: Generate and verify GREEN**

Run: `/usr/bin/python3 tools/assistant_catalog.py && /Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/catalog-data.test.mjs`
Expected: PASS, 29 unique items, no network access.

- [ ] **Step 5: Commit**

```bash
git add tools/assistant_catalog.py data/assistant-catalog.json tests/catalog-data.test.mjs
git commit -m "test: derive assistant catalog data from the real catalog"
```

---

### Task 2: Model-first routing and response validation

**Files:**
- Create: `js/assistant-shared.js`
- Modify: `js/chat.js:24-128,258-303`
- Modify: every HTML file referencing `js/chat.js`, to load the shared module first
- Test: `tests/assistant-shared.test.mjs`

**Interfaces:**
- Consumes: typed English-source text and the optional `routeAs` value supplied by a quick-action chip.
- Produces: `BHAssistant.route(text, routeAs, matchIntent)` returning deterministic HTML or `null`; `BHAssistant.envelope(raw)` returning `{ answer, matches, sources, estimate }` or throwing `TypeError`.

- [ ] **Step 1: Write failing routing and envelope tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
```

Use a UMD wrapper so the same file supplies `module.exports` in Node and `window.BHAssistant` in the browser.

- [ ] **Step 2: Run and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-shared.test.mjs`
Expected: FAIL with `Cannot find module '../js/assistant-shared.js'`.

- [ ] **Step 3: Implement exact routing and normalization**

```js
function route(text, routeAs, matchIntent) {
  if (routeAs) return matchIntent(routeAs);
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!/^(hi|hello|hey|good morning|good afternoon|good evening|help|what can you do|assist|options|human|agent|real person|talk to someone|speak to someone|call you|phone|email|whatsapp|contact)$/i.test(clean)) return null;
  return matchIntent(clean);
}
```

`envelope` must cap answer length at 4,000 characters, matches/sources at three, accept only relative `catalog.html?q=` match URLs and HTTPS source URLs, construct match/source nodes later with `textContent`, and validate estimate shape without recomputing its numbers in the browser.

- [ ] **Step 4: Wire chat and verify GREEN**

Add `<script src="js/assistant-shared.js?v=1" defer></script>` immediately before the existing chat script on root pages and the `../`-relative equivalent on nested pages. Replace the unconditional `matchIntent(routeAs || clean)` with `BHAssistant.route(clean, routeAs, matchIntent)`. Leave the legacy text transport unchanged until Task 3 so this commit remains independently usable. Run the shared tests plus syntax checks:

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-shared.test.mjs && /Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --check js/chat.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/assistant-shared.js js/chat.js tests/assistant-shared.test.mjs
git add '*.html' 'gallery/*.html' 'blog/*.html'
git commit -m "fix: route substantive assistant questions to the model first"
```

---

### Task 3: Multipart transport and attachment analysis

**Files:**
- Modify: `js/accounts.js:150-182`
- Modify: `js/chat.js:119-128,252-317,1312-1562`
- Test: `tests/assistant-transport.test.mjs`
- Test: `tests/assistant-browser.test.mjs`

**Interfaces:**
- Consumes: `BHAccounts.ask(question, lang, history, files)` where `files` is an array of at most three `File` objects.
- Produces: multipart fields `q`, `lang`, `h` (JSON), and repeated `files`; resolves the normalized response envelope. It never reads `BHStore.offers()` and never calls FormSubmit.

- [ ] **Step 1: Write failing transport tests**

Use `vm.runInNewContext` with a minimal window/document harness and mocked `fetch`; expose `BHAccounts.ask` through the existing configured build path. Assert:

```js
assert.equal(calls[0].url.endsWith("/functions/v1/brownhub-assistant"), true);
assert.equal(calls[0].options.headers["content-type"], undefined);
assert.equal(calls[0].options.body.get("q"), "Identify this flyer");
assert.deepEqual(calls[0].options.body.getAll("files").map((f) => f.name), ["flyer.png"]);
assert.equal(calls[0].options.body.get("prices"), null);
assert.equal(result.answer, "Analysed flyer");
```

Also test non-2xx/empty responses reject with safe errors and history is trimmed to eight valid turns of 400 characters.

- [ ] **Step 2: Run and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-transport.test.mjs`
Expected: FAIL because the current function sends JSON, accepts prices, and returns only `answer`.

- [ ] **Step 3: Implement multipart transport**

```js
function ask(question, lang, history, files) {
  if (!configured) return Promise.reject(new Error("Accounts are not configured on this site."));
  var turns = trimHistory(history);
  var body = new FormData();
  body.append("q", String(question || ""));
  body.append("lang", String(lang || "en"));
  body.append("h", JSON.stringify(turns));
  (files || []).slice(0, 3).forEach(function (file) { body.append("files", file, file.name); });
  return fetch(SB_API_URL + "/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { apikey: SB_API_KEY, Authorization: "Bearer " + SB_API_KEY },
    body: body
  }).then(readEnvelope);
}
```

Do not set multipart `Content-Type`; the browser must supply the boundary. `readEnvelope` parses JSON, rejects non-2xx or missing answers with the safe errors already used by the transport, and returns `window.BHAssistant.envelope(data)`. In `chat.js`, change `askModel(question)` to `askModel(question, files)`, remove `BHStore.offers()` collection, call `ask(question, lang, thread, files || [])`, and keep the 25-second timeout around the complete-envelope promise.

- [ ] **Step 4: Write the failing attachment-flow browser test**

Drive `chat.js` in the DOM harness with a staged PNG, mock `BHAccounts.ask` and `fetch`, submit “Identify this design and find a similar item”, and assert:

```js
assert.equal(assistantCalls, 1);
assert.equal(mailCalls, 0);
assert.equal(askArguments.files[0].name, "flyer.png");
assert.equal(document.querySelector(".chat-msg--bot").textContent.includes("analysed"), true);
assert.equal(localStorage.getItem("brownhub-chat-history").includes("data:"), false);
```

Add cases for empty-note attachment analysis, failed analysis retaining staged files, retry carrying the same files, and email occurring only after the explicit handoff button is pressed.

- [ ] **Step 5: Run browser test and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-browser.test.mjs`
Expected: FAIL with one FormSubmit call and zero assistant calls, matching the reproduced live defect.

- [ ] **Step 6: Implement attachment analysis and explicit handoff**

Route staged files through `answer(note || "Please identify and analyse the attached file, and compare it with BrownHub's catalog when relevant.", null, files)`. Keep `lastQ = { q, as, files }`; clear `picked` only after a successful response. On failure retain the files and show a safe analysis error, not “document emailed”. Move `mailFiles` behind a visible `Email these files to the studio` button that is never triggered by form submission. Extend the picker for MP4/MOV/WebM and update rejection copy to distinguish analysable formats from export-only/handoff formats.

- [ ] **Step 7: Verify GREEN**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-transport.test.mjs tests/assistant-browser.test.mjs`
Expected: PASS, including no automatic email and no bytes/data URLs in transcript or local history.

- [ ] **Step 8: Commit**

```bash
git add js/accounts.js js/chat.js tests/assistant-transport.test.mjs tests/assistant-browser.test.mjs
git commit -m "feat: analyse chat attachments instead of emailing them automatically"
```

---

### Task 4: Pure server policy, retrieval, grounding, and estimates

**Files:**
- Create: `supabase/functions/brownhub-assistant/core.ts`
- Test: `tests/assistant-core.test.mjs`

**Interfaces:**
- Produces:
  - `validateFile(name, declaredMime, bytes): { kind, mime }`
  - `validateFiles(files): ValidatedFile[]`, enforcing three files, 10 MB each and 30 MB total before provider calls
  - `selectCandidates(items, analysis, limit = 3): CatalogItem[]`
  - `groundingSources(data): { title, url }[]`
  - `buildEstimate(scope): Estimate | null`
  - `buildEnvelope(answer, analysis, candidates, sources): AssistantEnvelope`

- [ ] **Step 1: Write failing file-policy tests**

Cover valid magic bytes for PNG/JPEG/WebP/PDF/RTF, OOXML ZIP containers with both the expected declared type and matching `[Content_Types].xml` plus `word/`, `xl/` or `ppt/` entries, plain UTF-8 text/CSV, MP4/MOV/WebM signatures, empty/encrypted/disguised content, unsupported SVG/AI/PSD/archives, more than three files, and the 10 MB per-file/30 MB total byte limits. Example:

```js
import { validateFile, buildEstimate } from "../supabase/functions/brownhub-assistant/core.ts";

test("a PDF extension cannot disguise an HTML upload", () => {
  const bytes = new TextEncoder().encode("<html><script>alert(1)</script>");
  assert.throws(() => validateFile("brief.pdf", "application/pdf", bytes), /signature|supported/i);
});
```

- [ ] **Step 2: Write failing estimate and retrieval tests**

Cover every approved category and all turnaround boundaries. Critical assertions:

```js
assert.deepEqual(buildEstimate({ category: "flyer", singleItem: true, usableContent: true, dimensionsKnown: true }), {
  category: "Flyer/poster redesign", currency: "GHS", min: 200, max: 300,
  fromOnly: false, turnaround: "Likely 1–2 days", designOnly: true,
  printingExcluded: true, requiresConfirmation: true
});
assert.equal(buildEstimate({ category: "social", singleItem: false }).turnaround, "Item count requires studio review");
assert.equal(buildEstimate({ category: "logo", singleItem: true }).turnaround, "Typical logo turnaround is 2–4 days; studio confirmation required");
assert.equal(buildEstimate({ category: "complex", pagesKnown: false }).fromOnly, true);
assert.equal(buildEstimate({ category: "complex", pagesKnown: false }).max, null);
```

Retrieval tests must select real metadata candidates, cap at three, return no candidates for unrelated keywords, reject model-invented IDs, and generate stable catalog URLs. Grounding tests must accept provider HTTPS chunks and drop `javascript:`, `file:`, malformed URLs, prose-only URLs, and duplicates.

- [ ] **Step 3: Run and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-core.test.mjs`
Expected: FAIL because `core.ts` does not exist.

- [ ] **Step 4: Implement the pure core**

Keep this module free of `Deno`, environment variables, fetch, and secrets. Define the rate card once:

```ts
const RATES = {
  flyer: { label: "Flyer/poster redesign", min: 200, max: 300, fromOnly: false },
  social: { label: "Social-media redesign", min: 300, max: 450, fromOnly: false },
  logo: { label: "Logo/brand redesign", min: 700, max: 1200, fromOnly: false },
  packaging: { label: "Packaging redesign", min: 500, max: 800, fromOnly: false },
  complex: { label: "Complex/multi-page redesign", min: 1200, max: null, fromOnly: true }
} as const;
```

Tokenize retrieval keywords on whole terms, weight exact names/categories above descriptions, and require a positive deterministic score. `buildEnvelope` must ignore all model-provided numeric price fields and obtain estimate values only through `buildEstimate`.

- [ ] **Step 5: Run and verify GREEN**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-core.test.mjs`
Expected: PASS with zero warnings.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/brownhub-assistant/core.ts tests/assistant-core.test.mjs
git commit -m "feat: ground catalog matches and redesign estimates on the server"
```

---

### Task 5: Gemini media lifecycle and grounded orchestration

**Files:**
- Create: `supabase/functions/brownhub-assistant/handler.ts`
- Modify: `supabase/functions/brownhub-assistant/index.ts`
- Test: `tests/assistant-server.test.mjs`

**Interfaces:**
- Consumes: same-origin multipart requests and legacy JSON `{ q, lang, h, prices? }` requests.
- Produces: `createHandler(runtime): (request: Request) => Promise<Response>` in `handler.ts`. `runtime` injects `{ fetch, env, now, sleep }`; the handler owns its rate-limit map, uses only Web APIs, and imports the pure functions from `core.ts`.
- Provider adapter functions accept the injected fetch implementation: `uploadFile`, `waitActive`, `deleteFile`, `generate`, `fetchCatalog`, and `fetchCatalogImage`.
- `index.ts` contains no request policy to test: it calls `Deno.serve(createHandler({ fetch, env: Deno.env.get, now: Date.now, sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) }))`. Node tests exercise `createHandler` directly and never execute `Deno.serve`.

- [ ] **Step 1: Write failing server contract tests with fake provider boundaries**

Use a fake resumable Files API and deterministic generateContent responses. Assert:

- JSON text requests still return an `answer`; multipart returns the complete envelope.
- Browser `prices` cannot change the paid-package facts or estimate.
- File count/size/MIME/signature/origin/history/rate-limit boundaries are enforced before paid provider calls.
- Upload references enter model parts only after `ACTIVE`; `PROCESSING` polls with a bounded deadline and `FAILED` stops cleanly.
- Every uploaded provider file is deleted in `finally` after success, provider error, malformed JSON, and timeout.
- Office extraction is bounded by entry count, expansion ratio, uncompressed bytes, and output characters; encrypted/pathological ZIP input rejects safely.
- Catalog metadata and images are fetched only from `https://www.brownhub283.com` and paths present in the generated JSON.
- Research runs only when requested/useful, and only `groundingMetadata` becomes source cards.
- Failed research returns no invented sources; failed reference images reduce comparison confidence rather than blocking media description.
- The final model may classify scope and explain matches but cannot alter server-built numeric fields.

- [ ] **Step 2: Run and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-server.test.mjs`
Expected: FAIL because `handler.ts` and its injectable `createHandler` do not exist; do not import the current Deno entry point under Node.

- [ ] **Step 3: Implement the provider adapter and request flow**

Use the existing `generateContent` endpoint with the configured model. Upload binary media through the resumable Files API at `https://generativelanguage.googleapis.com/upload/v1beta/files`, poll the returned file resource until `ACTIVE`, and delete `v1beta/{file.name}` in `finally`. Extract bounded modern-Office text locally; never execute embedded content. Use `tools: [{ googleSearch: {} }]` only for the research pass.

The analysis JSON schema is:

```ts
{
  mediaType: string,
  visibleText: string,
  purpose: string,
  layout: string,
  colours: string,
  imagery: string,
  style: string,
  designCategory: string,
  retrievalKeywords: string[],
  missingDetails: string[],
  researchNeeded: boolean,
  researchQuery: string,
  estimate: null | {
    category: "flyer" | "social" | "logo" | "packaging" | "complex",
    singleItem: boolean,
    usableContent: boolean,
    dimensionsKnown: boolean,
    usableDieline: boolean,
    simpleArtwork: boolean,
    pagesKnown: boolean
  }
}
```

The final JSON contains only `answer` and `matches: [{ id, reason }]`; the server adds catalog names/URLs, validated research sources, and `buildEstimate(analysis.estimate)`. Replace browser price authority with server constants matching all seven payable figures already published in `js/store.js` (four design packages and three sponsored slots), retain the three existing catalog-card figures in the server brief, and leave every price unchanged. Raise creative/media output allowance to 220 words and retain concise safe visitor errors.

- [ ] **Step 4: Run and verify GREEN**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-server.test.mjs tests/assistant-core.test.mjs`
Expected: PASS; fake provider deletion counts equal upload counts on every exit path.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/brownhub-assistant/index.ts supabase/functions/brownhub-assistant/handler.ts tests/assistant-server.test.mjs
git commit -m "feat: add grounded multimodal orchestration to the assistant function"
```

---

### Task 6: Safe rich rendering, privacy, localization, and cache ledger

**Files:**
- Modify: `js/chat.js`
- Modify: `css/style.css`
- Modify: `privacy.html:117-125`
- Modify: `i18n/*.json`
- Modify: every HTML file referencing `js/chat.js` or `js/accounts.js`
- Test: `tests/assistant-browser.test.mjs`
- Test: `tests/assistant-release.test.mjs`

**Interfaces:**
- Consumes: normalized `AssistantEnvelope` from Task 2 and Task 3.
- Produces: `.chat-match`, `.chat-source`, `.chat-estimate`, and explicit `.chat-widget__mail` elements; no model HTML.

- [ ] **Step 1: Write failing safe-rendering tests**

Return an envelope whose answer and card labels contain `<img src=x onerror=...>`, `javascript:` URLs, and an estimate. Assert no injected element/event handler appears, model prose is a text node, valid catalog/source anchors use the intended URL, source anchors have `target="_blank"` and `rel="noopener noreferrer"`, and estimate text includes `GH₵200–300`, `Design only`, `Printing excluded`, and `Subject to studio confirmation`.

- [ ] **Step 2: Run and verify RED**

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-browser.test.mjs`
Expected: FAIL because current model rendering displays only a plain answer bubble.

- [ ] **Step 3: Implement dedicated DOM builders and chat-only styles**

Use `document.createElement`, `textContent`, and validated URLs only. Show match name/reason, source title, category, numeric estimate, turnaround, and all three estimate qualifiers. Style with existing chat colour/spacing tokens, 44px minimum interactive targets where practical, wrapping for 320px, logical properties for RTL, and no animation requirement under reduced motion.

- [ ] **Step 4: Add disclosure and localized interface strings**

Update privacy text to state that questions and attachments are processed by Supabase and Google Gemini for AI analysis; temporary provider files are deleted after the request subject to provider behaviour; anonymous text transcripts remain separate; attachments are emailed only after an explicit visitor action. Add a composer notice: `Files are sent for AI analysis. Please avoid unnecessary sensitive information.`

Add every new static key to all 12 full dictionaries. Add these exact core keys to all 27 tier dictionaries: `Files are sent for AI analysis. Please avoid unnecessary sensitive information.`, `We could not analyse that just now. Your files are still attached so you can retry.`, `Email these files to the studio`, `Catalog matches`, `Research sources`, `Design only`, `Printing excluded`, and `Subject to studio confirmation`. Use valid UTF-8 JSON and English fallback only where the repository's tier policy permits it.

- [ ] **Step 5: Write and run the failing release-ledger test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
const htmlFiles = () => globSync("**/*.html");

test("assistant scripts, privacy and dictionaries form one release", () => {
  const html = htmlFiles();
  for (const file of html) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("js/chat.js")) continue;
    assert.match(source, /assistant-shared\.js\?v=1/);
    assert.match(source, /chat\.js\?v=38/);
    assert.match(source, /accounts\.js\?v=21/);
  }
  for (const file of globSync("i18n/*.json")) JSON.parse(readFileSync(file, "utf8"));
});
```

Run: `/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/assistant-release.test.mjs`
Expected: FAIL before cache and dictionary updates.

- [ ] **Step 6: Bump ledgers and verify GREEN**

Preserve root-relative versus `../` paths. Update `assistant-shared.js?v=1`, `chat.js?v=38`, `accounts.js?v=21`, and the current stylesheet version consistently on every affected page. Run all Node tests and JavaScript syntax checks.

Expected: PASS, all JSON parses, no cache entry remains at `chat.js?v=37` or `accounts.js?v=20`.

- [ ] **Step 7: Commit**

```bash
git add js/chat.js css/style.css privacy.html i18n tests/assistant-browser.test.mjs tests/assistant-release.test.mjs
git add '*.html' 'gallery/*.html' 'blog/*.html'
git commit -m "feat: render grounded assistant results and disclose media processing"
```

---

### Task 7: Real-browser and live-provider verification

**Files:**
- Create: harmless fixtures under `tests/fixtures/`
- Create: scratch-only provider probe harness outside the repository
- Modify: implementation files only when a failing verification identifies a root cause

**Interfaces:**
- Consumes: the complete local implementation and the deployed probe function's server-held Gemini secret.
- Produces: recorded local browser states and live capability evidence without exposing secrets or media contents.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
/usr/bin/python3 tools/assistant_catalog.py --check
/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --test tests/*.test.mjs
/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --check js/assistant-shared.js
/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --check js/accounts.js
/Users/brownhub/tools/node-v24.22.0-darwin-arm64/bin/node --check js/chat.js
```

Expected: all tests pass, no warnings or syntax errors.

- [ ] **Step 2: Verify the real Blink integration matrix**

Serve the repository locally, mock only external provider boundaries, and use a real Chrome/Blink frame. Exercise substantive creative and redesign questions; staged PNG/JPEG/WebP, PDF, DOCX/XLSX/PPTX, TXT/CSV/RTF, and short MP4/MOV/WebM fixtures; no-match and partial-match results; research/no-research results; failed analysis and retry; new chat/restored history/follow-up; emoji, voice-note mocks, explicit email handoff, and WhatsApp handoff. Check dark/light, 320/390px, tablet/desktop, Arabic RTL, keyboard-only operation, reduced motion, accessible names, overflow, and contrast. Assert no attachment bytes, data URLs, Gemini URIs, or credentials appear in transcript requests, local history, or console output.

- [ ] **Step 3: Clear the deployment gate, then probe configured-model capabilities**

Commit the locally verified implementation and fixtures first. Ask the owner whether to run the L3 deep security review and run it on that commit set before any probe deployment; a cancelled or failed review is not clean, and an explicit skip is the only alternative. Only then deploy a scratch-only probe Edge Function in the same Supabase project so it can use the existing server-held secret. Use one harmless fixture per capability and record only HTTP status, model state, supported response metadata, and elapsed time. Probe image, PDF/document, video, Files API deletion, and Google Search grounding separately. If a capability is unsupported, keep that capability disabled and return the honest export/handoff message; do not simulate analysis. Any subsequent correction commit receives a fresh gate before redeployment.

- [ ] **Step 4: Repeat the real browser matrix after any correction**

Any defect follows systematic debugging: reproduce, identify root cause, add a failing regression test, make one fix, and rerun the complete suite plus the affected browser states. Do not claim success from DOM inspection alone.

- [ ] **Step 5: Commit any verification corrections**

```bash
git add tests supabase/functions/brownhub-assistant js css privacy.html i18n
git commit -m "test: verify assistant media, grounding and chat regressions"
```

---

### Task 8: Security gate and compatible production rollout

**Files:**
- Review: all committed changes since `fc3bc75`
- Deploy: `brownhub-assistant` Edge Function and static GitHub Pages site

**Interfaces:**
- Consumes: a clean working tree and passing local/live-provider verification.
- Produces: deployed static bytes and live assistant behavior matching the approved spec.

- [ ] **Step 1: Inspect the exact release**

Run: `git status --short && git diff fc3bc75..HEAD --stat && git log fc3bc75..HEAD --oneline`
Expected: no unrelated Luggage, Paystack, advertising, contact, price, or owner-dashboard changes.

- [ ] **Step 2: Run the standing L3 deep security gate**

Ask the owner whether to run the L3 deep security review before any push/deploy command. If approved, run it and resolve actual findings; if skipped, continue only within that explicit authorization. A cancelled or failed review is not a clean review.

- [ ] **Step 3: Deploy compatibly**

Deploy the Edge Function first, retaining legacy JSON support, then push the static site so new multipart clients have a server ready for them. Do not combine commit, security gate, push, and deployment in one shell command.

- [ ] **Step 4: Verify production, not just commits**

Confirm the deployed function and fresh production HTML/JS/CSS/catalog JSON bytes. In a real browser against `https://www.brownhub283.com`, verify:

- the sophisticated-visual-direction question is not a greeting;
- church-anniversary creative ideas are substantive and cite sources only when grounding returned them;
- flyer redesign returns exactly GH₵200–300, likely 1–2 days only with usable single-item content/dimensions, design-only, printing-excluded, and confirmation-required;
- a real harmless flyer is described and compared truthfully with the catalog;
- a harmless document and short video follow their probed supported paths;
- attachments are not automatically emailed, no file bytes/provider URIs enter logs or storage, and existing handoff/history/retry controls still work.

- [ ] **Step 5: Clean scratch and report evidence**

Stop only probe servers/browsers created for this task and remove their temporary profiles and scratch probe code. Preserve unrelated owner files and Paystack scratch state. Report test counts, live capability results, deployment commit, production verification, and any capability that remained disabled.
