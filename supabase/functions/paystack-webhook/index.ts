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
// server call carries no Supabase token) and an unset key refuses everything
// rather than quietly accepting forged rows.
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
// Webhooks -> Live Secret Key), SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL.

const HOOK = "x-paystack-signature";
const MAX_BODY = 65536;

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Length check first, then every byte, so the answer does not leak how much of a
// guess matched.
async function signed(body: string, given: string | null): Promise<boolean> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!secret || !given || !/^[0-9a-f]{128}$/.test(given.trim())) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const want = hex(mac);
  const got = given.trim();
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
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

async function record(row: Record<string, unknown>): Promise<boolean> {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return false;
  // ignore-duplicates is the idempotency: Paystack retries a delivery it does not
  // like the answer to, and the (reference, event) key makes a retry land once.
  // PostgREST needs that key named, not merely guessed from the index.
  const res = await fetch(`${url}/rest/v1/payments?on_conflict=reference,event`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  return !!res && res.ok;
}

// A webhook that answers anything other than 2xx is retried, so a stored row must
// never be reported as a failure — but an unsigned request is refused outright.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413 });
  if (!(await signed(body, req.headers.get(HOOK)))) {
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
  const wanted = /charge|transaction|payment/i.test(row.event) && !!row.reference;
  if (wanted) {
    const ok = await record({
      reference: row.reference,
      event: row.event,
      amount_kobo: row.amount_kobo,
      currency: row.currency,
      channel: row.channel,
      status: row.status,
      customer_email: row.customer_email,
      item: row.item,
      paid_at: row.paid_at,
    });
    // Say so rather than answering 200 over a row that never landed: a silent
    // success here is how a payment ends up recorded nowhere twice over.
    if (!ok) return new Response(JSON.stringify({ error: "not stored" }), { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  // The reference is a public order number and the event name is not sensitive;
  // nothing else about a client is written to the logs.
  if (wanted) console.log(`paystack ${row.event} ${row.reference}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
