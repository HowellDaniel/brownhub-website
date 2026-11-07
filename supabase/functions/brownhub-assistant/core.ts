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
  "application/pdf": { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2D], kind: "document" },
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
  
  if (!matchesMagic(declaredMime, bytes)) {
    throw new Error("File signature does not match declared type");
  }
  
  const spec = MAGIC[declaredMime];
  return { kind: spec?.kind || "document", mime: declaredMime };
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
