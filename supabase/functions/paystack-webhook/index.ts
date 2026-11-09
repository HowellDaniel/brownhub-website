// BrownHub Paystack webhook — the receiver Paystack's liveWebhookUrl points at.
//
// Why this exists: the dashboard had both URL fields aimed at the retired
// howelldaniel.github.io page, which is a redirect now, and a static GitHub Pages
// site cannot accept a server-to-server POST at all. A webhook URL that goes
// nowhere is worse than none: Paystack retries against it forever and the owner
// reads it as "webhooks are set up". This function makes the claim true, and it
// closes the one gap the checkout left open — a buyer who closes the Paystack
// popup to go and transfer does not fire our JavaScript callback, so the paid
// note can be missing while the money still lands. Paystack's own notification
// does not depend on the buyer's browser staying open.
//
// Trust comes from the signature, not from the network: Paystack signs the exact
// request body with the account's live secret key, HMAC-SHA512, hex, in
// `x-paystack-signature`. So "Verify JWT" is OFF on this function (a server to
// server call carries no Supabase token) and a request with no signature header at
// all is refused outright — none of Paystack's deliveries arrive without one.
//
// A request that DOES carry a signature but fails to verify is no longer thrown
// away. It is filed with signature_status 'stale' and it shouts. That case is
// Paystack talking to us through a key we no longer hold, and the old behaviour —
// 401 and discard — is how two real charges (GHS 450 and GHS 250) reached the bank
// with no row, no text and no hint that the rail had died. Recording does not need
// to trust a payload; only announcing it as settled money does.
//
// That means this function holds the sk_live... key, the same one that can move
// money through Paystack's API. It lives only in Supabase's secret store, is used
// only to compute an HMAC, and is never returned, logged or sent anywhere — the
// same place GEMINI_API_KEY and ARKSEL_API_KEY already sit. Nothing on the site
// can read it: the page never talks to this endpoint.
//
// Live at /functions/v1/paystack-webhook. Redeploy after editing (runbook in memory):
//   curl -X POST -H "Authorization: Bearer $(cat /tmp/bh_tok)" \
//     -F "file=@supabase/functions/paystack-webhook/index.ts" \
//     -F 'metadata={"entrypoint_path":"index.ts","import_map_path":"","verify_jwt":false,"name":"paystack-webhook"}' \
//     "https://api.supabase.com/v1/projects/rmvyrfqyxgupwuzxadyx/functions/deploy?slug=paystack-webhook"
// Secrets it reads and never prints: PAYSTACK_SECRET_KEY (Settings -> API Keys &
// Webhooks -> Live Secret Key), SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL, plus
// ARKSEL_API_KEY and ARKSEL_SENDER for the owner's transaction alert below.

const HOOK = "x-paystack-signature";
const MAX_BODY = 65536;

// How much to believe a delivery, per verify() below.
type Trust = "ok" | "stale" | "missing";

// One rail-warning text per day, not per delivery: a single payment arrives as
// several events, and an owner alerted thirty times learns nothing beyond being
// annoyed.
const RAIL_WINDOW_HOURS = 24;

// Paystack's own "notify me" switches (Settings -> Preferences) have no API and
// sit behind his login, so the alert that actually reaches him is built on the
// rail this function already stands on. One text per payment, no more.
const OWNER_MSISDN = "233535583460";
const SMS_GATEWAY = "https://sms.arkesel.com/api/v2/sms/send";

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Three answers, not two. A delivery with no usable signature header was never
// sent by Paystack; one signed with 128 hex characters that still does not match
// is Paystack reaching us through a key we no longer hold. Only the second is worth
// a row, and it is the one that must never pass unnoticed.
async function verify(body: string, given: string | null): Promise<Trust> {
  const got = (given || "").trim();
  if (!/^[0-9a-f]{128}$/.test(got)) return "missing";
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!secret) return "stale";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const want = hex(mac);
  // Length check first, then every byte, so the answer does not leak how much of a
  // guess matched.
  if (got.length !== want.length) return "stale";
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0 ? "ok" : "stale";
}

// A field the owner will read in the table editor, so cap the shape rather than
// trusting an upstream payload to be tidy.
function text(v: unknown, max: number): string | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Paystack has sent this both as an ISO string and as whole seconds, and a number
// going into a timestamptz column fails the insert, which retries forever.
function stamp(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e11 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = text(v, 40);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function paidEvent(body: Record<string, any>) {
  const data = (body && body.data) || {};
  const meta = data.metadata || {};
  const custom = Array.isArray(meta.custom_fields) ? meta.custom_fields : [];
  const marked = custom.find((c: any) => c && c.variable_name === "bh_item");
  const reference = text(data.reference, 40) || text((data.payments || [])[0]?.reference, 40);
  return {
    reference,
    event: text(body.event, 60) || "unknown",
    amount_kobo: Number.isSafeInteger(Number(data.amount)) ? Number(data.amount) : null,
    currency: text(data.currency, 8),
    channel: text(data.channel, 40),
    status: text(data.status, 24),
    customer_email: text(data.customer_email, 160) || text(data.customer?.email, 160),
    item: text(marked?.value, 120) || text(meta.bh_item, 120),
    paid_at: stamp(data.paid_at),
  };
}

async function record(row: Record<string, unknown>): Promise<{ stored: boolean; isNew: boolean; id: number | null }> {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return { stored: false, isNew: false, id: null };
  // ignore-duplicates is the idempotency: Paystack retries a delivery it does not
  // like the answer to, and the (reference, event) key makes a retry land once.
  // PostgREST needs that key named, not merely guessed from the index.
  //
  // It answers `representation` rather than `minimal` so the call can tell a fresh
  // row from a swallowed redelivery: an empty array means the key already existed.
  // That is what keeps one payment from texting him twice. The rows read back are
  // never logged and never leave this function.
  const res = await fetch(`${url}/rest/v1/payments?on_conflict=reference,event`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  if (!res || !res.ok) return { stored: false, isNew: false, id: null };
  let isNew = true;
  let id: number | null = null;
  try {
    const written = await res.json();
    if (Array.isArray(written)) {
      isNew = written.length > 0;
      const first = written[0];
      if (first && Number.isSafeInteger(Number(first.id))) id = Number(first.id);
    }
  } catch (_e) {
    // An unreadable body is not a reason to lose the alert: a payment he is not
    // told about is the worse failure than a payment announced twice.
  }
  return { stored: true, isNew, id };
}

// Has the rail already been reported broken in the current window? The answer comes
// from the rows this function just wrote rather than from a second table, so there
// is nothing extra to provision and nothing that can drift out of step with the
// deliveries it is meant to summarise.
async function earlierStale(id: number | null): Promise<boolean> {
  if (id === null) return false;
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return false;
  const since = new Date(Date.now() - RAIL_WINDOW_HOURS * 3600e3).toISOString();
  const res = await fetch(
    `${url}/rest/v1/payments?select=id&signature_status=eq.stale` +
      `&id=lt.${id}&received_at=gt.${since}&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
    },
  ).catch(() => null);
  if (!res || !res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

// The reference is what he matches a buyer's claim against, the amount is what he
// cares about, and the channel says whether to expect it from a bank or a phone.
// "GHS" and not the cedi sign on purpose: SMS runs a 7-bit alphabet, and a glyph
// outside it drops the message into Unicode and halves what fits.
function alertText(row: Record<string, any>): string {
  // Tested for the type, not coerced: Number(null) is 0 and 0 is a safe integer,
  // so a missing amount would otherwise be texted to him as "GHS 0".
  const coins = typeof row.amount_kobo === "number" && Number.isSafeInteger(row.amount_kobo)
    ? row.amount_kobo / 100
    : null;
  const money = coins === null
    ? "an amount Paystack did not report"
    : `${row.currency || "GHS"} ${coins.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  const item = String(row.item || "an item the checkout did not name").slice(0, 40);
  const channel = String(row.channel || "an unknown channel").replace(/_/g, " ").slice(0, 30);
  const ref = String(row.reference || "").slice(0, 40);
  return `BrownHub paid: ${money} through ${channel} for ${item}. Ref ${ref}.`.slice(0, 160);
}

// The message for the rail itself being broken, which answers a different question
// from a payment: not "how much arrived" but "stop believing the payments tab".
// Named before the reference is dropped, because at 160 characters an SMS holds the
// fault or the order number, and the order number is already in the row.
function railText(): string {
  return "BrownHub RAIL DOWN: Paystack is sending payments our signing key cannot " +
    "verify. They are filed UNVERIFIED, none confirmed. Renew PAYSTACK_SECRET_KEY.";
}

async function alertOwner(message: string): Promise<void> {
  const key = Deno.env.get("ARKSEL_API_KEY") || "";
  const sender = Deno.env.get("ARKSEL_SENDER") || "";
  if (!key || !sender) {
    console.log("paystack alert skipped: ARKSEL_API_KEY or ARKSEL_SENDER is not set");
    return;
  }
  // Awaiting, but never answering on the result: the money is already stored, and
  // a 500 here makes Paystack redeliver the whole event over a text message.
  const res = await fetch(SMS_GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": key },
    body: JSON.stringify({ sender, recipients: [OWNER_MSISDN], message }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res) {
    console.log("paystack alert not sent: Arkesel did not answer");
    return;
  }
  const answer = await res.text().catch(() => "");
  if (!res.ok || answer.indexOf('"success"') < 0) {
    // Only the shape of the failure, never the key — it travels in a header.
    console.log(`paystack alert not delivered: Arkesel HTTP ${res.status}${answer.indexOf("invalid") >= 0 ? ", number rejected" : ""}`);
  }
}

// A stale signature still has to look like money before it earns a row. This is the
// only place where someone who guesses the URL could otherwise fill the table, and
// a charge payload without an amount, a currency or a status is not a charge.
function plausible(row: Record<string, any>): boolean {
  return typeof row.amount_kobo === "number" && !!row.currency && !!row.status;
}

// A webhook that answers anything other than 2xx is retried, so a stored row must
// never be reported as a failure — but a request with no readable signature is not
// Paystack at all, and is refused outright.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413 });
  const trust = await verify(body, req.headers.get(HOOK));
  if (trust === "missing") {
    return new Response(JSON.stringify({ error: "bad signature" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(body);
  } catch (_e) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const row = paidEvent(parsed);
  // Worth a row: an event about a payment moving. A subscription or invoice notice
  // has no payment reference of its own, so it files nothing. A refused charge does
  // carry one, and it lands with status "failed" so the difference is readable in
  // the table rather than hidden — the money question is always status = success.
  const wanted = /charge|transaction|payment/i.test(row.event) && !!row.reference &&
    (trust === "ok" || plausible(row));
  if (wanted) {
    const stored = await record({
      reference: row.reference,
      event: row.event,
      amount_kobo: row.amount_kobo,
      currency: row.currency,
      channel: row.channel,
      status: row.status,
      customer_email: row.customer_email,
      item: row.item,
      paid_at: row.paid_at,
      signature_status: trust,
    });
    // Say so rather than answering 200 over a row that never landed: a silent
    // success here is how a payment ends up recorded nowhere twice over.
    if (!stored.stored) return new Response(JSON.stringify({ error: "not stored" }), { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    // Only a row this call actually wrote, and only money that arrived. A refused
    // charge is a row he reads when asked about, not something to be texted about.
    if (stored.isNew) {
      if (trust !== "ok") {
        // The rail is talking and we have stopped believing it. One text per day,
        // then quiet — the row above is the record, this is the alarm.
        if (!(await earlierStale(stored.id))) await alertOwner(railText());
      } else if (String(row.status || "").toLowerCase() === "success") {
        await alertOwner(alertText(row));
      }
    }
  }
  // The reference is a public order number, the event name is not sensitive and the
  // trust word names only our own key state; nothing about a client is logged.
  if (wanted) console.log(`paystack ${row.event} ${row.reference} ${trust}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
