import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

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

// ─── FENCED MODEL REPLY (the live defect) ────────────────────────────────────
// Version 48 handed visitors the model's raw ```json fence as the answer and
// lost matches, sources and the server-built estimate with it.

test("A fenced JSON reply still yields a prose answer, matches and an estimate", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");

  const fenced = [
    "```json",
    JSON.stringify({
      answer: "Our Flyer Design Package costs GH₵300.",
      keywords: ["flyer"],
      researchNeeded: false,
      estimate: { category: "flyer", singleItem: true, usableContent: true, dimensionsKnown: true },
      matches: [],
    }),
    "```",
  ].join("\n");

  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url) => {
      if (url.includes("assistant-catalog.json")) {
        return new Response(JSON.stringify({
          version: 1,
          items: [{ id: "flyer", name: "Flyer", category: "print", description: "Event flyers" }],
        }), { status: 200 });
      }
      if (url.includes("generateContent")) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: fenced }] } }],
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
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.16",
    },
    body: JSON.stringify({ q: "How much to redesign this flyer?", lang: "en", h: [] }),
  });

  const res = await handler(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.answer, "Our Flyer Design Package costs GH₵300.");
  assert.ok(!data.answer.includes("```"), "Fence markers must never reach the visitor");
  assert.ok(!data.answer.includes('"answer"'), "Raw JSON must never reach the visitor");
  assert.equal(data.matches.length, 1, "Keywords must still retrieve catalog matches");
  assert.ok(data.estimate, "Estimate must still be built from the rate card");
  assert.equal(data.estimate.min, 200);
  assert.equal(data.estimate.max, 300);
  assert.equal(data.estimate.turnaround, "Likely 1–2 days");
});

// ─── PROVIDER FILE URI (the live generate-400 defect) ────────────────────────

function mockFilesApi(uploaded, finalizeBody, generateContent) {
  return async (url, options) => {
    if (url.includes("upload/v1beta/files") && options.method === "POST") {
      return new Response(JSON.stringify({ file: { name: "files/real-9" } }), {
        status: 200,
        headers: { "X-Goog-Upload-URL": "https://upload.example.com/u9" },
      });
    }
    if (url === "https://upload.example.com/u9") {
      return new Response(JSON.stringify(finalizeBody), { status: 200 });
    }
    if (url.includes("v1beta/files/real-9") && (!options.method || options.method === "GET")) {
      return new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
    }
    if (url.includes("v1beta/files/real-9") && options.method === "DELETE") {
      uploaded.deleted = true;
      return new Response(null, { status: 200 });
    }
    if (url.includes("generateContent")) {
      uploaded.body = JSON.parse(options.body);
      return generateContent;
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
}

function attachedFileRequest() {
  const form = new FormData();
  form.append("q", "What is this flyer?");
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "flyer.png");
  return new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": "10.0.0.9" },
    body: form,
  });
}

const okAnswer = () =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: "It is a flyer." }) }] } }],
    }),
    { status: 200 }
  );

test("the attached file reaches the model by the URI the Files API returned", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const captured = {};
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: mockFilesApi(
      captured,
      { file: { name: "files/real-9", uri: "https://generativelanguage.googleapis.com/v1beta/files/real-9", state: "PROCESSING" } },
      okAnswer()
    ),
  });
  const res = await createHandler(runtime)(attachedFileRequest());
  assert.equal(res.status, 200);
  const part = captured.body.contents[captured.body.contents.length - 1].parts.find((p) => p.fileData);
  assert.ok(part, "the generateContent request must carry a fileData part");
  assert.equal(part.fileData.fileUri, "https://generativelanguage.googleapis.com/v1beta/files/real-9");
  assert.ok(!JSON.stringify(captured.body).includes("gs://"), "gs:// URIs are for model output, not uploads");
  assert.equal(captured.deleted, true, "the uploaded file must still be deleted by its name");
});

test("a provider rejection reaches the log as its reason, with no file reference", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const captured = {};
  const rejected = new Response(
    JSON.stringify({
      error: {
        code: 400,
        message:
          "Unable to submit request because File [gs://files/real-9] could not be read. Learn more: INVALID_ARGUMENT",
        status: "INVALID_ARGUMENT",
      },
    }),
    { status: 400 }
  );
  const runtime = createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: mockFilesApi(
      captured,
      { file: { name: "files/real-9", uri: "https://generativelanguage.googleapis.com/v1beta/files/real-9", state: "PROCESSING" } },
      rejected
    ),
  });
  const logs = [];
  const realError = console.error;
  console.error = (...args) => { logs.push(args.join(" ")); };
  let res, data;
  try {
    res = await createHandler(runtime)(attachedFileRequest());
    data = await res.json();
  } finally {
    console.error = realError;
  }
  const text = logs.join(" ");
  assert.ok(text.includes("INVALID_ARGUMENT"), "the provider reason must be logged: " + text);
  assert.ok(!text.includes("gs://"), "no provider file URI in the log: " + text);
  assert.ok(!text.includes("files/real-9"), "no provider file reference in the log: " + text);
  assert.equal(res.status, 500);
  assert.equal(data.error, "The assistant could not process that.");
});

// ─── TALKING LIKE A PERSON ───────────────────────────────────────────────────

function briefFrom(source) {
  const text = readFileSync(new URL(source, import.meta.url), "utf8");
  const match = text.match(/const BRIEF = `([\s\S]*?)`;/);
  assert.ok(match, "BRIEF literal found in " + source);
  return match[1];
}

function textRequest(q, extra = {}, ip = "10.0.9.9") {
  return new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://www.brownhub283.com", "cf-connecting-ip": ip,
    },
    body: JSON.stringify({ q, lang: "en", h: [], ...extra }),
  });
}

function speakingRuntime(capture) {
  return createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    onFetch: async (url, options) => {
      if (url.includes("generateContent")) {
        const body = JSON.parse(options.body);
        capture.brief = body.systemInstruction.parts[0].text;
        capture.asked = true;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            answer: "I'm doing well, thank you for asking. What can I help you with today?",
            keywords: [], matches: [], estimate: null,
          }) }] } }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
}

test("the deployed brief and the tested brief cannot drift apart", () => {
  const live = briefFrom("../supabase/functions/brownhub-assistant/index.ts");
  const tested = briefFrom("../supabase/functions/brownhub-assistant/handler.ts");
  assert.equal(tested, live, "handler.ts and index.ts must carry the same brief byte for byte");
});

test("the brief makes small talk answerable instead of off-limits", async () => {
  const capture = {};
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  await createHandler(speakingRuntime(capture))(textRequest("how are you doing"));

  assert.ok(capture.asked, "a phatic turn must reach the model, not a canned deflect");
  assert.ok(/TALK LIKE A PERSON FIRST/.test(capture.brief), "the brief must teach a conversational voice");
  assert.ok(/how are you/i.test(capture.brief), "the brief must name the how-are-you case");
  assert.ok(!/Answer only about BrownHub/.test(capture.brief), "scope must govern facts, not feelings");
});

test("the brief reads emoji and keeps them out of the catalog", async () => {
  const capture = {};
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  await createHandler(speakingRuntime(capture))(textRequest("😀"));

  const brief = capture.brief;
  assert.ok(/😞/.test(brief) && /🙏/.test(brief), "the brief must show emoji it expects to be sent");
  assert.ok(/emoji/i.test(brief), "the brief must tell the model to read emoji");
  assert.match(brief, /keywords as an empty array/, "a social turn must not pull in a catalog card");
  assert.match(brief, /at most one emoji/, "the model may mirror one emoji, never more");
});

test("a message that is only an emoji still gets an answer", async () => {
  const capture = {};
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const res = await createHandler(speakingRuntime(capture))(textRequest("☺"));
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.ok(capture.asked, "one code point is a message, not a typo");
  assert.deepEqual(data.matches, [], "thanks must not attach catalog cards");
  assert.equal(data.estimate, null);
});

test("blank text with no file is still refused", async () => {
  const capture = {};
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const res = await createHandler(speakingRuntime(capture))(textRequest("   "));

  assert.equal(res.status, 400);
  assert.ok(!capture.asked, "nothing to answer must not cost a model call");
});

// ─── A CLOCK AND LIVE WEATHER MEASURED BY THE SERVER ─────────────────────────
// The assistant used to answer "I do not keep track of the date here" and "I cannot
// check the weather for you". Both were true of the brief and false of the server:
// the server holds the instant and can read a weather station. The fix is to hand
// both over inside the one call it already makes — a live answer costs about twelve
// of the browser's twenty-five seconds, so there is no second call to spend.

const WX_NOW = Date.UTC(2026, 10, 17, 14, 32, 0); // Tuesday 17 November 2026, 14:32 GMT

const GEO_KUMASI = { results: [{ name: "Kumasi", country: "Ghana", latitude: 6.6885, longitude: -1.6244 }] };
const WX_KUMASI = {
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

function worldRuntime(capture, opts = {}) {
  return createFakeRuntime({
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    now: WX_NOW,
    onFetch: async (url, options) => {
      if (url.includes("geocoding-api.open-meteo.com")) {
        capture.geo = (capture.geo || []).concat(url);
        if (opts.geoDown) return new Response("unavailable", { status: 503 });
        return new Response(JSON.stringify(GEO_KUMASI), { status: 200 });
      }
      if (url.includes("api.open-meteo.com")) {
        capture.wx = (capture.wx || []).concat(url);
        if (opts.wxDown) return new Response("unavailable", { status: 503 });
        return new Response(JSON.stringify(WX_KUMASI), { status: 200 });
      }
      if (url.includes("assistant-catalog.json")) {
        return new Response(JSON.stringify({
          version: 1,
          items: [{ id: "flyer", name: "Flyer", category: "print", description: "Event flyers", url: "catalog.html?q=Flyer" }],
        }), { status: 200 });
      }
      if (url.includes("upload/v1beta/files") && options.method === "POST") {
        if (options.headers["X-Goog-Upload-Command"] === "start") {
          return new Response(JSON.stringify({ file: { name: "files/media-1" } }), {
            status: 200,
            headers: { "X-Goog-Upload-URL": "https://upload.example.com/upload" },
          });
        }
      }
      if (url.includes("upload.example.com/upload")) {
        return new Response(JSON.stringify({ file: { name: "files/media-1", state: "ACTIVE" } }), { status: 200 });
      }
      if (url.includes("files/media-1")) {
        return options.method === "DELETE"
          ? new Response(null, { status: 200 })
          : new Response(JSON.stringify({ state: "ACTIVE" }), { status: 200 });
      }
      if (url.includes("generateContent")) {
        const body = JSON.parse(options.body);
        capture.model = (capture.model || []).concat(body);
        if (body.tools && opts.searchDown) {
          return new Response(JSON.stringify({ error: { code: 503, message: "grounding unavailable" } }), { status: 503 });
        }
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({ answer: opts.answer || "Noted.", keywords: opts.keywords || [] }) }],
            },
            ...(opts.sources
              ? { groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/design-trends", title: "Design Trends 2026" } }] } }
              : {}),
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    },
  });
}

function wire(capture) {
  return capture.model[0].systemInstruction.parts[0].text;
}

function attachedRequest(q, ip) {
  const form = new FormData();
  form.append("q", q);
  form.append("lang", "en");
  form.append("h", "[]");
  form.append("files", new Blob([createPngBytes()], { type: "image/png" }), "sky.png");
  return new Request("https://example.com/functions/v1/brownhub-assistant", {
    method: "POST",
    headers: { "origin": "https://www.brownhub283.com", "cf-connecting-ip": ip },
    body: form,
  });
}

test("an ordinary answer carries the server clock and never opens the weather rail", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  const res = await createHandler(worldRuntime(capture))(textRequest("What does BrownHub do?", {}, "10.0.11.1"));
  const data = await res.json();

  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(capture.model.length, 1, "the clock must not cost a second model call");
  const brief = wire(capture);
  assert.match(brief, /TODAY FOR THIS CONVERSATION/, brief);
  assert.match(brief, /2026-11-17/, brief);
  assert.match(brief, /Tuesday/, brief);
  assert.match(brief, /14:32 GMT/, brief);
  assert.ok(!capture.geo, "a question that is not about weather must not hit the geocoder");
  assert.ok(!capture.wx, "a question that is not about weather must not hit the forecaster");
});

test("a weather question is answered from a station reading, in the same one call", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  const res = await createHandler(worldRuntime(capture, { answer: "It is 31.4°C in Kumasi and overcast." }))(
    textRequest("what is the weather in Kumasi right now?", {}, "10.0.11.2")
  );

  assert.equal(res.status, 200);
  assert.equal(capture.model.length, 1, "measured facts ride the one call, they are not a second one");
  assert.match(capture.geo[0], /name=Kumasi/, capture.geo[0]);
  assert.match(capture.wx[0], /latitude=6\.6885/, capture.wx[0]);
  const brief = wire(capture);
  assert.match(brief, /LIVE WEATHER READ BY THE SERVER/, brief);
  assert.match(brief, /Kumasi, Ghana/, brief);
  assert.match(brief, /31\.4/, brief);
  assert.match(brief, /32\.1/, brief);
});

test("a weather question that names no city reads the studio's own town", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  await createHandler(worldRuntime(capture))(textRequest("is it going to rain today?", {}, "10.0.11.3"));

  assert.match(capture.geo[0], /name=Accra/, capture.geo[0]);
  assert.match(wire(capture), /LIVE WEATHER READ BY THE SERVER/, wire(capture));
});

test("a dead weather rail gives no figures at all rather than invented ones", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");

  for (const [opts, ip] of [[{ geoDown: true }, "10.0.11.4"], [{ wxDown: true }, "10.0.11.5"]]) {
    const capture = {};
    const res = await createHandler(worldRuntime(capture, { ...opts, answer: "I cannot read the sky right now." }))(
      textRequest("what is the temperature in Kumasi?", {}, ip)
    );
    const data = await res.json();

    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(capture.model.length, 1, "a failed rail must not stall the answer");
    assert.ok(!/LIVE WEATHER READ BY THE SERVER/.test(wire(capture)), "no weather header without measured numbers");
    assert.match(wire(capture), /TODAY FOR THIS CONVERSATION/, "the clock still ships");
    assert.match(data.answer, /cannot read the sky/);
  }
});

test("the clock block is not the visitor's clock", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  await createHandler(worldRuntime(capture))(textRequest("what time is it in Accra?", {}, "10.0.11.6"));

  // A visitor's own timezone header must not decide the answer: the studio's hours are Accra's.
  assert.match(wire(capture), /Time in Accra: 14:32 GMT/);
});

test("the brief answers the world but still cannot invent a studio fact", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  await createHandler(worldRuntime(capture))(textRequest("What does BrownHub do?", {}, "10.0.11.7"));

  const brief = wire(capture);
  assert.match(brief, /Answer the world, not only the studio\./, "the brief must open general questions up");
  assert.match(brief, /Never invent a price/, "the money fence stays");
  assert.ok(!/Only a genuinely different subject/.test(brief), "the old deflect-the-world rule must be gone");
  assert.ok(!/Answer only about BrownHub/.test(brief), "scope must govern facts, not feelings");
});

test("the answer and its sources now come from one call", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  const res = await createHandler(worldRuntime(capture, {
    answer: "Current flyer trends lean on big type and one strong image.",
    keywords: ["flyer"],
    sources: true,
  }))(textRequest("What are current flyer design trends?", { researchNeeded: true, researchQuery: "flyer trends 2026" }, "10.0.11.8"));
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(capture.model.length, 1, "the second research call is retired");
  assert.ok(capture.model[0].tools && capture.model[0].tools[0].googleSearch, "the one call must carry live search");
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].url, "https://example.com/design-trends");
  assert.match(data.answer, /big type/);
});

test("if the provider refuses live search, the assistant retries once without it", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  const res = await createHandler(worldRuntime(capture, { answer: "The capital of Japan is Tokyo.", searchDown: true }))(
    textRequest("What is the capital of Japan?", {}, "10.0.11.9")
  );
  const data = await res.json();

  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(capture.model.length, 2, "one search attempt and one plain retry, no more");
  assert.ok(capture.model[0].tools, "the first attempt asked for live search");
  assert.ok(!capture.model[1].tools, "the retry must not ask again");
  assert.match(data.answer, /Tokyo/);
  assert.deepEqual(data.sources, []);
});

test("an attached picture keeps its search off", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  const res = await createHandler(worldRuntime(capture, { answer: "This is a flyer design." }))(
    attachedRequest("What is this?", "10.0.11.10")
  );

  assert.equal(res.status, 200);
  assert.equal(capture.model.length, 1, "media already costs the most time; it must not add a search round");
  assert.ok(!capture.model[0].tools, "the media call goes without live search");
  assert.match(wire(capture), /TODAY FOR THIS CONVERSATION/, "it still carries the clock");
});

test("the clock is tied to the studio's own opening hours", async () => {
  const { createHandler } = await import("../supabase/functions/brownhub-assistant/handler.ts");
  const capture = {};
  await createHandler(worldRuntime(capture))(textRequest("are you open right now?", {}, "10.0.11.11"));

  const brief = wire(capture);
  assert.match(brief, /Opening hours Monday to Saturday/, "the hours stay the studio's own facts");
  assert.match(brief, /Tuesday/, "the weekday the hours are judged against comes from the server");
  assert.match(brief, /whether the studio is open/i, "the brief must tell it to decide open or closed from the clock block");
});
