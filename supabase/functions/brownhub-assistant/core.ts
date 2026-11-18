// Pure server policy: file validation, catalog retrieval, grounding, estimates.
// Runtime-neutral — no Deno, no env, no fetch, no secrets. Node can import this
// directly in tests. The handler.ts orchestrator calls these functions.

// ─── FILE VALIDATION ─────────────────────────────────────────────────────────

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

export function validateFile(name: string, declaredMime: string, bytes: Uint8Array): { kind: string; mime: string } {
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

export function validateFiles(files: { name: string; type: string; bytes: Uint8Array }[]): { kind: string; mime: string; name: string; bytes: Uint8Array }[] {
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

// ─── CATALOG RETRIEVAL ───────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  url?: string;
}

export interface Analysis {
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

export function selectCandidates(catalog: CatalogItem[], analysis: Analysis, limit = 3): (CatalogItem & { reason: string })[] {
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

// ─── GROUNDING SOURCE VALIDATION ─────────────────────────────────────────────

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export interface GroundingData {
  groundingChunks?: GroundingChunk[];
}

export function groundingSources(data: GroundingData): { title: string; url: string }[] {
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

// ─── ESTIMATE BUILDING ───────────────────────────────────────────────────────

const RATES = {
  flyer: { label: "Flyer/poster redesign", min: 200, max: 300, fromOnly: false },
  social: { label: "Social-media redesign", min: 300, max: 450, fromOnly: false },
  logo: { label: "Logo/brand redesign", min: 700, max: 1200, fromOnly: false },
  packaging: { label: "Packaging redesign", min: 500, max: 800, fromOnly: false },
  complex: { label: "Complex/multi-page redesign", min: 1200, max: null, fromOnly: true },
} as const;

export interface EstimateScope {
  category?: string;
  singleItem?: boolean;
  usableContent?: boolean;
  dimensionsKnown?: boolean;
  pagesKnown?: boolean;
}

export interface Estimate {
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

export function buildEstimate(scope: EstimateScope): Estimate | null {
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

// ─── A CLOCK AND LIVE WEATHER ────────────────────────────────────────────────
// The model does not know what day it is and cannot read the sky. The server
// measures both and hands them over inside the single call it gets: a live
// answer already costs about twelve of the browser's twenty-five seconds, so
// there is no second call to spend on a lookup.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function clockBlock(nowMs: number): string {
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

export function isWeatherQuestion(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (JOB_WORDS.test(t)) return false;
  if (WEATHER_WORDS.test(t)) return true;
  return WEATHER_FEELS.test(t) && WEATHER_FRAME.test(t);
}

const PLACE_HEAD = /\b(?:in|for|at|near)\s+([A-Za-z][\w'’.\-]*(?:\s+[A-Za-z][\w'’.\-]*){0,2})/;
const PLACE_BREAK = /^(today|tomorrow|tonight|now|this|that|week|weekend|morning|evening|day|right|please|outside|like|going|to|be|is|are|am|it|in|of|for|and|or|but|can|could|you|your|me|my|i|we|us|the|a|an|do|does|did|will|would|should|how|what|when|where|there|here|any|very|too|much|also|print|design|make|want|need|thanks|thank)$/i;

export function weatherPlace(text: string): string {
  const m = String(text || "").match(PLACE_HEAD);
  if (!m) return "";
  const words = [];
  for (const w of m[1].split(/\s+/)) {
    if (PLACE_BREAK.test(w.toLowerCase())) break;
    words.push(w);
  }
  return words.join(" ").slice(0, 40).trim();
}

export function geocodeUrl(place: string): string {
  const clean = String(place || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return "";
  return "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(clean) + "&count=1&language=en&format=json";
}

export function forecastUrl(lat: unknown, lon: unknown): string {
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

export function wmoText(code: unknown): string {
  return WMO[Number(code)] || "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatWeather(geo: unknown, wx: unknown): string {
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

export function contextBlock(nowMs: number, weather: string): string {
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

export function sanitizeProviderError(raw: string): string {
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

export interface ParsedAnalysis {
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

export function parseAnalysis(text: string): ParsedAnalysis {
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

// ─── ENVELOPE CONSTRUCTION ───────────────────────────────────────────────────

const MAX_ANSWER = 4000;
const MAX_MATCHES = 3;
const MAX_SOURCES = 3;

export interface EnvelopeMatch {
  id: string;
  name: string;
  reason: string;
  url: string;
}

export interface EnvelopeSource {
  title: string;
  url: string;
}

export interface AssistantEnvelope {
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

export function buildEnvelope(
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
