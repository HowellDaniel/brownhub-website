// Grounded multimodal orchestration: injectable runtime, provider adapters, file lifecycle.
// Imports pure policy from core.ts. The Deno entry point (index.ts) calls createHandler
// with Deno-specific dependencies; Node tests call it with fakes.

import {
  validateFiles,
  selectCandidates,
  groundingSources,
  buildEstimate,
  buildEnvelope,
} from "./core.ts";

export interface Runtime {
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

// ─── PROVIDER ADAPTERS ───────────────────────────────────────────────────────

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

// ─── BRIEF ───────────────────────────────────────────────────────────────────

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

IMAGE AND DOCUMENT ANALYSIS
When a visitor attaches an image or document, identify what it is proactively: describe the
subject, style, colours, layout, visible text, and purpose. If it is a design piece (flyer,
poster, logo, social media graphic, packaging, etc.), compare it with BrownHub's catalog
when relevant and suggest whether it could be redesigned, improved, or matched by an
existing service. Be direct and helpful — the visitor does not need to ask "what is this?"
for you to analyse it; attaching it is enough.

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

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export function createHandler(runtime: Runtime): (request: Request) => Promise<Response> {
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
        uploadedNames.push(fileName);
        await waitActive(runtime, key, fileName);
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
