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

// GitHub now 301s the old Pages URL to the custom domain, so a browser can never
// present howelldaniel.github.io as the origin of a request from this site.
const SITES = ["https://www.brownhub283.com"];
// Anything the model may be asked costs money or attention, so both are capped.
const MAX_QUERY = 600;
const MAX_PRICES = 20;
// The chat so far travels with each question. Eight turns of four hundred
// characters is enough to resolve a follow-up and small enough to stay cheap.
const MAX_TURNS = 8;
const MAX_TURN = 400;
const MINUTES_WINDOW = 60_000;
const PER_MINUTE = 8;
const DAY_WINDOW = 86_400_000;
const PER_DAY = 120;
// File upload limits: at most three files, 10 MB each, 30 MB total.
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

// Every cross-origin POST carries an Origin a browser cannot forge, and a script
// that sends none is not a browser — so this is what keeps strangers off the paid
// model key. The site's own chat always sends the origin above.
function allowed(origin: string | null): boolean {
  return origin !== null && SITES.includes(origin);
}

// Best effort, and deliberately so: an Edge isolate is short-lived and there is
// no shared store here, so this slows a single visitor down rather than stopping
// a determined one. The hard ceiling is the Gemini quota on the owner's key.
const hits = new Map<string, { minute: number[]; day: number[] }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip) || { minute: [], day: [] };
  rec.minute = rec.minute.filter((t) => now - t < MINUTES_WINDOW);
  rec.day = rec.day.filter((t) => now - t < DAY_WINDOW);
  if (rec.minute.length >= PER_MINUTE || rec.day.length >= PER_DAY) {
    hits.set(ip, rec);
    return true;
  }
  rec.minute.push(now);
  rec.day.push(now);
  hits.set(ip, rec);
  return false;
}

// Facts the model is allowed to repeat. Anything not written here does not exist
// as far as it is concerned — the numbers and the turnaround are the studio's own
// published answers, and prices arrive from the page so this can never drift from
// what the store actually charges.
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
Alongside the catalog figures above, these are the store prices, read from the live page:
__PRICES__
Payment is through Paystack on the site: card, mobile money or Apple Pay, in Ghana
cedis. A buyer who would rather bank with the studio directly can press "Transfer to our
account" on any priced card and get the studio's own bank details. Either way the payment
is confirmed by the studio in the Paystack dashboard and a human picks
the job up on WhatsApp - there is no automatic delivery of anything.

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
  questions. Be direct and friendly, like a studio that answers its own phone.`;

function priceLines(items: unknown): string {
  if (!Array.isArray(items) || !items.length) return "(no prices are listed right now)";
  return items
    .slice(0, MAX_PRICES)
    .map((raw) => {
      const it = (raw || {}) as Record<string, unknown>;
      const name = String(it.name ?? "").slice(0, 80);
      const price = Number(it.price);
      const term = it.term ? ` per ${String(it.term).slice(0, 30)}` : "";
      if (!name || !isFinite(price) || price <= 0) return "";
      return `- ${name}: GH₵${price.toLocaleString("en-GB")}${term}`;
    })
    .filter(Boolean)
    .join("\n") || "(no prices are listed right now)";
}

// The browser sends the chat so far so that a follow-up reaches the model with its
// context. Two things are fixed up here: the model wants the two voices to
// alternate strictly and to open on the visitor, and the question being answered
// is already the last turn the browser sent — so it is dropped and re-added, which
// keeps it present even if the browser trimmed it away.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

// Upload a file to Gemini Files API via resumable upload and return the file resource name.
async function uploadFile(key: string, name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const startRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
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
  const uploadRes = await fetch(uploadUrl, {
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

// Poll a Gemini file resource until it is ACTIVE or the deadline passes.
async function waitActive(key: string, fileName: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) throw new Error("poll-" + res.status);
    const data = await res.json();
    if (data.state === "ACTIVE") return;
    if (data.state === "FAILED") throw new Error("file-failed");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("upload-timeout");
}

// Delete a Gemini file resource (best-effort, called in finally).
async function deleteFile(key: string, fileName: string): Promise<void> {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": key },
    });
  } catch { /* best effort */ }
}

Deno.serve(async (req) => {
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

  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) return json({ error: "The studio has not switched the assistant on yet." }, 500);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (rateLimited(ip)) return json({ error: "slow" }, 429);

  const contentType = req.headers.get("content-type") || "";
  let q = "";
  let lang = "en";
  let history: unknown = [];
  let prices: unknown = [];
  const fileEntries: { name: string; type: string; bytes: Uint8Array }[] = [];

  // Accept both multipart FormData (new, with files) and JSON (legacy, text-only).
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    q = String(form.get("q") || "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
    lang = String(form.get("lang") || "en");
    const hRaw = form.get("h");
    if (hRaw) { try { history = JSON.parse(String(hRaw)); } catch { history = []; } }
    const fileList = form.getAll("files");
    let totalBytes = 0;
    for (const f of fileList.slice(0, MAX_FILES)) {
      if (f instanceof File) {
        if (f.size > MAX_FILE_BYTES) continue;
        if (totalBytes + f.size > MAX_TOTAL_BYTES) continue;
        const buf = new Uint8Array(await f.arrayBuffer());
        fileEntries.push({ name: f.name, type: f.type || "application/octet-stream", bytes: buf });
        totalBytes += f.size;
      }
    }
  } else {
    let body: { q?: unknown; lang?: unknown; prices?: unknown; h?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send a question." }, 400);
    }
    q = String(body.q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
    lang = String(body.lang ?? "en");
    prices = body.prices;
    history = body.h;
  }

  if (q.length < 2 && fileEntries.length === 0) return json({ error: "Ask a question or attach a file." }, 400);

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
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";

  const uploadedNames: { name: string; mime: string }[] = [];
  try {
    // Upload each file to Gemini and wait for it to become ACTIVE.
    for (const file of fileEntries) {
      const fileName = await uploadFile(key, file.name, file.type, file.bytes);
      await waitActive(key, fileName);
      uploadedNames.push({ name: fileName, mime: file.type });
    }

    // Build the contents array: the question (or a default analysis prompt) plus file references.
    const userText = q || "Please identify and analyse the attached file.";
    const prompt = `Answer in ${LANGUAGE[code] || "English"}. ${userText}`;
    const parts: unknown[] = [{ text: prompt }];
    for (const up of uploadedNames) {
      parts.push({ fileData: { mimeType: up.mime, fileUri: `gs://${up.name}` } });
    }

    // Build conversation: history turns plus the final user turn with files.
    const histTurns = conversation(history, "");
    const contents = histTurns.slice(0, -1);
    contents.push({ role: "user", parts });

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: BRIEF.replace("__PRICES__", priceLines(prices)) }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );

    if (!upstream.ok) {
      console.error("gemini", upstream.status, (await upstream.text()).slice(0, 500));
      return json({ error: "The assistant is not answering right now." }, 502);
    }

    const data = await upstream.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text || "")
      .join(" ")
      .trim();
    if (!text) return json({ error: "empty" }, 502);
    return json({ answer: text.slice(0, 2000) });
  } catch (e) {
    console.error("assistant error", String(e));
    return json({ error: "The assistant could not process that." }, 500);
  } finally {
    // Always delete uploaded files to avoid storage costs and data retention.
    for (const up of uploadedNames) {
      await deleteFile(key, up.name);
    }
  }
});
