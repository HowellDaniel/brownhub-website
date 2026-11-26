// BrownHub capture — the studio's own record of who visited and who asked for a quote.
//
// Three jobs, one file, because all three need the same guards:
//   POST /capture/lead      a name and WhatsApp number left in the quote card
//   POST /capture/visit     one anonymous page view, only when the visitor allowed
//                           "Analytics" in the cookie centre
//   POST /capture/feedback  a rating and optional note left on the help page
//
// Why a function instead of the browser writing to the table itself, the way the
// chat transcript does (js/accounts.js): a browser-side insert needs an insert
// policy for the public anon key, and that key is in the repo, so anyone who
// reads it could file a thousand fake leads a minute. Here the tables are closed
// to anon entirely — the only writer is this file, holding the service role key —
// and every write passes an Origin check, a size check and a per-address limit.
//
// Privacy, because the site promises it in three places:
//   - No IP address is ever stored. A visit keeps sha256(TRACK_SALT | ip | day),
//     which is stable enough to count one person once a day and cannot be turned
//     back into an address without the salt. The salt lives in Supabase's secret
//     store; it is not in this file and not in the repo.
//   - A visit keeps the referrer's HOST, never its full URL: a query string on a
//     link someone arrived from can carry a person's identity.
//   - No cookie is set here, and nothing is written to the visitor's device.
//   - A lead is a name and a number someone chose to type, kept so the studio can
//     reply. It is deleted on request like an enquiry (privacy.html, "Deleting
//     your information").
//   - A feedback row keeps the number exactly as it was typed next to the dialable
//     form of it, and one word from ALERTS saying whether the studio's own text went
//     out. Neither leaves the closed table, and neither is in the text message.
//
// Deploy after editing this file (same runbook as bank-details):
//   curl -X POST -H "Authorization: Bearer $(cat /tmp/bh_tok)" \
//     -F "file=@supabase/functions/capture/index.ts" \
//     -F 'metadata={"entrypoint_path":"index.ts","import_map_path":"","verify_jwt":false,"name":"capture"}' \
//     "https://api.supabase.com/v1/projects/rmvyrfqyxgupwuzxadyx/functions/deploy?slug=capture"
// "Verify JWT" is OFF for the same reason bank-details has it off: store.js and
// leads.js carry no Supabase key, and Origin is the gate that actually matters.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in this project for
// paystack-webhook) and TRACK_SALT, any long random string:
//   curl -X POST -H "Authorization: Bearer $(cat /tmp/bh_tok)" \
//     -H "Content-Type: application/json" \
//     --data-binary @<(printf '[{"name":"TRACK_SALT","value":"%s"}]' "$(openssl rand -hex 32)") \
//     https://api.supabase.com/v1/projects/rmvyrfqyxgupwuzxadyx/secrets
// The table side lives in sql/supabase-schema.sql (leads, visits, feedback).

// GitHub 301s the old Pages URL to the custom domain, so a browser can never
// present howelldaniel.github.io as the origin of a request from this site.
const SITES = ["https://www.brownhub283.com"];

const MAX_BODY = 6_000;
const DAY_WINDOW = 86_400_000;
const MINUTE_WINDOW = 60_000;
// A visitor can honestly want to ask twice a day; a script can want far more.
const LEADS_PER_MINUTE = 3;
const LEADS_PER_DAY = 12;
// One page view per page load is a lot of rows on a busy day, so the ceiling is
// the site's own page count with room to spare.
const VISITS_PER_MINUTE = 20;
const VISITS_PER_DAY = 400;
// A rating is one tap and a note is rarer still, so this sits well above anyone
// being genuine on two pages and far below anything that is looping.
const FEEDBACK_PER_MINUTE = 6;
const FEEDBACK_PER_DAY = 20;
// The one field a caller cannot be allowed to invent: which kind of note this is.
const TOPICS = ["answer", "page", "other"];
// The owner reads this text, not the database. A slug like `project-cost` is a key
// written for a stylesheet, so the answers it names are held here in words.
const ARTICLE_LABELS: Record<string, string> = {
  "design-services": "Design services",
  "project-cost": "Project cost",
  "project-time": "Project timeline",
  "order-an-item": "Ordering an item",
  "print-files": "Print files",
  "where-is-the-studio": "Where the studio is",
  "get-started": "Getting started",
  questions: "the help page",
  help: "the help page",
};
// Filed on the row, because the function's own console is not readable from anywhere
// a browser key can reach — see the note above `alertOwner`.
const ALERTS = ["sent", "rejected", "timeout", "unconfigured"];
const OWNER_MSISDN = "233535583460";
const SMS_GATEWAY = "https://sms.arkesel.com/api/v2/sms/send";

// Best effort, like the assistant's: an isolate is short-lived and shares no
// store, so this slows one visitor down rather than stopping a determined one.
type Hits = { minute: number[]; day: number[] };
const leads = new Map<string, Hits>();
const views = new Map<string, Hits>();
const feedbacks = new Map<string, Hits>();

function limited(store: Map<string, Hits>, ip: string, perMinute: number, perDay: number): boolean {
  const now = Date.now();
  const rec: Hits = store.get(ip) || { minute: [], day: [] };
  rec.minute = rec.minute.filter((t) => now - t < MINUTE_WINDOW);
  rec.day = rec.day.filter((t) => now - t < DAY_WINDOW);
  if (rec.minute.length >= perMinute || rec.day.length >= perDay) {
    store.set(ip, rec);
    return true;
  }
  rec.minute.push(now);
  rec.day.push(now);
  store.set(ip, rec);
  return false;
}

function allowed(origin: string | null): boolean {
  return origin !== null && SITES.includes(origin);
}

function json(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // Neither endpoint is anything a cache should hold on to: a lead is a
      // person's answer, and a visit is counted once per load.
      "cache-control": "no-store, max-age=0",
      "access-control-allow-origin": origin || "null",
      "vary": "origin",
    },
  });
}

// Trim to a plain string and cap it, so a stray object can never reach the table.
function str(v: unknown, max: number): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

// Only the scheme + host of a referrer survives, for the same reason the full URL
// does not: the path and query of where someone came from are nobody's business.
function hostOf(v: unknown): string {
  const s = str(v, 400);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase().slice(0, 120) : "";
  } catch (_e) {
    return "";
  }
}

// The page field is a path on this site, and a path is the one part of a URL a
// visitor's own browsing could leak through, so anything odd-shaped is dropped.
function pathOf(v: unknown): string {
  const s = str(v, 200);
  if (!s) return "";
  try {
    const u = new URL(s, SITES[0]);
    if (u.hostname !== "www.brownhub283.com") return "";
    return (u.pathname || "/").slice(0, 120);
  } catch (_e) {
    return "";
  }
}

// A Ghana mobile number is ten digits, but visitors type their country code,
// spaces, brackets and dashes, and a landline or a diaspora number is legitimate.
function digitsOf(s: string): string {
  return s.replace(/[^\d]/g, "");
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Both helpers run on the same two secrets; a missing one is a 502, never a silent row.
function restHeaders(): Record<string, string> | null {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return null;
  return { url, apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function write(table: string, row: Record<string, unknown>): Promise<boolean> {
  const headers = restHeaders();
  if (!headers) return false;
  const { url, ...auth } = headers;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...auth, Prefer: "return=minimal" },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return !!res && res.ok;
}

// PostgREST hands the new row back only when it is asked for. The feedback row needs
// that id: its alert outcome is filed after the text has been attempted, and a row
// nobody can name cannot be updated. Zero means the row is not there.
async function insert(table: string, row: Record<string, unknown>): Promise<number> {
  const headers = restHeaders();
  if (!headers) return 0;
  const { url, ...auth } = headers;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...auth, Prefer: "return=representation" },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res || !res.ok) return 0;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? Number(rows[0].id) || 0 : 0;
}

async function mark(id: number, status: string): Promise<void> {
  const headers = restHeaders();
  if (!headers || !id || ALERTS.indexOf(status) < 0) return;
  const { url, ...auth } = headers;
  const res = await fetch(`${url}/rest/v1/feedback?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...auth, Prefer: "return=minimal" },
    body: JSON.stringify({ alert_status: status }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res || !res.ok) console.log("feedback alert status could not be filed");
}

// Delivery uses the same Arkesel rail as paystack-webhook. The text names the
// score and answer only; a visitor's words stay in the protected feedback table.
// It answers with one of ALERTS so the outcome can be filed on the row — a console
// line inside a short-lived isolate is not a record anyone can read afterwards.
async function alertOwner(summary: string): Promise<string> {
  const key = Deno.env.get("ARKSEL_API_KEY") || "";
  const sender = Deno.env.get("ARKSEL_SENDER") || "";
  if (!key || !sender) {
    console.log("feedback alert skipped: ARKSEL_API_KEY or ARKSEL_SENDER is not set");
    return "unconfigured";
  }
  const res = await fetch(SMS_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": key },
    body: JSON.stringify({ sender, recipients: [OWNER_MSISDN], message: summary }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res) {
    console.log("feedback alert not sent: Arkesel did not answer");
    return "timeout";
  }
  const answer = await res.text().catch(() => "");
  if (!res.ok || answer.indexOf('"success"') < 0) {
    console.log(
      `feedback alert not delivered: Arkesel HTTP ${res.status}${answer.indexOf("invalid") >= 0 ? ", number rejected" : ""}`
    );
    return "rejected";
  }
  return "sent";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (!allowed(origin)) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin || "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      },
    });
  }

  if (req.method !== "POST") return json({ error: "Use POST." }, origin, 405);
  if (!allowed(origin)) return json({ error: "off" }, origin, 403);

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return json({ error: "too big" }, origin, 413);
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch (_e) {
    return json({ error: "Send JSON." }, origin, 400);
  }

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();

  const kind = new URL(req.url).pathname.split("/").pop() || "";

  if (kind === "visit") {
    if (limited(views, ip, VISITS_PER_MINUTE, VISITS_PER_DAY)) return json({ ok: true }, origin);
    // No salt means no daily dedupe. Counting the load anyway is the honest
    // degradation: page views stay right while unique visitors read high, and
    // nothing about a person is invented.
    const salt = Deno.env.get("TRACK_SALT") || crypto.randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    const device = ["phone", "tablet", "desktop"].indexOf(str(body.device, 12)) > -1
      ? str(body.device, 12)
      : "unknown";
    const ok = await write("visits", {
      day,
      page: pathOf(body.page) || "/",
      lang: str(body.lang, 8).toLowerCase() || "en",
      referrer: hostOf(body.referrer),
      device,
      visitor: (await sha256(`${salt}|${ip}|${day}`)).slice(0, 40),
    });
    return json({ ok }, origin, ok ? 200 : 502);
  }

  if (kind === "lead") {
    // The honeypot is a field a person never sees. Filled, it is a script, and the
    // answer is the same 200 a real lead gets, so a bot learns nothing.
    if (str(body._site, 200)) return json({ ok: true }, origin);
    if (limited(leads, ip, LEADS_PER_MINUTE, LEADS_PER_DAY)) return json({ error: "slow" }, origin, 429);
    const name = str(body.name, 120);
    const whatsapp = str(body.whatsapp, 32);
    const digits = digitsOf(whatsapp);
    if (name.length < 2) return json({ error: "A name of at least two letters." }, origin, 400);
    if (digits.length < 7 || digits.length > 15) {
      return json({ error: "That does not look like a WhatsApp number." }, origin, 400);
    }
    const ok = await write("leads", {
      name,
      // A ten-digit local number is stored in the international form the WhatsApp
      // link needs; anything longer is left exactly as it arrived, because a
      // diaspora number is not a Ghana number with one digit shaved off.
      whatsapp: digits.length === 10 && digits.startsWith("0") ? `233${digits.slice(1)}` : digits,
      whatsapp_as_typed: whatsapp,
      interest: str(body.interest, 80),
      page: pathOf(body.page),
      lang: str(body.lang, 8).toLowerCase() || "en",
      referrer: hostOf(body.referrer),
    });
    if (!ok) return json({ error: "The studio's list could not be reached." }, origin, 502);
    return json({ ok: true }, origin);
  }

  if (kind === "feedback") {
    // The same honeypot, the same quiet 200: a script that fills the field nobody
    // sees is answered exactly as a person is, so it learns nothing about the gate.
    if (str(body._site, 200)) return json({ ok: true }, origin);
    if (limited(feedbacks, ip, FEEDBACK_PER_MINUTE, FEEDBACK_PER_DAY)) return json({ error: "slow" }, origin, 429);

    const rawVote = str(body.vote, 8).toLowerCase();
    const vote = rawVote === "yes" || rawVote === "no" ? rawVote : "";
    const rawRating = Number(body.rating);
    const rating = Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5 ? rawRating : null;
    const message = str(body.message, 2000);
    // Nothing scored and nothing written is not feedback, and an empty row would
    // distort the studio's own numbers.
    if (!vote && !rating && !message) return json({ error: "Nothing to record." }, origin, 400);

    const rawTopic = str(body.topic, 24).toLowerCase();
    const topic = TOPICS.indexOf(rawTopic) > -1 ? rawTopic : "other";
    // Which part of the page the note is about, kept as the short label the page
    // puts on itself. Anything odd-shaped is filed against the page as a whole.
    const rawArticle = str(body.article, 40).toLowerCase();
    const article = /^[a-z][a-z0-9_-]{0,39}$/.test(rawArticle) ? rawArticle : "help";

    const asTyped = str(body.contact, 32);
    const digits = digitsOf(asTyped);
    // `contact` stays blank unless the number could actually be dialled back, so the
    // studio never holds a name or a joke as a phone number — but the typed form rides
    // along with it, because a visitor who wrote one did offer to be contacted, and a
    // row that dropped it silently told the studio nobody had.
    const contact = digits.length >= 7 && digits.length <= 15 ? digits : "";

    const detail = [
      rating ? `${rating}/5` : "note",
      message ? "note" : "",
      contact ? "reply wanted" : asTyped ? "number unclear" : "",
    ].filter(Boolean).join(", ");
    const summary = `BrownHub feedback: ${detail} on ${ARTICLE_LABELS[article] || "the help page"}`.slice(0, 160);
    const id = await insert("feedback", {
      topic,
      vote,
      rating,
      article,
      message,
      contact,
      contact_as_typed: asTyped,
      page: pathOf(body.page),
      lang: str(body.lang, 8).toLowerCase() || "en",
    });
    if (!id) return json({ ok: false }, origin, 502);
    const status = await alertOwner(summary);
    await mark(id, status);
    return json({ ok: true }, origin);
  }

  return json({ error: "Unknown" }, origin, 404);
});
