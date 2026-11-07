# BrownHub Studio Assistance: grounded multimodal model-first design

Date: 2026-11-07
Status: Approved by the owner on 2026-11-07; implementation authorized

## Purpose

Replace the assistant's brittle keyword-first behaviour with a grounded model-first assistant that can discuss design broadly, inspect uploaded media, compare designs with BrownHub's catalog, cite public research, and provide owner-approved redesign estimates.

The existing Gemini key remains server-side. The upgrade must not change Paystack prices, payment flows, contact details, catalog inventory, booking behaviour, or the site's visual design outside the chat panel.

## Reproduced current failures

On the live site on 2026-11-07:

- “Can you redesign my flyer within two days and how much would it cost?” returned the generic price intent and never reached Gemini.
- “What are some modern colour and layout ideas for a church anniversary flyer?” returned a generic catalog intent.
- “Suggest a sophisticated visual direction …” returned the greeting because the substring `hi` inside `sophisticated` matched the `hi` intent.
- A staged PNG plus “Identify this design and find a similar item in your catalog” caused one FormSubmit email request and zero assistant requests. The reply only said the document had been emailed.

The text-only Gemini connection itself answered when a question avoided all intent keywords. The primary defects are therefore routing, missing media transport/analysis, absent research grounding, and absent catalog/estimate data paths.

## Goals

1. Substantive questions reach Gemini with conversation context.
2. Images, PDFs, common Office documents, text files, and short videos are actually analysed.
3. An uploaded design receives a useful description and a visually grounded catalog comparison.
4. Public research supports creative ideas with safe source links.
5. Only BrownHub-owned data determines services, catalog matches, prices, and turnaround.
6. Redesign estimates use the approved rate card and remain subject to studio confirmation.
7. Model output, links, uploads, and errors are handled safely in every supported language.

## Non-goals

- No automatic payment, order placement, or promise that work has started.
- No general-purpose chatbot for unrelated subjects.
- No autonomous repricing of existing packages or catalog items.
- No printing quote inside the redesign estimate.
- No persistent public media gallery or long-term Supabase media store.
- No guarantee of exact visual equivalence or exact delivery time.

## Chosen approach and alternatives

### Chosen: grounded model-first

Keep deterministic answers only for exact commands and quick actions. Send substantive questions and every analysable attachment through Gemini. Add server-owned business data, media handling, catalog retrieval, search grounding, and structured response rendering.

### Rejected: patch the keyword-first router

Whole-word matching would fix the `sophisticated`/`hi` collision, but price, turnaround, flyer, logo, and other broad keywords would still prevent the model from answering nuanced questions. Attachment analysis would remain a separate brittle branch.

### Rejected: unrestricted general-purpose AI

Removing business grounding would risk invented prices, turnaround promises, clients, and policies. Public sources must never override BrownHub's own data.

## Components

### Browser: `js/chat.js`

- Route exact quick actions and explicit human/contact commands to deterministic responses.
- Route all other text to the assistant, including questions containing `price`, `flyer`, `logo`, `design`, or `turnaround`.
- Send staged attachments with the visitor's question instead of automatically emailing them.
- Preserve the existing composer, emoji, voice-note, history, retry, new-chat, sound, dragging, and WhatsApp-handoff behaviour.
- Render model text as text, never HTML.
- Render catalog matches, research links, and estimates through dedicated DOM builders using validated response data.
- Show an honest analysing state while waiting. Disable duplicate submission without blocking a later new question.
- Keep optional “send to the studio” handoff separate from AI analysis.

### Browser transport: `js/accounts.js`

- Replace the text-only assistant request with a multipart request containing `q`, `lang`, trimmed `h`, and up to three `files`.
- Do not send browser-supplied prices or catalog data as authority.
- Return the complete validated response envelope, not only an answer string.
- Continue anonymous transcript logging, but do not put file contents or data URLs into `chat_logs`.

### Server: `supabase/functions/brownhub-assistant/index.ts`

- Retain origin checks, publishable-key/JWT handling, per-IP request limits, server-held `GEMINI_API_KEY`, and language selection.
- Accept multipart and the existing JSON text request during the same release so a stale cached chat client fails safe rather than breaking.
- Validate count, byte size, declared MIME, file signature, and supported type at the boundary.
- Own all prompts, business facts, redesign rates, catalog retrieval, Gemini file references, research citation extraction, and estimate construction.
- Use the configured Gemini model's supported file/upload and search-grounding APIs. Probe the configured model before enabling each capability in production.
- Delete uploaded Gemini file references after the request finishes, including failure paths. Provider retention before deletion remains subject to Google's documented behaviour.

### Server-owned public data

Add a generated `data/assistant-catalog.json` derived from `catalog.html`, containing stable item IDs, names, categories, descriptions, and existing public image paths. Add a generator/check script so catalog drift fails verification.

The Edge Function fetches this file only from the BrownHub origin allowlist and caches it for five minutes. The browser cannot replace it with arbitrary catalog entries or prices. Catalog reference images are fetched only from paths declared by that file and only from the BrownHub origin.

The redesign rate card lives in the Edge Function, not in browser input. Existing store prices remain in `js/store.js`; this feature does not alter them.

## Media and response boundaries

Direct analysis accepts PNG, JPEG, WebP, PDF, DOCX, XLSX, PPTX, TXT, CSV, RTF, MP4, MOV, and WebM when the configured provider path supports the supplied format. Native provider support is used where available; otherwise bounded text extraction is used for modern Office documents. Legacy DOC/XLS/PPT, AI, PSD, EPS, SVG, archives, and encrypted files require an exported PDF or image for analysis and may still be sent through the optional studio handoff. No unsupported format receives a fabricated analysis.

The assistant answers the actual question first, gives up to three useful creative directions when ideas are requested, and avoids generic catalog deflection. Simple answers remain concise; creative and media-analysis answers may use up to 220 words plus match, source, and estimate cards. Visitor-facing model prose stays plain text without markdown or raw URLs.

New interface strings use the existing `T()`/dictionary system and follow the repository's full/tier dictionary coverage rules. Dynamic model answers use the visitor's selected language without being passed through the static dictionary.

## Request and response flow

1. The visitor asks a question, optionally with up to three files of at most 10 MB each and 30 MB in total.
2. The browser sends the current language, trimmed conversation, question, and files to the Edge Function.
3. The server validates the request and uploads or inlines supported media to Gemini without exposing the model key.
4. An analysis pass asks for a structured description: document/media type, visible text, purpose, layout, colours, imagery, style, design category, redesign scope, retrieval keywords, missing details, and whether external creative research would help.
5. Deterministic retrieval scores those keywords against BrownHub's server-owned catalog metadata and selects at most three candidates.
6. If research is useful, a separate research pass uses Google Search grounding for public design ideas or trends. Only provider-returned grounding metadata becomes a source link.
7. The final answer pass receives the original question and media, selected catalog reference images, approved business facts, and any research summary. It returns the visitor-facing answer and candidate match assessments without inventing numeric prices.
8. The server drops invalid match IDs, constructs any estimate directly from the approved rate card, validates source URLs, and returns the response envelope.
9. The browser renders the answer, catalog chips, source links, and estimate card.

A text-only question skips media upload and catalog image work unless catalog comparison is relevant. A request without a useful research need skips the research pass.

## Response contract

The Edge Function returns JSON with:

- `answer`: plain text in the visitor's language.
- `matches`: zero or more `{ id, name, reason, url }` entries restricted to retrieved BrownHub catalog candidates.
- `sources`: zero or more `{ title, url }` entries taken from validated grounding metadata.
- `estimate`: `null` or `{ category, currency, min, max, fromOnly, turnaround, designOnly, printingExcluded, requiresConfirmation }`.

The server, not the model, supplies every numeric estimate field. `max` is null when `fromOnly` is true. Catalog URLs are generated from validated IDs. Source URLs must be valid HTTPS URLs returned by the grounding provider.

The browser may log the plain answer and non-sensitive response metadata. It must not log file bytes, Gemini file URIs, or upload contents.

## Catalog comparison rules

- Retrieval uses BrownHub names, categories, descriptions, and approved keywords before image comparison.
- The model may compare layout, purpose, visual style, colour, imagery, and format; it must not claim an exact match from superficial similarity.
- A close match states why it is close. A partial match states the difference. No close candidate produces an honest no-close-match response.
- Catalog chips link to the real item and never imply that the uploaded work is BrownHub's work.
- Missing or failed reference images reduce confidence; they do not cause an invented comparison.

## Research rules

- Research is allowed for design inspiration, trends, general explanations, and public examples.
- Research is not authority for BrownHub services, availability, catalog contents, clients, prices, payment, policies, or turnaround.
- Sources come from provider grounding metadata, not URLs hallucinated in prose.
- Links open in a new tab with `noopener noreferrer`; link text is plain text.
- If grounding fails, the assistant may answer from general design knowledge without sources and must not pretend research occurred.

## Approved redesign estimate card

All figures are Ghana cedis, design-only, and exclude printing.

| Category | Approved range | Automatic turnaround boundary |
| --- | ---: | --- |
| Flyer/poster redesign | GH₵200–300 | Likely 1–2 days only for a single item with usable content and dimensions |
| Social-media redesign | GH₵300–450 | Likely 1–2 days for one item; sets require item count |
| Logo/brand redesign | GH₵700–1,200 | Do not promise 1–2 days; existing logo and identity guidance applies |
| Packaging redesign | GH₵500–800 | 1–2 days only for simple artwork with an existing usable dieline; otherwise studio review |
| Complex/multi-page redesign | From GH₵1,200 | Page count and source files require studio review; no automatic 1–2 day claim |

For every estimate:

- The model classifies category and scope; the server looks up the figures.
- The answer identifies missing information instead of guessing.
- The estimate is labelled an estimate, design-only, printing-excluded, and subject to studio confirmation.
- No payment or work begins from the estimate alone.
- Existing typical turnaround remains the fallback where no 1–2 day condition is satisfied.

## Failure handling

- Invalid, encrypted, corrupt, oversized, or unsupported files receive a specific safe message and an optional studio handoff; no success is claimed.
- A failed media analysis must not fall back to “your document was emailed.”
- Gemini file processing states are checked before use. Failed or timed-out processing stops the analysis cleanly.
- If catalog retrieval fails, the assistant can still describe the upload but says comparison is unavailable.
- If research fails, answer without citations and disclose that live research was unavailable when it materially affects the answer.
- If the model fails, preserve the question and staged files where possible so retry does not require reselection.
- Rate limiting applies per visitor request, not per internal Gemini pass. File count and total bytes are included in abuse controls.
- Provider errors go to function logs without secrets, media contents, or bearer tokens; visitors receive concise safe errors.

## Privacy and security

- The Gemini key never enters browser code, response data, logs, or the repository.
- Only the existing BrownHub origin allowlist can call the paid endpoint from a browser.
- Validate actual file signatures in addition to filename extensions. Reject active or disguised content not on the analysis allowlist.
- Bound decompression or document extraction work and reject archive bombs or pathological inputs.
- Do not render uploaded SVG, HTML, or scripts in the page.
- Keep transcript and visitor identifiers unchanged; do not create browser-reported business records from an estimate.
- Update `privacy.html` to disclose media processing by Google Gemini, deletion behaviour, optional email handoff, and the difference between transcript storage and temporary file processing.
- Add a concise attachment notice so visitors know files are sent for AI analysis and should not contain unnecessary sensitive information.

## Verification strategy

Implementation follows test-driven development: each new behaviour begins with a failing automated test and a verified red-green cycle.

### Unit and contract tests

- Exact quick actions remain deterministic; substantive keyword-bearing questions reach the model.
- The `sophisticated` case cannot trigger a greeting.
- Attachment requests produce assistant analysis and no automatic FormSubmit request.
- File count, size, MIME/signature, malformed history, origin, and rate-limit boundaries are enforced.
- Catalog scoring, candidate filtering, stable URLs, and no-match outcomes are correct.
- Model-supplied prices cannot alter the server estimate card.
- Every rate-card category, `fromOnly`, printing exclusion, and turnaround boundary is covered.
- Grounding metadata becomes safe links; invented or invalid URLs are dropped.
- Gemini files are deleted on success, provider error, malformed response, and timeout paths.
- Text responses remain compatible with the release's stale-client path.

### Browser integration tests

Use a real Blink frame against a local server with mocked provider boundaries, then against production:

- Broad creative questions receive substantive answers rather than canned intents.
- Redesign questions reach the model and show the correct server-built estimate.
- PNG/JPEG/WebP, PDF, Office/text fixtures, and a short video exercise their supported paths.
- A sample flyer produces visible-text/style analysis and truthful catalog matches or no-match.
- Research responses show valid source links; no-research responses do not fabricate sources.
- Retry, new chat, restored history, follow-ups, voice notes, emoji, and WhatsApp handoff still work.
- No attachment bytes appear in transcript requests, console logs, or persisted browser history.
- Dark/light themes, 320/390px phones, tablet/desktop, RTL, keyboard operation, reduced motion, and screen-reader names pass without overflow or contrast regression.

### Live provider probes

Before enabling each production capability, verify the configured Gemini model with one harmless fixture for image, PDF/document, video, and search grounding. Record HTTP behaviour and returned metadata without exposing keys. A capability that the configured model does not support remains disabled with an honest visitor message; it is never simulated.

## Rollout

1. Land generated catalog data, tests, browser routing/transport, server analysis, rendering, localisation, privacy text, and cache-version updates together.
2. Run the complete local test and browser matrix.
3. Commit the verified change set.
4. Ask for the standing L3 deep security review before any push or deployment.
5. Deploy the static site and Edge Function in an order that preserves text chat if either side is temporarily stale.
6. Verify production bytes and live text, attachment, research, catalog, and estimate behaviour.
7. Do not claim completion from a local commit or a signed/mock provider response alone.

## Acceptance criteria

The feature is complete only when all reproduced failures have regression tests; real uploads are analysed; catalog comparisons are grounded in BrownHub data; research links come from grounding metadata; estimates exactly match the approved card; printing is excluded; no numeric business claim comes from the model; all automated and live browser checks pass; L3 is cleared; and production is verified.

## API references

- Gemini Files API: https://aistudio.google.com/docs/files
- Gemini document processing: https://aistudio.google.com/docs/document-processing
- Gemini video understanding: https://aistudio.google.com/docs/video-understanding
- Gemini Google Search grounding: https://aistudio.google.com/docs/google-search
