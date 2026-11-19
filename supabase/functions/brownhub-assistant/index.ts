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
//      OPENAI_API_KEY is the second provider's key and is optional: without it
//      nothing changes, with it ChatGPT answers when Gemini refuses a question
//      it can still read in time. OPENAI_MODEL is optional too, gpt-4o-mini.
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

// The model does not know what day it is and cannot read the sky. The server
// measures both and hands them over inside the single call it gets: a live
// answer already costs about twelve of the browser's twenty-five seconds, so
// there is no second call to spend on a lookup.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clockBlock(nowMs: number): string {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return [
    "TODAY FOR THIS CONVERSATION (read off the studio server, not remembered)",
    `Date: ${d.toISOString().slice(0, 10)} — ${WEEKDAYS[d.getUTCDay()]}. Time in Accra: ${hh}:${mm} GMT.`,
    "Ghana keeps GMT+0 all year and changes no clocks, so Accra time is exactly this UTC instant.",
    "This clock is authoritative. Use it for every date, weekday, date arithmetic and open-or-closed answer. Never state a date or time from memory, and never claim not to know it.",
    "For a city outside Ghana, convert from its standard UTC offset, name the zone you used, and say a summer-time week can put it an hour off.",
  ].join("\n");
}

const WEATHER_WORDS = /\b(weather|forecast|temperature|rain|rainy|raining|drizzle|thunder|thunderstorm|storm|humidity|humid|harmattan|sunburn|uv|snow|fog|frost|icy|heatwave|coldwave|cyclone)\b|[°º]\s?[cf]\b/i;
const WEATHER_FEELS = /\b(hot|cold|cool|warm|degrees|sunny|cloud|cloudy|overcast|windy|wind|outside)\b/i;
const WEATHER_FRAME = /\b(it|today|tomorrow|tonight|now|week|weekend|morning|evening|this week)\b/i;
const JOB_WORDS = /\b(logo|flyer|poster|banner|brand|branding|design|printing|print|business card|packaging|brochure|catalog|sticker|t-?shirt|roll-?up|pull-?up|website|invitation|menu|card)\w*/i;

function isWeatherQuestion(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (JOB_WORDS.test(t)) return false;
  if (WEATHER_WORDS.test(t)) return true;
  return WEATHER_FEELS.test(t) && WEATHER_FRAME.test(t);
}

const PLACE_HEAD = /\b(?:in|for|at|near)\s+([A-Za-z][\w'’.\-]*(?:\s+[A-Za-z][\w'’.\-]*){0,2})/;
const PLACE_BREAK = /^(today|tomorrow|tonight|now|this|that|week|weekend|morning|evening|day|right|please|outside|like|going|to|be|is|are|am|it|in|of|for|and|or|but|can|could|you|your|me|my|i|we|us|the|a|an|do|does|did|will|would|should|how|what|when|where|there|here|any|very|too|much|also|print|design|make|want|need|thanks|thank)$/i;

function weatherPlace(text: string): string {
  const m = String(text || "").match(PLACE_HEAD);
  if (!m) return "";
  const words = [];
  for (const w of m[1].split(/\s+/)) {
    if (PLACE_BREAK.test(w.toLowerCase())) break;
    words.push(w);
  }
  return words.join(" ").slice(0, 40).trim();
}

function geocodeUrl(place: string): string {
  const clean = String(place || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return "";
  return "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(clean) + "&count=1&language=en&format=json";
}

function forecastUrl(lat: unknown, lon: unknown): string {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "";
  return "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${la.toFixed(4)}&longitude=${lo.toFixed(4)}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m" +
    "&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2";
}

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "dense drizzle",
  56: "freezing drizzle", 57: "dense freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "heavy freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "light rain showers", 81: "rain showers", 82: "violent rain showers",
  85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
};

function wmoText(code: unknown): string {
  return WMO[Number(code)] || "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatWeather(geo: unknown, wx: unknown): string {
  const hit = (geo as { results?: { name?: string; country?: string }[] })?.results?.[0];
  const cur = (wx as { current?: Record<string, unknown> })?.current;
  const temp = num(cur?.temperature_2m);
  const place = [hit?.name, hit?.country].filter(Boolean).join(", ");
  if (!place || temp === null) return "";

  const bits = [`${temp}°C`];
  const feels = num(cur?.apparent_temperature);
  if (feels !== null) bits.push(`feels like ${feels}°C`);
  const cond = wmoText(cur?.weather_code);
  if (cond) bits.push(cond);
  const hum = num(cur?.relative_humidity_2m);
  if (hum !== null) bits.push(`humidity ${hum}%`);
  const wind = num(cur?.wind_speed_10m);
  if (wind !== null) bits.push(`wind ${wind} km/h`);

  let line = `Live weather measured for ${place} (station reading ${String(cur?.time || "recently")} local): ${bits.join(", ")}.`;
  const daily = (wx as { daily?: Record<string, unknown[]> })?.daily;
  const days: string[] = (daily?.time as string[]) || [];
  const highs: unknown[] = (daily?.temperature_2m_max as unknown[]) || [];
  const lows: unknown[] = (daily?.temperature_2m_min as unknown[]) || [];
  const label = ["Today", "Tomorrow"];
  for (let i = 0; i < Math.min(2, days.length); i++) {
    const hi = num(highs[i]), lo = num(lows[i]);
    if (hi !== null && lo !== null) line += ` ${label[i]} high ${hi}°C, low ${lo}°C.`;
  }
  return line;
}

function contextBlock(nowMs: number, weather: string): string {
  const blocks = [clockBlock(nowMs)];
  const facts = String(weather || "").trim();
  if (facts) {
    blocks.push([
      "LIVE WEATHER READ BY THE SERVER (not from memory)",
      facts,
      "Give these figures when asked about this place, and read them as measured data, not your own knowledge. Say which city they belong to.",
      "For another town you have nothing measured for: say so, offer the general climate of that season as exactly that, and point the visitor at a live source.",
      "If a figure looks wrong or stale, say so plainly rather than inventing a better one.",
    ].join("\n"));
  }
  return "\n\n" + blocks.join("\n\n") + "\n";
}

// ─── PROVIDER ERROR SANITISING ───────────────────────────────────────────────
// Only the log may carry the provider's wording, and never its file references.

const MAX_PROVIDER_REASON = 240;

function sanitizeProviderError(raw: string): string {
  let reason = "";
  try {
    const err = JSON.parse(raw)?.error;
    if (err && typeof err === "object") {
      reason = [err.status, err.message]
        .filter((part: unknown) => typeof part === "string" && part.length > 0)
        .join(" — ");
    }
  } catch {
    /* the gateway answered HTML, not JSON */
  }
  const clean = (reason || String(raw))
    .replace(/https:\/\/generativelanguage\.googleapis\.com\/\S+/g, "[file]")
    .replace(/gs:\/\/\S+/g, "[file]")
    .replace(/files\/[A-Za-z0-9_-]+/g, "[file]")
    .replace(/AIza[A-Za-z0-9_-]{15,}/g, "[key]")
    .replace(/sk_(?:live|test)_[A-Za-z0-9]+/g, "[key]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}/g, "[key]")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "no reason returned").slice(0, MAX_PROVIDER_REASON);
}

// ─── MODEL REPLY PARSING ─────────────────────────────────────────────────────
// The brief asks for JSON and the model usually fences it. A fence is not a
// failure: the fields still have to reach the visitor.

interface ParsedAnalysis {
  answer: string;
  keywords: string[];
  inventedIds?: string[];
  researchNeeded: boolean;
  researchQuery?: string;
  estimate?: EstimateScope | null;
  matches?: unknown[];
}

const FENCED = /^\s*```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?\s*```\s*$/;

function unfence(text: string): string {
  const m = text.match(FENCED);
  return (m ? m[1] : text).trim();
}

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = inString; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseAnalysis(text: string): ParsedAnalysis {
  const body = unfence((text || "").trim());
  for (const candidate of [body, firstBalancedObject(body)]) {
    if (!candidate) continue;
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = asObject(JSON.parse(candidate));
    } catch {
      parsed = null;
    }
    if (parsed) {
      const prose = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
      return {
        ...parsed,
        answer: prose || body,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        researchNeeded: parsed.researchNeeded === true,
      } as ParsedAnalysis;
    }
  }
  return { answer: body, keywords: [], researchNeeded: false, estimate: null };
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
): Promise<{ name: string; uri: string }> {
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
  const file = result.file || result;
  if (!file?.name) throw new Error("no-file-name");
  // generateContent takes the Files API uri; gs:// is reserved for model output.
  const uri = file.uri || "https://generativelanguage.googleapis.com/v1beta/" + file.name;
  return { name: file.name, uri };
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

// A candidate stops for reasons that are a decision and for reasons that are only mechanics.
// SAFETY, RECITATION and the prohibited/blocklist/spii family decline to answer; STOP and
// MAX_TOKENS mean it finished or ran out of room. Reading the whole finishReason field as a
// verdict would silence every long answer that got cut off mid-sentence.
const POLICY_VERDICTS = new Set([
  "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY",
]);

// Matched as the whole message, never as a substring: Google says a revoked key was "blocked",
// and an outage must stay an outage rather than be reported to the visitor as a refusal.
function blockedReason(e: unknown): string {
  const verdict = /^Error: blocked-([A-Z_]+)$/.exec(String(e));
  return verdict ? verdict[1] : "";
}

// The studio's own words, not the provider's: a visitor who is declined still needs a door,
// and a 500 would tell them the site broke when nothing broke.
const DECLINED = "That question isn't one the assistant will answer. A person at the studio can take it — send us a message on WhatsApp or use the contact form and we'll pick it up.";

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
  if (!res.ok) {
    let raw = "";
    try { raw = await res.text(); } catch { /* no body to read */ }
    throw new Error("generate-" + res.status + " " + sanitizeProviderError(raw));
  }
  const data = await res.json();
  // A refusal arrives as a 200 with nothing in it, and "nothing in it" is the exact shape the
  // caller reads as "the first provider failed — ask the second". Naming the verdict here is
  // what stops this endpoint from being a way round the provider's own safety policy.
  const verdict = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
  if (typeof verdict === "string" && POLICY_VERDICTS.has(verdict)) throw new Error("blocked-" + verdict);
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text || "")
    .join(" ")
    .trim();
  if (!text) throw new Error("empty-response");
  return { text, grounding: data?.candidates?.[0]?.groundingMetadata };
}

// ─── THE SECOND PROVIDER ─────────────────────────────────────────────────────
// One call is the whole budget: the browser gives up at 25 s and a live answer already
// costs about twelve, so ChatGPT is never a second opinion — only a second chance. It
// runs when Gemini refused rather than when it was slow, and it reads the same brief,
// so the studio's prices, hours and catalog stay the server's facts under either key.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const FALLBACK_GRACE_MS = 9_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function openAIMessages(
  history: { role: string; parts: unknown[] }[],
  question: string,
  files: { kind: string; mime: string; bytes: Uint8Array }[]
): unknown[] {
  const messages = history.map((turn) => ({
    role: turn.role === "model" ? "assistant" : "user",
    content: (turn.parts as { text?: string }[]).map((p) => p.text || "").join("\n"),
  }));
  if (files.length === 0) {
    messages.push({ role: "user", content: question });
    return messages;
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: question },
      ...files.map((f) => ({
        type: "image_url",
        image_url: { url: `data:${f.mime};base64,${toBase64(f.bytes)}` },
      })),
    ],
  });
  return messages;
}

async function generateOpenAI(
  runtime: Runtime,
  key: string,
  model: string,
  messages: unknown[],
  systemInstruction: string
): Promise<{ text: string; grounding?: unknown }> {
  const res = await runtime.fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemInstruction }].concat(messages),
      temperature: 0.3,
      max_tokens: 800,
    }),
  });
  if (!res.ok) {
    let raw = "";
    try { raw = await res.text(); } catch { /* no body to read */ }
    throw new Error("generate-" + res.status + " " + sanitizeProviderError(raw));
  }
  const data = await res.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("empty-response");
  return { text };
}

async function fetchCatalog(runtime: Runtime): Promise<unknown[]> {
  const res = await runtime.fetch("https://www.brownhub283.com/data/assistant-catalog.json");
  if (!res.ok) throw new Error("catalog-" + res.status);
  const data = await res.json();
  return data.items || [];
}

// The weather rail runs only on a question that is actually about the sky, and it is
// budgeted: the browser gives up at 25 s and one answer already costs about twelve, so a
// slow station read must never be the reason a visitor got nothing. An unnamed question
// reads the studio's own town - the visitor's timezone header is not sent anywhere.
const DEFAULT_WEATHER_PLACE = "Accra, Ghana";
const WEATHER_BUDGET_MS = 4000;

async function timedFetch(runtime: Runtime, url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_BUDGET_MS);
  try {
    return await runtime.fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function liveWeather(runtime: Runtime, question: string): Promise<string> {
  if (!isWeatherQuestion(question)) return "";
  const geoUrl = geocodeUrl(weatherPlace(question) || DEFAULT_WEATHER_PLACE);
  if (!geoUrl) return "";
  try {
    const geoRes = await timedFetch(runtime, geoUrl);
    if (!geoRes.ok) return "";
    const geo = await geoRes.json();
    const fxUrl = forecastUrl(geo?.results?.[0]?.latitude, geo?.results?.[0]?.longitude);
    if (!fxUrl) return "";
    const fxRes = await timedFetch(runtime, fxUrl);
    if (!fxRes.ok) return "";
    return formatWeather(geo, await fxRes.json());
  } catch {
    return "";
  }
}

const BRIEF = `You are BrownHub Studio Assistance, answering visitors on brownhub's own website.
You are also the first person a visitor meets, so talk like one.

TALK LIKE A PERSON FIRST
- A greeting, a thank you, an apology, a "how are you", a bad day or a good one is always in
  scope. Answer the human before the transaction. "How are you doing?" is answered the way the
  studio would answer its own phone: "I'm doing well, thank you for asking. What can I help you
  make today?" - warm, short, then back to them.
- Read the feeling, not only the words. Emoji carry tone: 😞 and 😭 are disappointed or upset,
  😠 or 😡 annoyed, 🙏 grateful or pleading, 👍 approval, 🎉 a win, 😀 and 😊 friendliness. So do
  CAPITALS, "!!", "???", a bare "ok" and a one-word reply. Never treat an emoji as an unknown
  subject to be deflected.
- When someone is unhappy, worried, rushed or waiting, acknowledge that in one plain line in
  your own words before you solve anything, and mean it. Do not name a feeling they have not
  shown, do not repeat the apology, and do not comfort someone who is only saying hello.
- Fit the visitor: match their warmth and their length. Small talk gets one or two sentences,
  not a paragraph. Save the detail for real questions and attached work.
- Mirror emoji only if the visitor used one, and then at most one emoji in the whole reply,
  placed where a person honestly would. Never open with it, never stack two, never use one to
  soften bad news.
- Keep the thread moving: after answering, ask the one question that lets you help next, or name
  the one step that follows. Do not list every option you know.
- Be a person, not a claim: you may be glad to help and ask how you can. Do not invent a name, a
  family, a body, or anything happening in your life outside this chat.

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
Samples of Label Printing, T-Shirts & Caps, VIDEO SAMPLES OF OUR PRINT OUT 1, VIDEO SAMPLES OF
OUR PRINT OUT 2, VIDEO SAMPLES OF OUR PRINT OUT 3, VIDEO SAMPLES OF OUR PRINT OUT 4, Wedding
Invitation Cards, Winners' Chapel International Flyer. The four VIDEO SAMPLES OF OUR PRINT OUT
groups show the studio's own printed work as short
clips, ten clips in each of the first three and five in the last. That is the whole catalog — if a visitor asks for something not on that list, say we have not
listed it but can usually make it, and point them to WhatsApp. No catalog card shows a price at all:
every item is quoted on WhatsApp from sizes, quantity and deadline. Never state a figure for a
catalog item - the only prices published on the site are the design packages and sponsored slots
under PAID PACKAGES AND PRICES.
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
- Answer the world, not only the studio. A date, the time, the weather, a fact, a
  calculation, what a word means, advice about the visitor's own business - all of it is in
  scope, and you should be as useful on it as a well-read person. What is fenced is not the
  topic but the source: a BrownHub fact (a service, a price, a turnaround, an address, a
  policy, a client, a number about the studio) comes only from this brief and the price list.
  Never answer about BrownHub from general knowledge.
- The date, the weekday, the time and the weather are measured by this server and given to you
  below in TODAY FOR THIS CONVERSATION and, when asked for, LIVE WEATHER. Give them from there.
  Never answer a date or a time from memory, never say you do not keep track of it, and never
  say you cannot check the weather. Work out whether the studio is open right now from that
  instant against the opening hours above - Monday to Saturday, 08:30 to 19:00 in Accra - and
  say which of the two states it is in plus when it changes.
- When you are not sure of a general fact, say so in one line and name what you are unsure of.
  Do not dress a guess as knowledge. On health, law or money, or anything that could hurt
  someone, answer what you can and send them to a professional who can take responsibility.
- Never claim BrownHub made, sells or supports something it does not. If a visitor takes a
  general answer for studio work, correct the assumption in one friendly line - that is not a
  reason to withhold the answer.
- Never invent a price, a discount, a timeline, a client, an award, a staff member, a
  policy or a statistic. If the fact is not above and not in the price list, say you are
  not sure and point to a human.
- Never guess what a specific print job costs.
- Reply in the language the visitor writes in - if that differs from the language named in the
  request, follow the visitor. Plain sentences only. No markdown, no asterisks, no
  headings, no URLs - the chat window shows plain text and has its own buttons. Emoji follow the
  one-emoji rule above.
- Keep it under 220 words when analysing attached media; under 110 words for plain text
  questions; one or two sentences for small talk. Be direct and friendly, like a studio that
  answers its own phone.
- Return your response as JSON with fields: answer (string), keywords (array of strings for
  catalog retrieval), estimate (object or null), matches (array of {id, reason}). For a
  greeting, a thank you, a
  feeling or any turn that is not about a piece of work, return keywords as an empty array,
  estimate null and matches empty - the chat builds catalog cards out of
  those fields, and small talk must never drag one in.`;

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
    const altKey = runtime.env("OPENAI_API_KEY") || "";
    if (!key && !altKey) return json({ error: "The studio has not switched the assistant on yet." }, 500);

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

    if (Array.from(q).length === 0 && fileEntries.length === 0) {
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
    const altModel = runtime.env("OPENAI_MODEL") || "gpt-4o-mini";

    const uploaded: { name: string; uri: string }[] = [];
    try {
      const userText = q || "Please identify and analyse the attached file.";
      const prompt = `Answer in ${LANGUAGE[code] || "English"}. ${userText}`;
      const histTurns = conversation(history, "");
      const startedAt = runtime.now();
      const brief = BRIEF + contextBlock(startedAt, await liveWeather(runtime, userText));

      let analysisResult: { text: string; grounding?: unknown };
      try {
        if (!key) throw new Error("no-gemini-key");

        for (const file of validated) {
          const ref = await uploadFile(runtime, key, file.name, file.mime, file.bytes);
          uploaded.push(ref);
          await waitActive(runtime, key, ref.name);
        }

        const parts: unknown[] = [{ text: prompt }];
        uploaded.forEach((ref, i) => {
          parts.push({ fileData: { mimeType: validated[i].mime, fileUri: ref.uri } });
        });
        const contents = histTurns.slice(0, -1);
        contents.push({ role: "user", parts });

        // One call, and it carries everything the answer needs: the studio brief, the server's
        // own clock, the weather if the question asked for it, and live search for the world
        // outside the studio. A picture already costs the most time, so the media path goes
        // without the search tool rather than adding a round to the slowest request there is.
        const searchTool = uploaded.length ? undefined : [{ googleSearch: {} }];
        try {
          analysisResult = await generate(runtime, key, model, contents, brief, searchTool);
        } catch (err) {
          // The ungrounded retry exists for a search-tool failure, not for a decision: a
          // blocked question already has its answer, and asking it twice buys only the delay.
          if (!searchTool || blockedReason(err)) throw err;
          analysisResult = await generate(runtime, key, model, contents, brief);
        }
      } catch (gemErr) {
        // ChatGPT answers only when there is still time to say anything and something it can
        // actually read. A document or a clip reaches a model through Gemini's Files API, and
        // this provider has no equivalent — so it would be inventing the attachment rather
        // than answering it. A refusal costs under two seconds; a spent timeout costs all
        // twenty-five, and no second provider can fit inside what the first one used up.
        // And a policy block never gets re-asked at all: the first provider's decision is the
        // studio's decision, not a malfunction this server gets to appeal to a laxer judge.
        const spent = runtime.now() - startedAt;
        const readable = validated.every((f) => f.kind === "image");
        if (blockedReason(gemErr) || !altKey || spent > FALLBACK_GRACE_MS || !readable) throw gemErr;
        analysisResult = await generateOpenAI(
          runtime,
          altKey,
          altModel,
          openAIMessages(histTurns.slice(0, -1), prompt, validated),
          brief
        );
      }
      const analysis = parseAnalysis(analysisResult.text);
      const sources = groundingSources(analysisResult.grounding);

      let candidates: any[] = [];
      if (analysis.keywords && analysis.keywords.length > 0) {
        const catalog = await fetchCatalog(runtime);
        candidates = selectCandidates(catalog, { keywords: analysis.keywords, inventedIds: analysis.inventedIds });
      }

      const envelope = buildEnvelope(analysis.answer || "", analysis, candidates, sources);
      if (analysis.estimate) {
        envelope.estimate = buildEstimate(analysis.estimate);
      }

      return json(envelope);
    } catch (e) {
      console.error("assistant error", String(e));
      // A declined question reads as the studio declining, not as the site breaking: the
      // visitor gets a human route, at 200, and the block itself is only ever a server log.
      if (blockedReason(e)) return json({ answer: DECLINED });
      if (String(e).includes("generate-5")) return json({ error: "The assistant is not answering right now." }, 502);
      return json({ error: "The assistant could not process that." }, 500);
    } finally {
      for (const ref of uploaded) {
        await deleteFile(runtime, key, ref.name);
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
