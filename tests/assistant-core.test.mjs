import test from "node:test";
import assert from "node:assert/strict";

// Task 4: Pure server policy, retrieval, grounding, and estimates
// These tests verify the runtime-neutral core module that owns:
// - File validation (magic bytes, size limits, count limits)
// - Catalog retrieval (keyword scoring, candidate selection)
// - Grounding source validation (HTTPS URLs only)
// - Estimate building (approved rate card, turnaround boundaries)
// - Response envelope construction (safe normalization)

const CORE_PATH = "../supabase/functions/brownhub-assistant/core.ts";

let core;
try {
  core = await import(CORE_PATH);
} catch (e) {
  // Module doesn't exist yet — tests will fail with import error, which is the expected RED.
  console.error("Expected RED: core.ts does not exist yet");
  throw e;
}

const { validateFile, validateFiles, selectCandidates, groundingSources, buildEstimate, buildEnvelope } = core;

// ─── FILE VALIDATION ─────────────────────────────────────────────────────────

test("validateFile accepts a valid PNG by magic bytes", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const result = validateFile("logo.png", "image/png", pngHeader);
  assert.equal(result.kind, "image");
  assert.equal(result.mime, "image/png");
});

test("validateFile accepts a valid JPEG by magic bytes", () => {
  const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  const result = validateFile("photo.jpg", "image/jpeg", jpegHeader);
  assert.equal(result.kind, "image");
  assert.equal(result.mime, "image/jpeg");
});

test("validateFile accepts a valid WebP by magic bytes", () => {
  const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const result = validateFile("graphic.webp", "image/webp", webpHeader);
  assert.equal(result.kind, "image");
  assert.equal(result.mime, "image/webp");
});

test("validateFile accepts a valid PDF by magic bytes", () => {
  const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
  const result = validateFile("document.pdf", "application/pdf", pdfHeader);
  assert.equal(result.kind, "document");
  assert.equal(result.mime, "application/pdf");
});

test("validateFile rejects a PDF extension with HTML content", () => {
  const htmlContent = new TextEncoder().encode("<html><script>alert(1)</script>");
  assert.throws(() => validateFile("brief.pdf", "application/pdf", htmlContent), /signature|supported/i);
});

test("validateFile rejects SVG as unsupported", () => {
  const svgContent = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  assert.throws(() => validateFile("icon.svg", "image/svg+xml", svgContent), /unsupported|not allowed/i);
});

test("validateFile rejects empty files", () => {
  const empty = new Uint8Array(0);
  assert.throws(() => validateFile("empty.png", "image/png", empty), /empty|too small/i);
});

test("validateFiles enforces max 3 files", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const files = [
    { name: "a.png", type: "image/png", bytes: pngHeader },
    { name: "b.png", type: "image/png", bytes: pngHeader },
    { name: "c.png", type: "image/png", bytes: pngHeader },
    { name: "d.png", type: "image/png", bytes: pngHeader },
  ];
  assert.throws(() => validateFiles(files), /too many|maximum/i);
});

test("validateFiles enforces 10 MB per file", () => {
  const largeFile = new Uint8Array(11 * 1024 * 1024);
  largeFile[0] = 0x89; largeFile[1] = 0x50; largeFile[2] = 0x4E; largeFile[3] = 0x47;
  const files = [{ name: "huge.png", type: "image/png", bytes: largeFile }];
  assert.throws(() => validateFiles(files), /too large|maximum.*10/i);
});

test("validateFiles enforces 30 MB total", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const files = [
    { name: "a.png", type: "image/png", bytes: pngHeader },
    { name: "b.png", type: "image/png", bytes: pngHeader },
    { name: "c.png", type: "image/png", bytes: new Uint8Array(29 * 1024 * 1024) },
  ];
  files[2].bytes[0] = 0x89; files[2].bytes[1] = 0x50; files[2].bytes[2] = 0x4E; files[2].bytes[3] = 0x47;
  assert.throws(() => validateFiles(files), /total.*30|exceeds/i);
});

// ─── CATALOG RETRIEVAL ───────────────────────────────────────────────────────

test("selectCandidates returns real catalog items for matching keywords", () => {
  const catalog = [
    { id: "flyer", name: "Flyer", category: "print", description: "Event flyers designed and printed" },
    { id: "logo", name: "Logo Design", category: "branding", description: "Logo concepts and variations" },
  ];
  const analysis = { keywords: ["flyer", "event", "print"] };
  const candidates = selectCandidates(catalog, analysis);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.length <= 3);
  assert.equal(candidates[0].id, "flyer");
});

test("selectCandidates caps at 3 matches", () => {
  const catalog = Array.from({ length: 10 }, (_, i) => ({
    id: `item-${i}`, name: `Item ${i}`, category: "print", description: "Flyer poster banner"
  }));
  const analysis = { keywords: ["flyer", "poster", "banner"] };
  const candidates = selectCandidates(catalog, analysis, 3);
  assert.ok(candidates.length <= 3);
});

test("selectCandidates returns empty for unrelated keywords", () => {
  const catalog = [
    { id: "flyer", name: "Flyer", category: "print", description: "Event flyers" },
  ];
  const analysis = { keywords: ["website", "software", "app"] };
  const candidates = selectCandidates(catalog, analysis);
  assert.equal(candidates.length, 0);
});

test("selectCandidates rejects model-invented IDs", () => {
  const catalog = [
    { id: "flyer", name: "Flyer", category: "print", description: "Event flyers" },
  ];
  const analysis = { keywords: ["flyer"], inventedIds: ["nonexistent-item"] };
  const candidates = selectCandidates(catalog, analysis);
  for (const c of candidates) {
    assert.notEqual(c.id, "nonexistent-item");
  }
});

test("selectCandidates generates stable catalog URLs", () => {
  const catalog = [
    { id: "flyer", name: "Flyer", category: "print", description: "Event flyers", url: "catalog.html?q=Flyer" },
  ];
  const analysis = { keywords: ["flyer"] };
  const candidates = selectCandidates(catalog, analysis);
  assert.ok(candidates[0].url.startsWith("catalog.html?q="));
});

// ─── GROUNDING SOURCE VALIDATION ─────────────────────────────────────────────

test("groundingSources accepts valid HTTPS URLs", () => {
  const data = {
    groundingChunks: [
      { web: { uri: "https://example.com/design-trends", title: "Design Trends 2026" } },
    ],
  };
  const sources = groundingSources(data);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://example.com/design-trends");
  assert.equal(sources[0].title, "Design Trends 2026");
});

test("groundingSources rejects javascript: URLs", () => {
  const data = {
    groundingChunks: [
      { web: { uri: "javascript:alert(1)", title: "Bad" } },
    ],
  };
  const sources = groundingSources(data);
  assert.equal(sources.length, 0);
});

test("groundingSources rejects file: URLs", () => {
  const data = {
    groundingChunks: [
      { web: { uri: "file:///etc/passwd", title: "Bad" } },
    ],
  };
  const sources = groundingSources(data);
  assert.equal(sources.length, 0);
});

test("groundingSources rejects malformed URLs", () => {
  const data = {
    groundingChunks: [
      { web: { uri: "not-a-url", title: "Bad" } },
    ],
  };
  const sources = groundingSources(data);
  assert.equal(sources.length, 0);
});

test("groundingSources drops duplicates", () => {
  const data = {
    groundingChunks: [
      { web: { uri: "https://example.com/a", title: "A" } },
      { web: { uri: "https://example.com/a", title: "A Duplicate" } },
    ],
  };
  const sources = groundingSources(data);
  assert.equal(sources.length, 1);
});

// ─── ESTIMATE BUILDING ───────────────────────────────────────────────────────

test("buildEstimate returns flyer rate for single item with usable content", () => {
  const estimate = buildEstimate({ category: "flyer", singleItem: true, usableContent: true, dimensionsKnown: true });
  assert.deepEqual(estimate, {
    category: "Flyer/poster redesign",
    currency: "GHS",
    min: 200,
    max: 300,
    fromOnly: false,
    turnaround: "Likely 1–2 days",
    designOnly: true,
    printingExcluded: true,
    requiresConfirmation: true,
  });
});

test("buildEstimate returns social rate with item count caveat", () => {
  const estimate = buildEstimate({ category: "social", singleItem: false });
  assert.equal(estimate.turnaround, "Item count requires studio review");
  assert.equal(estimate.min, 300);
  assert.equal(estimate.max, 450);
});

test("buildEstimate returns logo rate with typical turnaround", () => {
  const estimate = buildEstimate({ category: "logo", singleItem: true });
  assert.equal(estimate.turnaround, "Typical logo turnaround is 2–4 days; studio confirmation required");
  assert.equal(estimate.min, 700);
  assert.equal(estimate.max, 1200);
});

test("buildEstimate returns packaging rate for simple artwork", () => {
  const estimate = buildEstimate({ category: "packaging", singleItem: true, usableContent: true });
  assert.equal(estimate.min, 500);
  assert.equal(estimate.max, 800);
});

test("buildEstimate returns complex rate with fromOnly for unknown pages", () => {
  const estimate = buildEstimate({ category: "complex", pagesKnown: false });
  assert.equal(estimate.fromOnly, true);
  assert.equal(estimate.max, null);
  assert.equal(estimate.min, 1200);
});

test("buildEstimate returns null for unknown category", () => {
  const estimate = buildEstimate({ category: "unknown" });
  assert.equal(estimate, null);
});

// ─── ENVELOPE CONSTRUCTION ───────────────────────────────────────────────────

test("buildEnvelope constructs a safe response envelope", () => {
  const answer = "Here is the analysis.";
  const analysis = { type: "flyer", keywords: ["event", "church"] };
  const candidates = [{ id: "flyer", name: "Flyer", reason: "Close match", url: "catalog.html?q=Flyer" }];
  const sources = [{ title: "Design Trends", url: "https://example.com/trends" }];
  const envelope = buildEnvelope(answer, analysis, candidates, sources);
  assert.equal(envelope.answer, answer);
  assert.equal(envelope.matches.length, 1);
  assert.equal(envelope.sources.length, 1);
  assert.equal(envelope.estimate, null);
});

test("buildEnvelope drops unsafe match URLs", () => {
  const candidates = [{ id: "x", name: "X", reason: "Close", url: "javascript:alert(1)" }];
  const envelope = buildEnvelope("Answer", {}, candidates, []);
  assert.equal(envelope.matches.length, 0);
});

test("buildEnvelope drops unsafe source URLs", () => {
  const sources = [{ title: "Bad", url: "file:///etc/passwd" }];
  const envelope = buildEnvelope("Answer", {}, [], sources);
  assert.equal(envelope.sources.length, 0);
});

test("buildEnvelope caps answer length at 4000 characters", () => {
  const longAnswer = "A".repeat(5000);
  const envelope = buildEnvelope(longAnswer, {}, [], []);
  assert.ok(envelope.answer.length <= 4000);
});

test("buildEnvelope caps matches at 3", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    id: `item-${i}`, name: `Item ${i}`, reason: "Match", url: `catalog.html?q=Item${i}`
  }));
  const envelope = buildEnvelope("Answer", {}, candidates, []);
  assert.ok(envelope.matches.length <= 3);
});

test("buildEnvelope caps sources at 3", () => {
  const sources = Array.from({ length: 10 }, (_, i) => ({
    title: `Source ${i}`, url: `https://example.com/${i}`
  }));
  const envelope = buildEnvelope("Answer", {}, [], sources);
  assert.ok(envelope.sources.length <= 3);
});
