// BrownHub SMS delivery — Supabase's "Send SMS" auth hook, pointed at Arkesel.
//
// Why this exists: Supabase's built-in provider is Twilio, and Twilio cannot
// reliably text a Ghanaian number without a Sender ID the networks approve over
// 2-3 weeks — it could not even text the owner to finish creating the account.
// Arkesel is Accra-based, routes directly onto MTN/Telecel/AT, and costs about
// GHS 0.022 per message instead of Twilio's $0.3741.
//
// How it is wired: Supabase itself calls this function. When a client asks to
// verify a phone number, GoTrue generates the 6-digit code, POSTs it as
// { metadata, user: { ..., phone }, sms: { otp } } and waits. A 204 with no body
// tells Supabase the code arrived, so the number counts as verified once the
// client types it. Anything else fails the request. (A 200 is only accepted if it
// announces application/json, which an empty body does not, hence 204.) Nothing
// on the site calls this endpoint; js/accounts.js only ever talks to /auth/v1/*
// and /functions/v1/brownhub-assistant.
//
// Deploy (dashboard, same as brownhub-assistant):
//   1. Edge Functions -> Create a new function -> name it `send-sms` (the slug is
//      taken from the name field within a second of the page loading, and cannot
//      be changed later), paste this file, Deploy. Turn "Verify JWT" OFF: Supabase
//      signs the call instead of authenticating it, so a JWT check would reject
//      every legitimate request and no code would ever arrive.
//   2. Edge Functions -> Secrets -> add ARKSEL_API_KEY, ARKSEL_SENDER and
//      SEND_SMS_HOOK_SECRET (the same `v1,whsec_...` string that is registered on
//      the hook, so the two can never drift apart).
//   3. Authentication -> Auth Hooks -> Send SMS: URI
//      https://<project>.supabase.co/functions/v1/send-sms, secret `v1,whsec_...`.
//      Supabase requires that exact shape: `|` separates multiple secrets and the
//      key after `whsec_` must be 32-88 base64 characters.
//   4. Authentication -> Sign In / Providers -> enable Phone last. Until then
//      js/accounts.js hides the phone step by itself.
//
// Keep the message under 160 characters: Arkesel bills per segment, and a
// two-segment code text is a worse experience than a shorter sentence.

const GATEWAY = "https://sms.arkesel.com/api/v2/sms/send";
// Supabase gives up on a hook after 5 seconds and retries it three times, so this
// stops asking Arkesel before that deadline turns a slow send into a duplicate one.
const TIMEOUT = 4_000;
// A retry carries the *identical* body — same number, same code — so acting on it
// again would charge a second text for one client action. One number+code pair is
// dispatched once per window and any repeat is answered as already delivered.
// Definitive refusals (no credit, rejected number) are a 200 to Supabase and so are
// never retried; only a timeout or transport error brings a second call here.
const RETRY_WINDOW = 90_000;
const acted = new Map<string, number>();

function firstAttempt(key: string): boolean {
  const now = Date.now();
  const seen = acted.get(key);
  if (seen !== undefined && now - seen < RETRY_WINDOW) return false;
  acted.set(key, now);
  if (acted.size > 500) {
    for (const [k, at] of acted) if (now - at >= RETRY_WINDOW) acted.delete(k);
  }
  return true;
}

// Same tolerance the webhook libraries use.
const CLOCK_SKEW = 5 * 60;

// Supabase reads a failure out of the *body of a 200*: `{"error":{http_code,message}}`
// is what reaches the visitor. Any other status is replaced by its own generic
// "Invalid payload sent to hook", which is why this returns 200 too. `detail` is the
// vendor-grade reason for the logs; `forVisitor` is what a stranger gets to read.
function fail(httpCode: number, detail: string, forVisitor: string): Response {
  console.log(`send-sms ${httpCode}: ${detail}`);
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message: forVisitor } }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function b64bytes(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// Supabase sends webhook-id, webhook-timestamp and webhook-signature, and the
// signature is HMAC-SHA256 over `<id>.<unix seconds>.<raw body>`, base64'd, tagged
// `v1,`. Without this check the endpoint is an open relay that will text any number
// a stranger chooses, paid for out of BrownHub's balance.
async function signedBySupabase(req: Request, raw: string): Promise<boolean> {
  const id = req.headers.get("webhook-id") || "";
  const stamp = req.headers.get("webhook-timestamp") || "";
  const given = req.headers.get("webhook-signature") || "";
  const configured = Deno.env.get("SEND_SMS_HOOK_SECRET") || "";
  if (!id || !stamp || !given || !configured) return false;
  const seconds = Number(stamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > CLOCK_SKEW) return false;

  const body = new TextEncoder().encode(`${id}.${stamp}.${raw}`);
  // Two or more registered secrets arrive as `v1,aaa, v1,bbb`, so a part is read
  // by splitting on the comma and taking what follows — not by trimming a prefix.
  const offered = given.split(" ").map((p) => p.split(",")).filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!offered.some((s) => s)) return false;

  // `|` separates the secrets this hook was registered with; any one of them
  // matching is enough, which is what lets a key be rotated without downtime.
  for (const entry of configured.split("|")) {
    const key = entry.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
    if (key.length < 32) continue;
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "raw", b64bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
      );
    } catch {
      continue;
    }
    for (const sig of offered) {
      if (!sig) continue;
      try {
        if (await crypto.subtle.verify("HMAC", cryptoKey, b64bytes(sig), body)) return true;
      } catch {
        /* a malformed signature is simply not this one */
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  let body: {
    user?: { phone?: string | null };
    sms?: { otp?: string; phone?: string; sms_type?: string };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, `expected JSON, got ${raw.length} bytes of ${req.headers.get("content-type")}`, "The verification request was malformed.");
  }

  if (!(await signedBySupabase(req, raw))) {
    return fail(401, "rejected an unsigned or wrongly signed call", "This endpoint only answers Supabase.");
  }

  // GoTrue always fills sms.phone, but sends user only when one already exists,
  // so the number is read from the sms object first. It also hands it over without
  // its leading "+", which Arkesel would read as a different country, so put it back.
  const given = ((body.sms && body.sms.phone) || (body.user && body.user.phone) || "").trim();
  const phone = /^[+]?[1-9]\d{6,14}$/.test(given) ? (given.charAt(0) === "+" ? given : "+" + given) : "";
  const otp = (body.sms && body.sms.otp) || "";
  // Rejecting here rather than letting the gateway decide: a bad number must not
  // cost money, and a caller Supabase did not sign for must not reach Arkesel at all.
  if (!phone) {
    return fail(400, `unusable phone ${JSON.stringify(given)} in a body with keys ${Object.keys(body)}`,
      "That phone number is not in a form we can text.");
  }
  if (!/^\d{4,8}$/.test(otp)) {
    return fail(400, `unusable code of ${otp.length} characters in a body with keys ${Object.keys(body)}`,
      "The verification code was missing.");
  }

  const key = Deno.env.get("ARKSEL_API_KEY") || "";
  const sender = Deno.env.get("ARKSEL_SENDER") || "";
  if (!key || !sender) return fail(500, "ARKSEL_API_KEY or ARKSEL_SENDER is not set on this project", "Text messaging is not set up yet.");

  // Marked before the request rather than after it: the send that this call is
  // waiting on may well succeed even if we time out reading it, and the whole point
  // is to spend one message per code.
  if (!firstAttempt(phone + "|" + otp)) {
    console.log(`send-sms: repeat call for ${phone.slice(0, 7)}… with the same code, answered without a second text`);
    return new Response(null, { status: 204 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let res: Response;
  let sent = "";
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "api-key": key },
      body: JSON.stringify({
        sender: sender,
        recipients: [phone],
        // No expiry is quoted: how long a code lives is Supabase's own "Timebox"
        // setting, and a number here would go stale the day that changes.
        message: `BrownHub verification code: ${otp}. Enter it to finish setting up your account.`
      })
    });
    sent = await res.text();
  } catch (e) {
    return fail(502, `could not reach Arkesel: ${(e as Error).name}`, "The text-message service did not answer in time.");
  } finally {
    clearTimeout(timer);
  }

  // A 200 with an "invalid numbers" list is Arkesel's way of accepting the request
  // and then delivering nothing, so it counts as a failure here.
  let parsed: { status?: string; data?: unknown } = {};
  try {
    parsed = JSON.parse(sent);
  } catch {
    /* keep the response text for the message below */
  }
  if (!res.ok || parsed.status !== "success" || parsed.data === undefined) {
    return fail(res.status === 402 ? 429 : 502, `Arkesel ${res.status}: ${sent.slice(0, 200)}`,
      res.status === 402 ? "BrownHub is out of text-message credit." : "The message could not be sent.");
  }
  const invalid = (parsed.data as { [k: string]: unknown })["invalid numbers"];
  if (Array.isArray(invalid) && invalid.length) {
    return fail(400, `Arkesel rejected the number: ${sent.slice(0, 200)}`, "Your network refused the message. Try again or reach us on WhatsApp.");
  }

  return new Response(null, { status: 204 });
});
