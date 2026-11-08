import { test } from "node:test";
import assert from "node:assert";

// Fake runtime for handler tests
function createFakeRuntime(overrides = {}) {
  const calls = { fetch: [], delete: [] };
  
  const runtime = {
    fetch: async (url, options = {}) => {
      calls.fetch.push({ url, options });
      if (overrides.onFetch) return overrides.onFetch(url, options);
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 500 });
    },
    env: (key) => {
      if (overrides.env) return overrides.env[key];
      return undefined;
    },
    now: () => overrides.now || Date.now(),
    sleep: async (ms) => {
      if (overrides.onSleep) overrides.onSleep(ms);
    },
    _calls: calls,
  };
  
  return runtime;
}

function createPngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
}

function createJpegBytes() {
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function createMp4Bytes() {
  return new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 0, 0, 0, 0]);
}

function createWebmBytes() {
  return new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81]);
}

// ─── TEXT-ONLY REQUESTS ──────────────────────────────────────────────────────

test("JSON text request returns an answer", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url) => {
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "BrownHub is a creative studio in Accra." }] } }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.1",
    },
    body: JSON.stringify({ q: "What does BrownHub do?", lang: "en", h: [] }),
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(data.answer);
  assert.ok(data.answer.includes("BrownHub"));
});

test("Browser prices cannot change the paid-package facts", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let capturedSystemInstruction = null;
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("generateContent")) {
        const body = JSON.parse(options.body);
        capturedSystemInstruction = body.systemInstruction;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "The price is GH₵300." }] } }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.2",
    },
    body: JSON.stringify({
      q: "How much for a flyer?",
      lang: "en",
      h: [],
      prices: [{ name: "Flyer", price: 9999 }],
    }),
  });
  
  const res = await handler(req);
  await res.json();
  
  assert.ok(capturedSystemInstruction);
  const brief = capturedSystemInstruction.parts[0].text;
  assert.ok(!brief.includes("9999"), "Browser-supplied prices must not enter the brief");
});

// ─── MULTIPART WITH FILES ────────────────────────────────────────────────────

test("Multipart request returns complete envelope", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const uploadedFiles = [];
  const deletedFiles = [];
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/test-file-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload" },
          });
        }
      }
      if (url.includes("upload.example.com/upload") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        uploadedFiles.push("files/test-file-1");
        return new Response(JSON.stringify({ file: { name: "files/test-file-1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url.includes("files/test-file-1") && (!options.method || options.method === "GET")) {
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("files/test-file-1") && options.method === "DELETE") {
        deletedFiles.push("files/test-file-1");
        return new Response(null, { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  answer: "This is a flyer design.",
                  matches: [],
                  estimate: { category: "flyer", singleItem: true, usableContent: true, dimensionsKnown: true },
                }),
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "What is this?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "flyer.png");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.3" },
    body: form,
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(data.answer);
  assert.ok(Array.isArray(data.matches));
  assert.ok(Array.isArray(data.sources));
  assert.ok(data.estimate);
  assert.equal(data.estimate.category, "Flyer/poster redesign");
  assert.equal(data.estimate.min, 200);
  assert.equal(data.estimate.max, 300);
  assert.equal(uploadedFiles.length, 1);
  assert.equal(deletedFiles.length, 1, "Uploaded file must be deleted");
});

// ─── FILE VALIDATION BOUNDARIES ──────────────────────────────────────────────

test("File count limit enforced before provider calls", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let providerCalled = false;
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async () => {
      providerCalled = true;
      return new Response(JSON.stringify({ error: "should not reach" }), { status: 500 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "Analyse these");
  form.append("lang", "en");
  form.append("h", "[]");
  for (let i = 0; i < 4; i++) {
    form.append("files", new Blob([createPngBytes()], { type: "image/png" }), `file${i}.png`);
  }
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.4" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 400);
  assert.equal(providerCalled, false, "Provider must not be called for invalid input");
});

test("File size limit enforced before provider calls", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let providerCalled = false;
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async () => {
      providerCalled = true;
      return new Response(JSON.stringify({ error: "should not reach" }), { status: 500 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "Analyse this");
  form.append("lang", "en");
  form.append("h", "[]");
  const oversized = new Uint8Array(11 * 1024 * 1024);
  form.append("files", new Blob([oversized], { type: "image/png" }), "huge.png");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.5" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 400);
  assert.equal(providerCalled, false);
});

test("MIME signature mismatch rejected before provider calls", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let providerCalled = false;
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async () => {
      providerCalled = true;
      return new Response(JSON.stringify({ error: "should not reach" }), { status: 500 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "Analyse this");
  form.append("lang", "en");
  form.append("h", "[]");
  const htmlBytes = new TextEncoder().encode("<html><script>alert(1)</script>");
  form.append("files", new Blob([htmlBytes], { type: "application/pdf" }), "fake.pdf");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.6" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 400);
  assert.equal(providerCalled, false);
});

test("Video file (MP4) accepted and uploaded to provider", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const uploadedFiles = [];
  const deletedFiles = [];
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/video-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload-video" },
          });
        }
      }
      if (url.includes("upload.example.com/upload-video") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        uploadedFiles.push("files/video-1");
        return new Response(JSON.stringify({ file: { name: "files/video-1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url.includes("files/video-1") && (!options.method || options.method === "GET")) {
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "A promotional video showing product packaging." }] } }],
        }), { status: 200 });
      }
      if (url.includes("files/video-1") && options.method === "DELETE") {
        deletedFiles.push("files/video-1");
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "What do you see in this video?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createMp4Bytes()], { type: "video/mp4" }), "promo.mp4");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.7" },
    body: form,
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(data.answer);
  assert.equal(uploadedFiles.length, 1);
  assert.equal(deletedFiles.length, 1, "Uploaded video must be deleted");
});

test("Video file (WebM) accepted via magic-byte fallback", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/webm-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload-webm" },
          });
        }
      }
      if (url.includes("upload.example.com/upload-webm") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        return new Response(JSON.stringify({ file: { name: "files/webm-1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url.includes("files/webm-1") && (!options.method || options.method === "GET")) {
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "A screen recording." }] } }],
        }), { status: 200 });
      }
      if (url.includes("files/webm-1") && options.method === "DELETE") {
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "Analyse this");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createWebmBytes()], { type: "video/webm" }), "recording.webm");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.8" },
    body: form,
  });
  
  const res = await handler(req);
  assert.equal(res.status, 200);
});

// ─── FILE LIFECYCLE ──────────────────────────────────────────────────────────

test("PROCESSING state polls with bounded deadline", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let pollCount = 0;
  const deletedFiles = [];
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/test-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload" },
          });
        }
      }
      if (url.includes("upload.example.com/upload") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        return new Response(JSON.stringify({ file: { name: "files/test-1", state: "PROCESSING" } }), { status: 200 });
      }
      if (url.includes("files/test-1") && (!options.method || options.method === "GET")) {
        pollCount++;
        if (pollCount < 3) {
          return new Response(JSON.stringify({ state: "PROCESSING" }), { status: 200 });
        }
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("files/test-1") && options.method === "DELETE") {
        deletedFiles.push("files/test-1");
        return new Response(null, { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Analysis complete." }] } }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "What is this?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "test.png");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.9" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 200);
  assert.ok(pollCount >= 3, "Must poll until ACTIVE");
  assert.equal(deletedFiles.length, 1, "File must be deleted after use");
});

test("FAILED state stops cleanly and deletes file", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const deletedFiles = [];
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/test-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload" },
          });
        }
      }
      if (url.includes("upload.example.com/upload") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        return new Response(JSON.stringify({ file: { name: "files/test-1", state: "PROCESSING" } }), { status: 200 });
      }
      if (url.includes("files/test-1") && (!options.method || options.method === "GET")) {
        return new Response(JSON.stringify({ state: "FAILED" }), { status: 200 });
      }
      if (url.includes("files/test-1") && options.method === "DELETE") {
        deletedFiles.push("files/test-1");
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "What is this?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "test.png");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.10" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 500);
  assert.equal(deletedFiles.length, 1, "File must be deleted even on failure");
});

test("Provider error deletes uploaded files", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const deletedFiles = [];
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/test-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload" },
          });
        }
      }
      if (url.includes("upload.example.com/upload") && options.method === "POST" && options.headers["X-Goog-Upload-Command"] === "upload, finalize") {
        return new Response(JSON.stringify({ file: { name: "files/test-1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url.includes("files/test-1") && (!options.method || options.method === "GET")) {
        return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("files/test-1") && options.method === "DELETE") {
        deletedFiles.push("files/test-1");
        return new Response(null, { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({ error: "Provider error" }), { status: 500 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const form = new FormData();
  form.append("q", "What is this?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "test.png");
  
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.11" },
    body: form,
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 502);
  assert.equal(deletedFiles.length, 1, "File must be deleted on provider error");
});

// ─── CATALOG AND RESEARCH ────────────────────────────────────────────────────

test("Catalog metadata fetched only from brownhub283.com", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const fetchCalls = [];
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url) => {
      fetchCalls.push(url);
      if (url.includes("brownhub283.com") && url.includes("assistant-catalog.json")) {
        return new Response(JSON.stringify({
          version: 1,
          items: [
            { id: "flyer", name: "Flyer", category: "print", description: "Event flyers", url: "catalog.html?q=Flyer" },
          ],
        }), { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  answer: "This matches a flyer.",
                  keywords: ["flyer", "print"],
                  matches: [],
                }),
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.12",
    },
    body: JSON.stringify({ q: "Show me flyer examples", lang: "en", h: [] }),
  });
  
  const res = await handler(req);
  
  assert.equal(res.status, 200);
  const catalogCalls = fetchCalls.filter(u => u.includes("catalog"));
  assert.ok(catalogCalls.every(u => u.includes("brownhub283.com")), "Catalog must come from brownhub283.com only");
});

test("Research runs only when requested and uses grounding metadata", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  let researchCalled = false;
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("generateContent")) {
        const body = JSON.parse(options.body);
        if (body.tools && body.tools[0].googleSearch) {
          researchCalled = true;
          return new Response(JSON.stringify({
            candidates: [{
              content: { parts: [{ text: "Research summary" }] },
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://example.com/design-trends", title: "Design Trends 2026" } },
                ],
              },
            }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  answer: "Here are some design ideas.",
                  researchNeeded: true,
                  researchQuery: "modern flyer design trends",
                  matches: [],
                }),
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.13",
    },
    body: JSON.stringify({ q: "What are current flyer design trends?", lang: "en", h: [] }),
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(researchCalled, "Research pass must run when requested");
  assert.ok(data.sources);
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].url, "https://example.com/design-trends");
});

test("Failed research returns no invented sources", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("generateContent")) {
        const body = JSON.parse(options.body);
        if (body.tools && body.tools[0].googleSearch) {
          return new Response(JSON.stringify({ error: "Research unavailable" }), { status: 500 });
        }
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  answer: "I can answer from general knowledge.",
                  researchNeeded: true,
                  researchQuery: "design trends",
                  matches: [],
                }),
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.14",
    },
    body: JSON.stringify({ q: "What are design trends?", lang: "en", h: [] }),
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(data.sources);
  assert.equal(data.sources.length, 0, "No sources when research fails");
});

// ─── ESTIMATE INTEGRITY ──────────────────────────────────────────────────────

test("Model cannot alter server-built numeric estimate fields", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  answer: "This is a flyer redesign.",
                  estimate: {
                    category: "flyer",
                    singleItem: true,
                    usableContent: true,
                    dimensionsKnown: true,
                    min: 9999,
                    max: 99999,
                  },
                  matches: [],
                }),
              }],
            },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
  
  const handler = createHandler(runtime);
  const req = new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.15",
    },
    body: JSON.stringify({ q: "How much to redesign this flyer?", lang: "en", h: [] }),
  });
  
  const res = await handler(req);
  const data = await res.json();
  
  assert.equal(res.status, 200);
  assert.ok(data.estimate);
  assert.equal(data.estimate.min, 200, "Server must use approved rate card, not model values");
  assert.equal(data.estimate.max, 300);
  assert.equal(data.estimate.currency, "GHS");
});
