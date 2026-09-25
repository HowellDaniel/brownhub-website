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
// Supabase gives up on a hook after 5 seconds and retries it three times, so a
// slow Arkesel would otherwise be charged for two or three identical texts.
const TIMEOUT = 4_000;
// Same tolerance the webhook libraries use.
const CLOCK_SKEW = 5 * 60;

function fail(httpCode: number, text: string): Response {
  // Supabase's dispatcher only reads the status today — any non-2xx becomes
  // "Unexpected status code returned from hook" for the visitor — so this body is
  // for the project's own function logs, and keeps the detail out of the client.
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message: `Failed to send SMS: ${text}` } }),
    { status: httpCode, headers: { "content-type": "application/json" } }
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
  let body: { user?: { phone?: string | null }; sms?: { otp?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "expected a JSON body from Supabase");
  }

  if (!(await signedBySupabase(req, raw))) {
    return fail(401, "the request is not signed by this project");
  }

  const phone = (body.user && body.user.phone) || "";
  const otp = (body.sms && body.sms.otp) || "";
  // Rejecting here rather than letting the gateway decide: a bad number must not
  // cost money, and a caller Supabase did not sign for must not reach Arkesel at all.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return fail(400, `unusable phone number ${JSON.stringify(phone)}`);
  if (!/^\d{4,8}$/.test(otp)) return fail(400, "unusable one-time code");

  const key = Deno.env.get("ARKSEL_API_KEY") || "";
  const sender = Deno.env.get("ARKSEL_SENDER") || "";
  if (!key || !sender) return fail(500, "ARKSEL_API_KEY or ARKSEL_SENDER is not set on this project");

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
    return fail(502, `could not reach Arkesel: ${(e as Error).name}`);
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
    return fail(res.status === 402 ? 429 : 502, `${res.status} ${sent.slice(0, 200)}`);
  }
  const invalid = (parsed.data as { [k: string]: unknown })["invalid numbers"];
  if (Array.isArray(invalid) && invalid.length) {
    return fail(400, `Arkesel rejected the number: ${sent.slice(0, 200)}`);
  }

  return new Response(null, { status: 204 });
});
