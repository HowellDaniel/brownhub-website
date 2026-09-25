// BrownHub assistant — a question-answering proxy for the site's chat panel.
//
// Why this exists at all: the browser must never hold a model key. js/chat.js
// answers the common questions itself from its keyword intents, and only when
// none of them match does it POST here. This file is the only place the Gemini
// key is ever seen, and it lives in Supabase's secret store, not in this repo.
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

// Both origins serve the site after the brownhub283.com cutover: GitHub leaves the
// old Pages URL answering 200 rather than redirecting, so its chat must keep working.
const SITES = ["https://www.brownhub283.com", "https://howelldaniel.github.io"];
// Anything the model may be asked costs money or attention, so both are capped.
const MAX_QUERY = 600;
const MAX_PRICES = 20;
const MINUTES_WINDOW = 60_000;
const PER_MINUTE = 8;
const DAY_WINDOW = 86_400_000;
const PER_DAY = 120;

// Only the site's own origins, plus a local server for testing this wiring.
function allowed(origin: string | null): boolean {
  if (!origin) return true; // curl, and native apps that send no Origin
  if (SITES.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
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
const BRIEF = `You are the BrownHub robotic assistant, answering visitors on brownhub's own website.

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
ChrisPrintgh, Accra New Town, Accra, Greater Accra. Opening hours Mon-Fri, 9am-6pm GMT;
messages outside those hours are answered the next working day.

TURNAROUND (typical, not a promise)
Logos 2-4 days. Full brand identity about a week. Flyers, posters and social media kits
1-3 days. Books and company profiles depend on page count. Rush work can often be
arranged over WhatsApp.

CATALOG ITEMS ON THE SITE
ABS Board, All Types of Frames, Book Design (Inside and Cover), Flyer, Funeral Banner,
Pull Up Design Backdrop and Printing, Sample of Printing. Catalog items are not priced
on the page: their price is confirmed on WhatsApp from sizes, quantity and deadline.

GETTING IN TOUCH
WhatsApp +233 50 295 4543, call +233 59 387 2873, email howelldaniel533@gmail.com or
anghadaniel621@gmail.com. The site also has a contact form on the contact page, and a
WhatsApp catalog.

PAID PACKAGES AND PRICES
These are the only prices that exist, and they come from the live page:
__PRICES__
Payment is through Paystack on the site: card, mobile money or bank transfer, in Ghana
cedis. A payment is confirmed by the studio in the Paystack dashboard and a human picks
the job up on WhatsApp - there is no automatic delivery of anything.

CLIENT ACCOUNTS
The "My requests" panel signs people up with email and password. It keeps every request
they have sent, filters them by period, lets them re-order one, reset a password, and
optionally add a phone number.

THE SITE ITSELF
It is offered in 13 languages chosen from a menu at the top of the page, and it has a
privacy policy page. Voice notes recorded in the chat or on the Project details form are
emailed to the studio.

RULES YOU MUST KEEP
- Answer only about BrownHub, its services, this website, ordering, prices, delivery and
  contact. For anything else, say in one short line that you only know about BrownHub's
  design work, and offer WhatsApp or the contact form.
- Never invent a price, a discount, a timeline, a client, an award, a staff member, a
  policy or a statistic. If the fact is not above and not in the price list, say you are
  not sure and point to a human.
- Never guess what a specific print job costs.
- Reply in the language asked for, in plain sentences. No markdown, no asterisks, no
  headings, no emoji, no URLs - the chat window shows plain text and has its own buttons.
- Keep it under 110 words. Be direct and friendly, like a studio that answers its own
  phone.`;

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
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

  let body: { q?: unknown; lang?: unknown; prices?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send JSON with a question." }, 400);
  }
  const q = String(body.q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  if (q.length < 2) return json({ error: "Ask a question first." }, 400);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (rateLimited(ip)) return json({ error: "slow" }, 429);

  // The visitor's language comes from the site's own language menu, so the model
  // answers in the same tongue the rest of the page is already showing. Named,
  // because a bare "tw" is not something every model reads as Twi.
  const code = /^[a-z]{2}$/.test(String(body.lang ?? "")) ? String(body.lang) : "en";
  const LANGUAGE: Record<string, string> = {
    en: "English", fr: "French", es: "Spanish", pt: "Portuguese", ar: "Arabic",
    zh: "Chinese", de: "German", nl: "Dutch", it: "Italian", ru: "Russian",
    hi: "Hindi", sw: "Swahili", tw: "Twi"
  };
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: BRIEF.replace("__PRICES__", priceLines(body.prices)) }],
          },
          contents: [{ role: "user", parts: [{ text: `Answer in ${LANGUAGE[code] || "English"}. ${q}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    return json({ error: "The assistant could not reach its model." }, 502);
  }

  if (!upstream.ok) {
    // The provider's own wording is kept out of the visitor's hands; it goes to the
    // function log where the owner can read it.
    console.error("gemini", upstream.status, (await upstream.text()).slice(0, 500));
    return json({ error: "The assistant is not answering right now." }, 502);
  }

  const data = await upstream.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text || "")
    .join(" ")
    .trim();
  if (!text) return json({ error: "empty" }, 502);
  return json({ answer: text.slice(0, 1600) });
});
