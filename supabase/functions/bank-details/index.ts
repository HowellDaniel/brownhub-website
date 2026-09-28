// BrownHub bank details — hands the studio's own transfer account to a buyer who
// asks for it, instead of printing it on a public page.
//
// Why this exists: the owner wants a "Bank transfer" option that carries *his*
// account, but Paystack's checkout frame is a cross-origin iframe whose transfer
// instructions their partner bank mints per transaction, and no dashboard setting
// replaces them. Anything written into js/store.js or a dictionary is served to
// the whole internet, cached by the service worker and kept in git forever, so the
// number lives here instead — in Supabase's secret store, read at request time and
// returned with no-store. It is still reachable by anyone who asks politely; a
// buyer has to be able to read it. What this does buy is that it is not printed,
// indexed, cached or committed anywhere.
//
// LIVE at /functions/v1/bank-details. "Verify JWT" is OFF: the site's store.js
// carries no Supabase key, and Origin is the gate that matters here — a browser
// always sends it and a page cannot forge another site's.
//
// Redeploy after editing this file (see the runbook in memory):
//   curl -X POST -H "Authorization: Bearer $(cat /tmp/bh_tok)" \
//     -F "file=@supabase/functions/bank-details/index.ts" \
//     -F 'metadata={"entrypoint_path":"index.ts","import_map_path":"","verify_jwt":false,"name":"bank-details"}' \
//     "https://api.supabase.com/v1/projects/rmvyrfqyxgupwuzxadyx/functions/deploy?slug=bank-details"
// The secret is a separate thing: Settings -> API Keys -> Secrets ->
// BANK_DETAILS, a JSON object of {bank, name, number}. It is never in this file.

// GitHub 301s the old Pages URL here, so a browser can never present
// howelldaniel.github.io as the origin of a request from this site.
const SITES = ["https://www.brownhub283.com"];

// Best effort, like the assistant's: an isolate is short-lived and shares no
// store, so this slows a scrape down rather than stopping a determined one.
const MINUTES_WINDOW = 60_000;
const PER_MINUTE = 6;
const DAY_WINDOW = 86_400_000;
const PER_DAY = 60;

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

function allowed(origin: string | null): boolean {
  return origin !== null && SITES.includes(origin);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // A payment account is not something an intermediary may keep.
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
    },
  });
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

  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!allowed(origin)) return json({ error: "off" }, 403);

  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (rateLimited(ip)) return json({ error: "slow" }, 429);

  const raw = Deno.env.get("BANK_DETAILS") || "";
  let details: { bank?: string; name?: string; number?: string };
  try {
    details = JSON.parse(raw);
  } catch (_e) {
    // Nothing stored yet, or it was stored malformed: say so without echoing the
    // value back, since an error body is as readable as a success body.
    return json({ error: "The studio has not stored its transfer details yet." }, 500);
  }
  if (!details.bank || !details.name || !details.number) {
    return json({ error: "The studio's transfer details are incomplete." }, 500);
  }

  return json({
    bank: String(details.bank).slice(0, 80),
    name: String(details.name).slice(0, 80),
    number: String(details.number).replace(/[\s-]/g, "").slice(0, 34),
  });
});
