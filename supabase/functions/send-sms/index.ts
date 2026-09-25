// BrownHub SMS delivery — Supabase's "Send SMS" auth hook, pointed at Arkesel.
//
// Why this exists: Supabase's built-in provider is Twilio, and Twilio cannot
// reliably text a Ghanaian number without a Sender ID the networks approve over
// 2-3 weeks — it could not even text the owner to finish creating the account.
// Arkesel is Accra-based, routes directly onto MTN/Telecel/AT, and costs about
// GHS 0.022 per message instead of Twilio's $0.3741.
//
// How it is wired: Supabase itself calls this function. When a client asks to
// verify a phone number, GoTrue generates the 6-digit code, POSTs it here as
// { user: { ..., phone }, sms: { otp } }, and waits. An empty 200 tells Supabase
// the code arrived, so the number counts as verified when the client types it.
// Any non-2xx makes the sign-up fail with the message below. Nothing on the site
// calls this endpoint; js/accounts.js only ever talks to /auth/v1/* and
// /functions/v1/brownhub-assistant.
//
// Deploy (dashboard, same as brownhub-assistant):
//   1. Edge Functions -> Create a new function -> name it `send-sms` (the slug is
//      taken from the name field within a second of the page loading, and cannot
//      be changed later), paste this file, Deploy.
//   2. Edge Functions -> Secrets -> add ARKSEL_API_KEY and ARKSEL_SENDER (the
//      sender ID Arkesel has approved for you).
//   3. Authentication -> Auth Hooks -> Add hook -> Send SMS -> pick this function.
//      Supabase fills the Authorization header with its own service key, which is
//      also why "Verify JWT" can stay ON: a keyless caller gets 401 before it can
//      spend the SMS balance.
//   4. Authentication -> Sign In / Providers -> enable Phone last. Until then
//      js/accounts.js hides the phone step by itself.
//
// Keep the message under 160 characters: Arkesel bills per segment, and a
// two-segment code text is a worse experience than a shorter sentence.

const GATEWAY = "https://sms.arkesel.com/api/v2/sms/send";
const TIMEOUT = 8_000;

function fail(httpCode: number, text: string): Response {
  // Supabase shows `message` to its own logs and returns http_code to the client
  // flow, so the detail stays here rather than in the visitor's face.
  return new Response(
    JSON.stringify({ error: { http_code: httpCode, message: `Failed to send SMS: ${text}` } }),
    { status: httpCode, headers: { "content-type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  let body: { user?: { phone?: string | null }; sms?: { otp?: string } };
  try {
    body = await req.json();
  } catch {
    return fail(400, "expected a JSON body from Supabase");
  }

  const phone = (body.user && body.user.phone) || "";
  const otp = (body.sms && body.sms.otp) || "";
  // Rejecting here rather than letting the gateway decide: a bad number must not
  // cost money, and a caller with no phone in its JWT must not reach Arkesel at all.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return fail(400, `unusable phone number ${JSON.stringify(phone)}`);
  if (!/^\d{4,8}$/.test(otp)) return fail(400, "unusable one-time code");

  const key = Deno.env.get("ARKSEL_API_KEY") || "";
  const sender = Deno.env.get("ARKSEL_SENDER") || "";
  if (!key || !sender) return fail(500, "ARKSEL_API_KEY or ARKSEL_SENDER is not set on this project");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let res: Response;
  let raw = "";
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
    raw = await res.text();
  } catch (e) {
    return fail(502, `could not reach Arkesel: ${(e as Error).name}`);
  } finally {
    clearTimeout(timer);
  }

  // A 200 with an "invalid numbers" list is Arkesel's way of accepting the request
  // and then delivering nothing, so it counts as a failure here.
  let parsed: { status?: string; data?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep the raw text for the message below */
  }
  if (!res.ok || parsed.status !== "success" || parsed.data === undefined) {
    return fail(res.status === 402 ? 429 : 502, `${res.status} ${raw.slice(0, 200)}`);
  }
  const invalid = (parsed.data as { [k: string]: unknown })["invalid numbers"];
  if (Array.isArray(invalid) && invalid.length) {
    return fail(400, `Arkesel rejected the number: ${raw.slice(0, 200)}`);
  }

  return new Response("", { status: 200 });
});
