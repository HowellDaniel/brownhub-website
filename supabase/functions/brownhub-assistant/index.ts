// BrownHub assistant — a question-answering proxy for the site's chat panel.
//
// Why this exists at all: the browser must never hold a model key. js/chat.js
// answers the common questions itself from its keyword intents, and only when
// none of them match does it POST here. This file is the only place the Gemini
// key is ever seen, and it lives in Supabase's secret store, not in this file.
//
// LIVE since 2026-09-25 at /functions/v1/brownhub-assistant, verified end to end
// through the site's own chat panel. Redeploying after an edit to this file:
//   1. Supabase -> Edge Functions -> the brownhub-assistant row -> Code.
//   2. Select all in the editor, paste this file, Deploy updates.
//   3. Edge Functions -> Secrets -> GEMINI_API_KEY is already stored; only
//      GEMINI_MODEL is optional, and it defaults to gemini-3.5-flash-lite.
// "Verify JWT" is left ON and works, because the site sends the publishable key,
// which Supabase accepts for it. The slug cannot be renamed later: it is taken
// from the name field on the create page, before anything is typed into it.

// ─── PURE SERVER POLICY (core.ts) ─────────────────────────────────────────────

const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const MAGIC: Record<string, { offset: number; bytes: number[]; kind: string }> = {
  "image/png": { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], kind: "image" },
  "image/jpeg": { offset: 0, bytes: [0xFF, 0xD8, 0xFF], kind: "image" },
  "image/webp": { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], kind: "image" },
  "image/gif": { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38], kind: "image" },
  "application/pdf": { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2D], kind: "document" },
  "video/mp4": { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70], kind: "video" },
  "video/quicktime": { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70], kind: "video" },
  "video/webm": { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3], kind: "video" },
  "video/x-matroska": { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3], kind: "video" },
  "video/avi": { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], kind: "video" },
  "video/3gpp": { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70], kind: "video" },
  "video/mpeg": { offset: 0, bytes: [0x00, 0x00, 0x01, 0xBA], kind: "video" },
};

function matchesMagic(declaredMime: string, bytes: Uint8Array): boolean {
  const spec = MAGIC[declaredMime];
  if (!spec) return false;
  if (bytes.length < spec.offset + spec.bytes.length) return false;
  for (let i = 0; i < spec.bytes.length; i++) {
    if (bytes[spec.offset + i] !== spec.bytes[i]) return false;
  }
  if (declaredMime === "image/webp") {
    return bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return true;
}

function validateFile(name: string, declaredMime: string, bytes: Uint8Array): { kind: string; mime: string } {
  if (!bytes || bytes.length === 0) throw new Error("File is empty");
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`File exceeds maximum 10 MB`);
  
  const lower = name.toLowerCase();
  const unsupported = [".svg", ".ai", ".psd", ".eps", ".zip", ".rar", ".7z", ".tar", ".gz"];
  for (const ext of unsupported) {
    if (lower.endsWith(ext)) throw new Error(`File type ${ext} is unsupported`);
  }
  
  if (MAGIC[declaredMime] && !matchesMagic(declaredMime, bytes)) {
    throw new Error("File signature does not match declared type");
  }
  
  const spec = MAGIC[declaredMime];
  if (spec) return { kind: spec.kind, mime: declaredMime };
  if (declaredMime.startsWith("video/")) return { kind: "video", mime: declaredMime };
  if (declaredMime.startsWith("image/")) return { kind: "image", mime: declaredMime };
  return { kind: "document", mime: declaredMime };
}

function validateFiles(files: { name: string; type: string; bytes: Uint8Array }[]): { kind: string; mime: string; name: string; bytes: Uint8Array }[] {
  if (files.length > MAX_FILES) throw new Error(`Too many files: maximum ${MAX_FILES}`);
  
  let totalBytes = 0;
  const validated = [];
  for (const f of files) {
    if (f.bytes.length > MAX_FILE_BYTES) throw new Error(`File ${f.name} exceeds maximum 10 MB`);
    totalBytes += f.bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`Total size exceeds maximum 30 MB`);
    const v = validateFile(f.name, f.type, f.bytes);
    validated.push({ ...v, name: f.name, bytes: f.bytes });
  }
  return validated;
}

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  url?: string;
}

interface Analysis {
  keywords?: string[];
  inventedIds?: string[];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
}

function score(item: CatalogItem, keywords: string[]): number {
  const tokens = new Set([
    ...tokenize(item.name),
    ...tokenize(item.category),
    ...tokenize(item.description),
  ]);
  let score = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (item.name.toLowerCase().includes(k)) score += 3;
    else if (item.category.toLowerCase() === k) score += 2;
    else if (tokens.has(k)) score += 1;
  }
  return score;
}

function selectCandidates(catalog: CatalogItem[], analysis: Analysis, limit = 3): (CatalogItem & { reason: string })[] {
  const keywords = analysis.keywords || [];
  if (keywords.length === 0) return [];
  
  const invented = new Set(analysis.inventedIds || []);
  const scored = catalog
    .filter(item => !invented.has(item.id))
    .map(item => ({ item, score: score(item, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scored.map(({ item, score }) => ({
    ...item,
    url: item.url || `catalog.html?q=${encodeURIComponent(item.name)}`,
    reason: score >= 3 ? "Close match" : "Related item",
  }));
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingData {
  groundingChunks?: GroundingChunk[];
}

function groundingSources(data: GroundingData): { title: string; url: string }[] {
  if (!data || !Array.isArray(data.groundingChunks)) return [];
  
  const seen = new Set<string>();
  const sources = [];
  
  for (const chunk of data.groundingChunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (!uri || !title) continue;
    
    if (!uri.startsWith("https://")) continue;
    if (seen.has(uri)) continue;
    
    try {
      const url = new URL(uri);
      if (url.protocol !== "https:") continue;
      seen.add(uri);
      sources.push({ title, url: uri });
    } catch {
      continue;
    }
  }
  
  return sources;
}

const RATES = {
  flyer: { label: "Flyer/poster redesign", min: 200, max: 300, fromOnly: false },
  social: { label: "Social-media redesign", min: 300, max: 450, fromOnly: false },
  logo: { label: "Logo/brand redesign", min: 700, max: 1200, fromOnly: false },
  packaging: { label: "Packaging redesign", min: 500, max: 800, fromOnly: false },
  complex: { label: "Complex/multi-page redesign", min: 1200, max: null, fromOnly: true },
} as const;

interface EstimateScope {
  category?: string;
  singleItem?: boolean;
  usableContent?: boolean;
  dimensionsKnown?: boolean;
  pagesKnown?: boolean;
}

interface Estimate {
  category: string;
  currency: "GHS";
  min: number;
  max: number | null;
  fromOnly: boolean;
  turnaround: string;
  designOnly: true;
  printingExcluded: true;
  requiresConfirmation: true;
}

function buildEstimate(scope: EstimateScope): Estimate | null {
  const cat = scope.category?.toLowerCase();
  if (!cat || !(cat in RATES)) return null;
  
  const rate = RATES[cat as keyof typeof RATES];
  let turnaround = "Studio confirmation required";
  
  if (cat === "flyer") {
    if (scope.singleItem && scope.usableContent && scope.dimensionsKnown) {
      turnaround = "Likely 1–2 days";
    }
  } else if (cat === "social") {
    if (scope.singleItem && scope.usableContent) {
      turnaround = "Likely 1–2 days";
    } else {
      turnaround = "Item count requires studio review";
    }
  } else if (cat === "logo") {
    turnaround = "Typical logo turnaround is 2–4 days; studio confirmation required";
  } else if (cat === "packaging") {
    if (scope.singleItem && scope.usableContent) {
      turnaround = "Likely 1–2 days for simple artwork";
    } else {
      turnaround = "Studio review required";
    }
  } else if (cat === "complex") {
    if (!scope.pagesKnown) {
      turnaround = "Page count and source files require studio review";
    }
  }
  
  return {
    category: rate.label,
    currency: "GHS",
    min: rate.min,
    max: rate.max,
    fromOnly: rate.fromOnly,
    turnaround,
    designOnly: true,
    printingExcluded: true,
    requiresConfirmation: true,
  };
}

const MAX_ANSWER = 4000;
const MAX_MATCHES = 3;
const MAX_SOURCES = 3;

interface EnvelopeMatch {
  id: string;
  name: string;
  reason: string;
  url: string;
}

interface EnvelopeSource {
  title: string;
  url: string;
}

interface AssistantEnvelope {
  answer: string;
  matches: EnvelopeMatch[];
  sources: EnvelopeSource[];
  estimate: Estimate | null;
}

function safeMatchUrl(url: string): boolean {
  return url.startsWith("catalog.html?q=");
}

function safeSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function buildEnvelope(
  answer: string,
  analysis: unknown,
  candidates: (CatalogItem & { reason: string })[],
  sources: { title: string; url: string }[]
): AssistantEnvelope {
  const safeAnswer = answer.slice(0, MAX_ANSWER);
  
  const safeMatches = candidates
    .filter(c => safeMatchUrl(c.url || ""))
    .slice(0, MAX_MATCHES)
    .map(c => ({ id: c.id, name: c.name, reason: c.reason, url: c.url || "" }));
  
  const safeSources = sources
    .filter(s => safeSourceUrl(s.url))
    .slice(0, MAX_SOURCES);
  
  return {
    answer: safeAnswer,
    matches: safeMatches,
    sources: safeSources,
    estimate: null,
  };
}

// ─── HANDLER ORCHESTRATION (handler.ts) ───────────────────────────────────────

interface Runtime {
  fetch: typeof fetch;
  env: (key: string) => string | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const SITES = ["https://www.brownhub283.com"];
const MAX_QUERY = 600;
const MAX_TURNS = 8;
const MAX_TURN = 400;
const MINUTES_WINDOW = 60_000;
const PER_MINUTE = 8;
const DAY_WINDOW = 86_400_000;
const PER_DAY = 120;

const rateHits = new Map<string, { minute: number[]; day: number[] }>();

function rateLimited(ip: string, now: number): boolean {
  const rec = rateHits.get(ip) || { minute: [], day: [] };
  rec.minute = rec.minute.filter((t) => now - t < MINUTES_WINDOW);
  rec.day = rec.day.filter((t) => now - t < DAY_WINDOW);
  if (rec.minute.length >= PER_MINUTE || rec.day.length >= PER_DAY) {
    rateHits.set(ip, rec);
    return true;
  }
  rec.minute.push(now);
  rec.day.push(now);
  rateHits.set(ip, rec);
  return false;
}

function allowed(origin: string | null): boolean {
  return origin !== null && SITES.includes(origin);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

async function uploadFile(
  runtime: Runtime,
  key: string,
  name: string,
  mime: string,
  bytes: Uint8Array
): Promise<string> {
  const startRes = await runtime.fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({ file: { displayName: name } }),
  });
  if (!startRes.ok) throw new Error("upload-start-" + startRes.status);
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL") || startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("no-upload-url");
  const uploadRes = await runtime.fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Type": mime,
    },
    body: bytes,
  });
  if (!uploadRes.ok) throw new Error("upload-" + uploadRes.status);
  const result = await uploadRes.json();
  return result.file?.name || result.name;
}

async function waitActive(
  runtime: Runtime,
  key: string,
  fileName: string,
  timeoutMs = 30000
): Promise<void> {
  const deadline = runtime.now() + timeoutMs;
  while (runtime.now() < deadline) {
    const res = await runtime.fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) throw new Error("poll-" + res.status);
    const data = await res.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("file-failed");
    await runtime.sleep(1500);
  }
  throw new Error("upload-timeout");
}

async function deleteFile(runtime: Runtime, key: string, fileName: string): Promise<void> {
  try {
    await runtime.fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": key },
    });
  } catch { /* best effort */ }
}

async function generate(
  runtime: Runtime,
  key: string,
  model: string,
  contents: unknown[],
  systemInstruction: string,
  tools?: unknown[]
): Promise<{ text: string; grounding?: unknown }> {
  const res = await runtime.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools,
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    }
  );
  if (!res.ok) throw new Error("generate-" + res.status);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text || "")
    .join(" ")
    .trim();
  if (!text) throw new Error("empty-response");
  return { text, grounding: data?.candidates?.[0]?.groundingMetadata };
}

async function fetchCatalog(runtime: Runtime): Promise<unknown[]> {
  const res = await runtime.fetch("https://www.brownhub283.com/data/assistant-catalog.json");
  if (!res.ok) throw new Error("catalog-" + res.status);
  const data = await res.json();
  return data.items || [];
}

const BRIEF = `You are BrownHub Studio Assistance, answering visitors on brownhub's own website.

THE BUSINESS
BrownHub is a creative studio in Accra, Ghana. Graphic design and branding is the main
work; websites and software are secondary. The team designs and prints its own work.

SERVICES OFFERED
- Logo & Brand Identity: logo concepts and variations, colour palette, typography, brand
  guidelines, business cards and letterheads.
- Social Media & Advertising: post sets and templates, ad and promo graphics, event and
  launch visuals, exported in every channel's size.
- Flyers, Posters & Print: flyers, posters, pull-up banners, backdrops, ABS boards,
  funeral and event banners, frames and awards.
- Brochures, Profiles & Books: company profiles, brochures, menus and price lists,
  catalogs, book covers and inside layout, print-ready PDFs with correct margins.
- Packaging Design: labels, boxes, sachets, product mockups, dielines prepared with the
  printer, consistent variants across a range.
- Custom Graphic Design: one-off graphics and illustrations, rework of existing artwork,
  rush jobs.
- Websites & Software: business websites, landing pages, online catalogs, booking tools,
  web apps, internal dashboards, hosting and support.

HOW A JOB RUNS
Understand, then Create, then Refine, then Deliver. Print and studio pickup address:
ChrisPrintgh, Accra New Town, Accra, Greater Accra. Opening hours Monday to Saturday,
8:30am-7pm Ghana time, closed on Sunday; messages outside those hours are answered the
next working day.

TURNAROUND (typical, not a promise)
Logos 2-4 days. Full brand identity about a week. Flyers, posters and social media kits
1-3 days. Books and company profiles depend on page count. Rush work can often be
arranged over WhatsApp.

CATALOG ITEMS ON THE SITE
ABS Board, All Types of Frames, Banner Printing, Book Design (Inside and Cover), Digital
Embroidery, Embroidery and Helmet Branding, Flag Designing & Printing, Flyer, Food & Drinks
Flyers, Funeral Poster & Invitation Cards, Funeral Rosettes and Designs, Gold Perspex, ID Tags &
Lanyards, Key Holders, Logo Design Mockup, More Food Flyers, More Winners' Chapel Flyers,
Notepad Design, Other Flyers, Other Food Flyers, Packaging Box Sleeves, Paper Bags Mugs &
Flasks, Product Labels Printing, Pull Up Design Backdrop and Printing, Sample of Designs and Printing,
Samples of Label Printing, T-Shirts & Caps, Wedding Invitation Cards, Winners' Chapel International
Flyer. That is the whole catalog — if a visitor asks for something not on that list, say we have not
listed it but can usually make it, and point them to WhatsApp. Three of them show the studio's own
price on their card, and those figures are the ones to repeat: Winners' Chapel International Flyer
GH₵300-350, Gold Perspex GH₵40, Banner Printing GH₵300. Every other catalog item is not priced on
the page: its price is confirmed on WhatsApp from sizes, quantity and deadline.
Merchandise such as t-shirts, caps, tags, mugs and flasks is printed with the client's own
logo or artwork.

GETTING IN TOUCH
WhatsApp +233 50 295 4541 (wa.me/233502954541) is the fastest route, and it is the line the
catalog hangs off. +233 59 387 2873 (wa.me/233593872873) is a second WhatsApp line. For a voice
call use +233 53 558 3460. Email is howelldaniel533@gmail.com or
anghadaniel621@gmail.com. The site also has a contact form on the contact page, and a
WhatsApp catalog. Offer the call number when someone wants to talk out loud; otherwise
WhatsApp is the default.

PAID PACKAGES AND PRICES
The site sells four design packages and three sponsored slots. Prices are fixed and published:
- Logo Design Package: GH₵700
- Full Brand Identity Package: GH₵1,200
- Social Media Kit: GH₵450
- Flyer Design Package: GH₵300
- Sponsored Slot (Featured): GH₵500
- Sponsored Slot (Standard): GH₵350
- Sponsored Slot (Basic): GH₵250
Payment is through Paystack on the site: card, mobile money or Apple Pay, in Ghana cedis.
A buyer who would rather bank with the studio directly can press "Transfer to our account"
on any priced card and get the studio's own bank details. Either way the payment is confirmed
by the studio in the Paystack dashboard and a human picks the job up on WhatsApp - there is
no automatic delivery of anything.

CLIENT ACCOUNTS
The "My requests" panel signs people up with email and password. It keeps every request
they have sent, filters them by period, lets them re-order one, reset a password, and
optionally add a phone number.

THE SITE ITSELF
It is offered in forty languages chosen from a menu at the top of the page, and it has a
privacy policy page. Voice notes recorded in the chat or on the Project details form are
emailed to the studio.

IMAGE, VIDEO AND DOCUMENT ANALYSIS
When a visitor attaches an image, video or document, identify what it is proactively: describe
the subject, style, colours, layout, visible text, motion (for video), and purpose. If it is
a design piece (flyer, poster, logo, social media graphic, packaging, etc.), compare it with
BrownHub's catalog when relevant and suggest whether it could be redesigned, improved, or
matched by an existing service. For videos, describe what is shown, any text or branding
visible, the pacing and production quality. Be direct and helpful — the visitor does not
need to ask "what is this?" for you to analyse it; attaching it is enough.

REDESIGN ESTIMATES
If a visitor asks about redesigning an attached piece, classify the category (flyer, social,
logo, packaging, or complex/multi-page) and scope (single item, usable content, dimensions
known, pages known). Return the classification in the estimate field of your JSON response.
The server will look up the approved figures. Do not invent prices.

RULES YOU MUST KEEP
- You are given the conversation so far, ending with the question to answer. Read
  it as one conversation: "it", "that", "and for 500 of them" and "how much
  then" all refer to what was said above. Do not repeat an answer already given,
  and do not ask again for something the visitor already told you.
- Answer only about BrownHub, its services, this website, ordering, prices, delivery and
  contact. For anything else, say in one short line that you only know about BrownHub's
  design work, and offer WhatsApp or the contact form.
- Never invent a price, a discount, a timeline, a client, an award, a staff member, a
  policy or a statistic. If the fact is not above and not in the price list, say you are
  not sure and point to a human.
- Never guess what a specific print job costs.
- Reply in the language asked for, in plain sentences. No markdown, no asterisks, no
  headings, no emoji, no URLs - the chat window shows plain text and has its own buttons.
- Keep it under 220 words when analysing attached media; under 110 words for plain text
  questions. Be direct and friendly, like a studio that answers its own phone.
- Return your response as JSON with fields: answer (string), keywords (array of strings for
  catalog retrieval), researchNeeded (boolean), researchQuery (string if researchNeeded),
  estimate (object or null), matches (array of {id, reason}).`;

function conversation(raw: unknown, q: string): { role: string; parts: { text: string }[] }[] {
  const list = Array.isArray(raw) ? raw : [];
  const merged: { role: string; text: string }[] = [];
  for (const item of list.slice(-MAX_TURNS)) {
    const it = (item || {}) as Record<string, unknown>;
    const role = it.role === "model" ? "model" : it.role === "user" ? "user" : "";
    const text = String(it.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TURN);
    if (!role || !text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === role) prev.text += "\n" + text;
    else merged.push({ role, text });
  }
  if (merged.length && merged[merged.length - 1].role === "user") merged.pop();
  if (merged.length && merged[0].role === "model") merged.shift();
  merged.push({ role: "user", text: q });
  return merged.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
}

function createHandler(runtime: Runtime): (request: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "access-control-allow-origin": req.headers.get("origin") || "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
          "access-control-max-age": "86400",
        },
      });
    }
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    if (!allowed(req.headers.get("origin"))) return json({ error: "off" }, 403);

    const key = runtime.env("GEMINI_API_KEY") || "";
    if (!key) return json({ error: "The studio has not switched the assistant on yet." }, 500);

    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim();
    if (rateLimited(ip, runtime.now())) return json({ error: "slow" }, 429);

    const contentType = req.headers.get("content-type") || "";
    let q = "";
    let lang = "en";
    let history: unknown = [];
    const fileEntries: { name: string; type: string; bytes: Uint8Array }[] = [];

    try {
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        q = String(form.get("q") || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
        lang = String(form.get("lang") || "en");
        const hRaw = form.get("h");
        if (hRaw) { try { history = JSON.parse(String(hRaw)); } catch { history = []; } }
        const fileList = form.getAll("files");
        if (fileList.length > 3) {
          return json({ error: "Too many files: maximum 3" }, 400);
        }
        for (const f of fileList) {
          if (f instanceof File) {
            const buf = new Uint8Array(await f.arrayBuffer());
            fileEntries.push({ name: f.name, type: f.type || "application/octet-stream", bytes: buf });
          }
        }
      } else {
        const body = await req.json();
        q = String(body.q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
        lang = String(body.lang ?? "en");
        history = body.h;
      }
    } catch {
      return json({ error: "Send a question." }, 400);
    }

    if (q.length < 2 && fileEntries.length === 0) {
      return json({ error: "Ask a question or attach a file." }, 400);
    }

    let validated: { kind: string; mime: string; name: string; bytes: Uint8Array }[];
    try {
      validated = validateFiles(fileEntries);
    } catch (e) {
      return json({ error: String(e) }, 400);
    }

    const code = /^[a-z]{2}$/.test(lang) ? lang : "en";
    const LANGUAGE: Record<string, string> = {
      en: "English", tw: "Twi", sw: "Swahili", ar: "Arabic", he: "Hebrew", fa: "Persian",
      af: "Afrikaans",
      fr: "French", de: "German", es: "Spanish", pt: "Portuguese", it: "Italian",
      nl: "Dutch", el: "Greek", sv: "Swedish", da: "Danish", fi: "Finnish",
      pl: "Polish", cs: "Czech", sk: "Slovak", hu: "Hungarian", ro: "Romanian",
      bg: "Bulgarian", sr: "Serbian", hr: "Croatian", ru: "Russian", uk: "Ukrainian",
      tr: "Turkish",
      zh: "Simplified Chinese", ja: "Japanese", ko: "Korean", vi: "Vietnamese",
      th: "Thai", id: "Indonesian", ms: "Malay", tl: "Tagalog",
      bn: "Bengali", ta: "Tamil", hi: "Hindi", ur: "Urdu"
    };
    const model = runtime.env("GEMINI_MODEL") || "gemini-3.5-flash-lite";

    const uploadedNames: string[] = [];
    try {
      for (const file of validated) {
        const fileName = await uploadFile(runtime, key, file.name, file.mime, file.bytes);
        await waitActive(runtime, key, fileName);
        uploadedNames.push(fileName);
      }

      const userText = q || "Please identify and analyse the attached file.";
      const prompt = `Answer in ${LANGUAGE[code] || "English"}. ${userText}`;
      const parts: unknown[] = [{ text: prompt }];
      for (const name of uploadedNames) {
        parts.push({ fileData: { mimeType: validated[uploadedNames.indexOf(name)].mime, fileUri: `gs://${name}` } });
      }

      const histTurns = conversation(history, "");
      const contents = histTurns.slice(0, -1);
      contents.push({ role: "user", parts });

      const analysisResult = await generate(runtime, key, model, contents, BRIEF);
      let analysis: any;
      try {
        analysis = JSON.parse(analysisResult.text);
      } catch {
        analysis = { answer: analysisResult.text, keywords: [], researchNeeded: false, estimate: null, matches: [] };
      }

      let candidates: any[] = [];
      if (analysis.keywords && analysis.keywords.length > 0) {
        const catalog = await fetchCatalog(runtime);
        candidates = selectCandidates(catalog, { keywords: analysis.keywords, inventedIds: analysis.inventedIds });
      }

      let sources: { title: string; url: string }[] = [];
      if (analysis.researchNeeded && analysis.researchQuery) {
        try {
          const researchResult = await generate(
            runtime,
            key,
            model,
            [{ role: "user", parts: [{ text: `${LANGUAGE[code] || "English"}: ${analysis.researchQuery}` }] }],
            BRIEF,
            [{ googleSearch: {} }]
          );
          sources = groundingSources(researchResult.grounding);
        } catch {
          sources = [];
        }
      }

      const envelope = buildEnvelope(analysis.answer || "", analysis, candidates, sources);
      if (analysis.estimate) {
        envelope.estimate = buildEstimate(analysis.estimate);
      }

      return json(envelope);
    } catch (e) {
      console.error("assistant error", String(e));
      if (String(e).includes("generate-5")) return json({ error: "The assistant is not answering right now." }, 502);
      return json({ error: "The assistant could not process that." }, 500);
    } finally {
      for (const name of uploadedNames) {
        await deleteFile(runtime, key, name);
      }
    }
  };
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────

Deno.serve(createHandler({
  fetch,
  env: Deno.env.get,
  now: Date.now,
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}));
