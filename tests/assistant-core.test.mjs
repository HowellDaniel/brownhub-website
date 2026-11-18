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

const { validateFile, validateFiles, selectCandidates, groundingSources, buildEstimate, buildEnvelope, parseAnalysis, sanitizeProviderError, clockBlock, isWeatherQuestion, weatherPlace, geocodeUrl, forecastUrl, wmoText, formatWeather, contextBlock } = core;

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

// ─── MODEL REPLY PARSING ─────────────────────────────────────────────────────
// The brief asks for JSON. The model wraps that JSON in a ``` fence often enough
// to be normal, and a visitor must never be handed the fence back as the answer.

test("parseAnalysis reads a fenced JSON reply into fields", () => {
  const out = parseAnalysis('```json\n{"answer":"Nice flyer.","keywords":["flyer"]}\n```');
  assert.equal(out.answer, "Nice flyer.");
  assert.deepEqual(out.keywords, ["flyer"]);
});

test("parseAnalysis reads an unfenced JSON reply into fields", () => {
  const out = parseAnalysis('{"answer":"Plain sentence.","estimate":{"category":"flyer"}}');
  assert.equal(out.answer, "Plain sentence.");
  assert.deepEqual(out.estimate, { category: "flyer" });
});

test("parseAnalysis finds JSON the model wrapped in prose", () => {
  const out = parseAnalysis('Here you go:\n{"answer":"From the catalog.","keywords":["poster"]}\nHope that helps!');
  assert.equal(out.answer, "From the catalog.");
  assert.deepEqual(out.keywords, ["poster"]);
});

test("parseAnalysis keeps a plain prose reply as the answer", () => {
  const out = parseAnalysis("BrownHub is a creative studio in Accra.");
  assert.equal(out.answer, "BrownHub is a creative studio in Accra.");
  assert.equal(out.keywords.length, 0);
  assert.equal(out.estimate, null);
  assert.equal(out.researchNeeded, false);
});

test("parseAnalysis never returns fence markers as the answer", () => {
  const out = parseAnalysis("```\nBrownHub prints its own work.\n```");
  assert.equal(out.answer, "BrownHub prints its own work.");
});

test("parseAnalysis survives a truncated JSON reply", () => {
  const out = parseAnalysis('{"answer":"This was cut of');
  assert.equal(typeof out.answer, "string");
  assert.ok(out.answer.length > 0);
  assert.equal(out.researchNeeded, false);
});

test("parseAnalysis keeps a JSON reply that has no answer field readable", () => {
  const out = parseAnalysis('{"keywords":["banner"]}');
  assert.deepEqual(out.keywords, ["banner"]);
  assert.equal(typeof out.answer, "string");
});

// ─── PROVIDER ERROR SANITISING (the live generate-400 blindness) ─────────────

test("sanitizeProviderError keeps the reason and drops the file reference", () => {
  const raw =
    '{"error":{"code":400,"message":"Unable to submit request because File [gs://files/abcdef123456] could not be read. Learn more: INVALID_ARGUMENT","status":"INVALID_ARGUMENT"}}';
  const out = sanitizeProviderError(raw);
  assert.ok(out.includes("INVALID_ARGUMENT"), out);
  assert.ok(out.includes("could not be read"), out);
  assert.ok(!out.includes("gs://"), out);
  assert.ok(!out.includes("files/abcdef123456"), out);
});

test("sanitizeProviderError drops the Files API https uri", () => {
  const out = sanitizeProviderError(
    '{"error":{"message":"File https://generativelanguage.googleapis.com/v1beta/files/xyz789 is not ACTIVE","status":"INVALID_ARGUMENT"}}'
  );
  assert.ok(!out.includes("generativelanguage"), out);
  assert.ok(!out.includes("xyz789"), out);
  assert.ok(out.includes("not ACTIVE"), out);
});

test("sanitizeProviderError never leaks the API key from an echoed body", () => {
  const out = sanitizeProviderError(
    '{"error":{"message":"API key AIzaSyTestKey1234567890abcdefghijk is invalid","status":"UNAUTHENTICATED"}}'
  );
  assert.ok(!out.includes("AIzaSy"), out);
  assert.ok(out.includes("UNAUTHENTICATED"), out);
});

test("sanitizeProviderError caps a non-JSON body", () => {
  const out = sanitizeProviderError("<html>gateway rejected the request</html> " + "z".repeat(9000));
  assert.ok(out.length <= 300, String(out.length));
});

test("sanitizeProviderError on an empty body says nothing was returned", () => {
  assert.ok(sanitizeProviderError("").length > 0);
});

// ─── A CLOCK AND LIVE WEATHER (the assistant answers the world, not just the studio) ───
// Live baseline on 2026-11-17: the deployed assistant said "I do not keep track of the date
// and time here" and "I only know BrownHub's design and print work, so I can't check the
// weather". These functions are what replaces both deflects with measured facts.

const TUE_1432 = Date.UTC(2026, 10, 17, 14, 32, 0); // Tuesday 17 November 2026, 14:32 UTC
const SUN_2105 = Date.UTC(2026, 10, 22, 21, 5, 0);  // Sunday 22 November 2026, 21:05 UTC

test("clockBlock names the date, the weekday and Ghana time from the server instant", () => {
  const out = clockBlock(TUE_1432);
  assert.match(out, /2026-11-17/, out);
  assert.match(out, /Tuesday/, out);
  assert.match(out, /14:32/, out);
  // Ghana is GMT+0 all year, so the studio clock is the UTC clock and needs no conversion.
  assert.match(out, /GMT/, out);
  assert.match(out, /Accra/, out);
});

test("clockBlock is authoritative so the model cannot answer from memory", () => {
  assert.match(clockBlock(TUE_1432), /authoritative/i, "the block must forbid a remembered date");
});

test("clockBlock rolls the weekday and the date over together", () => {
  const out = clockBlock(SUN_2105);
  assert.match(out, /Sunday/, out);
  assert.match(out, /2026-11-22/, out);
});

test("a studio day in Accra is the same calendar day in UTC", () => {
  // 23:30 UTC Sunday is still Sunday in Ghana: no date shift the model could get wrong.
  assert.match(clockBlock(Date.UTC(2026, 10, 15, 23, 30, 0)), /Sunday/);
});

test("isWeatherQuestion catches the weather phrasings a visitor actually uses", () => {
  for (const q of [
    "what is the weather in Accra today?",
    "how hot is it in Kumasi?",
    "temperature in Takoradi",
    "is it going to rain tomorrow?",
    "what's the forecast for Cape Coast?",
    "what is the weather like outside right now?",
  ]) {
    assert.ok(isWeatherQuestion(q), "should read as weather: " + q);
  }
});

test("isWeatherQuestion stays off a design job that merely mentions rain", () => {
  for (const q of [
    "can you design a logo with rain in it?",
    "I need a flyer for a cold drinks brand",
    "how much is a banner?",
    "what time is it in Ghana?",
    "do you print sun posters?",
  ]) {
    assert.ok(!isWeatherQuestion(q), "should not read as weather: " + q);
  }
});

test("weatherPlace returns the city the visitor named, without the time words", () => {
  assert.equal(weatherPlace("what is the weather in Kumasi today?"), "Kumasi");
  assert.equal(weatherPlace("how hot is it in New York right now?"), "New York");
  assert.equal(weatherPlace("forecast for Cape Coast this weekend"), "Cape Coast");
  assert.equal(weatherPlace("temperature in Accra tomorrow morning"), "Accra");
});

test("weatherPlace returns nothing when the visitor named no city", () => {
  assert.equal(weatherPlace("what is the weather today?"), "");
  assert.equal(weatherPlace("is it going to rain?"), "");
});

test("weatherPlace does not harvest a whole sentence as a place name", () => {
  const out = weatherPlace("what is the weather in Accra and can you also print me 500 flyers please");
  assert.ok(out.length <= 40, "place name must stay short, got " + out.length);
  assert.ok(!/flyer/i.test(out), "must not swallow the rest of the message: " + out);
});

test("geocodeUrl points at the key-less Open-Meteo geocoder and encodes the place", () => {
  const url = geocodeUrl("New York");
  assert.ok(url.startsWith("https://geocoding-api.open-meteo.com/v1/search?"), url);
  assert.match(url, /name=New%20York/, url);
  assert.match(url, /count=1/, url);
  assert.equal(geocodeUrl(""), "");
});

test("geocodeUrl cannot be steered onto another host by the place string", () => {
  const url = geocodeUrl("Accra?host=evil.example/x");
  assert.ok(url.startsWith("https://geocoding-api.open-meteo.com/"), url);
  assert.ok(!url.includes("evil.example/"), "must not be able to leave the geocoder origin: " + url);
});

test("forecastUrl asks for current conditions and two days of range", () => {
  const url = forecastUrl(6.6885, -1.6244);
  assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"), url);
  assert.match(url, /latitude=6\.6885/, url);
  assert.match(url, /longitude=-1\.6244/, url);
  assert.match(url, /current=/, url);
  assert.match(url, /daily=/, url);
});

test("wmoText turns a weather code into plain words and invents nothing", () => {
  assert.match(wmoText(0), /clear/i);
  assert.match(wmoText(3), /overcast|cloud/i);
  assert.match(wmoText(61), /rain/i);
  assert.match(wmoText(95), /thunder/i);
  assert.equal(wmoText(1234), "");
});

const GEO = { results: [{ name: "Kumasi", country: "Ghana", latitude: 6.6885, longitude: -1.6244 }] };
const WX = {
  current: {
    time: "2026-11-17T14:15", temperature_2m: 31.4, apparent_temperature: 36.1,
    relative_humidity_2m: 66, weather_code: 3, wind_speed_10m: 11.2,
  },
  daily: {
    time: ["2026-11-17", "2026-11-18"],
    temperature_2m_max: [32.1, 31.8],
    temperature_2m_min: [24.2, 24.0],
  },
};

test("formatWeather states the city, the measured figures and the range", () => {
  const out = formatWeather(GEO, WX);
  assert.match(out, /Kumasi, Ghana/, out);
  assert.match(out, /31\.4/, out);
  assert.match(out, /36\.1/, out);
  assert.match(out, /overcast/i, out);
  assert.match(out, /32\.1/, out);
  assert.match(out, /24\.2/, out);
  assert.match(out, /31\.8/, out);
  // The city must be printed so the model can never answer for the wrong place.
  assert.match(out, /measured/i, out);
});

test("formatWeather returns nothing when either response has no usable body", () => {
  assert.equal(formatWeather({ results: [] }, WX), "");
  assert.equal(formatWeather(GEO, {}), "");
  assert.equal(formatWeather(null, WX), "");
});

test("formatWeather stays small enough to pay for on every request", () => {
  const out = formatWeather(GEO, WX);
  assert.ok(out.length < 700, "facts block is " + out.length + " chars");
});

test("contextBlock always carries the clock and only carries weather when measured", () => {
  const withWx = contextBlock(TUE_1432, "Kumasi, Ghana: 31.4°C");
  const without = contextBlock(TUE_1432, "");
  assert.match(withWx, /TODAY FOR THIS CONVERSATION/, withWx);
  assert.match(withWx, /2026-11-17/, withWx);
  assert.match(withWx, /LIVE WEATHER/, withWx);
  assert.match(without, /TODAY FOR THIS CONVERSATION/, without);
  assert.ok(!/LIVE WEATHER/.test(without), "no invented weather header when nothing was measured");
});

// ─── PROVIDER SECRETS IN THE LOG ─────────────────────────────────────────────
// The log is the one place the assistant's own words stop being the visitor's, so a
// provider rejecting a call must be able to name the reason without naming the key.
// Gemini keys look like AIza…, and now an OpenAI key may be in play, which looks
// like sk-… — a shape the old Stripe-shaped rule (sk_live/sk_test) does not catch.

test("sanitizeProviderError hides an OpenAI key of any project shape", () => {
  const raw = JSON.stringify({
    error: { message: "Incorrect API key provided: sk-proj-AbCdEf0123456789_abcdefghIJKLMN. Find it at https://platform.openai.com/api-keys." },
  });
  const clean = sanitizeProviderError(raw);
  assert.ok(!clean.includes("sk-proj-AbCdEf0123456789_abcdefghIJKLMN"), clean);
  assert.match(clean, /\[key\]/, "the reason survives, the key does not: " + clean);
});

test("sanitizeProviderError hides a bare OpenAI secret key", () => {
  const clean = sanitizeProviderError("rejected key sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ");
  assert.ok(!clean.includes("sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"), clean);
});

test("sanitizeProviderError leaves a short sk- word alone", () => {
  const clean = sanitizeProviderError("the sk- budget is too small");
  assert.match(clean, /sk-/, "a redaction that ate ordinary words would hide the real reason");
});
