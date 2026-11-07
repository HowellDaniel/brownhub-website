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

import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  fetch,
  env: Deno.env.get,
  now: Date.now,
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}));
