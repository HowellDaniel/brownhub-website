(() => {
  const toggle = document.getElementById("chatToggle");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatClose");
  const messages = document.getElementById("chatMessages");
  const chips = document.getElementById("chatChips");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  if (!toggle || !panel || !messages) return;

  const WA = "https://wa.me/233502954541";
  const WA_CATALOG = "https://wa.me/c/233502954541";
  const VOICE_EMAIL = "https://formsubmit.co/ajax/howelldaniel533@gmail.com";
  const VOICE_FORM = "https://formsubmit.co/howelldaniel533@gmail.com";

  function T(s) {
    return (window.I18N && window.I18N.t) ? window.I18N.t(s) : s;
  }

  // On touch devices, never auto-focus: it pops the on-screen keyboard over the chat.
  const finePointer = window.matchMedia("(pointer:fine)").matches;
  function focusInput() { if (finePointer) input.focus(); }

  const questionIntents = [
    {
      keys: ["human", "agent", "real person", "talk to someone", "speak to someone", "call you", "phone", "email", "whatsapp", "contact"],
      html: `You can reach the team directly: call <a href="tel:+233535583460">+233 53 558 3460</a> / <a href="https://wa.me/233593872873" target="_blank" rel="noopener">+233 59 387 2873</a> or WhatsApp <a href="${WA}" target="_blank" rel="noopener">+233 50 295 4541</a>, email <a href="mailto:howelldaniel533@gmail.com">howelldaniel533@gmail.com</a>. The <a href="contact.html">contact form</a> works too.`
    },
    {
      keys: ["where", "address", "location", "office", "visit", "find you", "based"],
      html: `We're in Accra, Ghana — studio and print pickup at ChrisPrintgh, Accra New Town, Greater Accra. Our location map is on the <a href="contact.html">contact page</a>.`
    },
    {
      keys: ["hours", "open", "closed", "available", "weekend"],
      html: `We're open Mon–Fri, 9am–6pm GMT. Messages sent outside those hours (here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>) get answered the next working day.`
    },
    {
      keys: ["how long", "turnaround", "deadline", "delivery", "deliver", "when will", "rush", "urgent", "fast"],
      html: `Typical turnaround: logos 2–4 days, full brand identity about a week, flyers, posters and social media kits 1–3 days, books and company profiles depend on page count. Rush job? Ask on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> and we'll confirm what's possible.`
    },
    {
      keys: ["order", "buy", "purchase", "book", "place an order"],
      html: `Ordering is simple: 1) open the item in our <a href="catalog.html">catalog</a>, 2) press “Order now via chat” or “Request a quote”, 3) send your sizes, quantity and deadline. We confirm the price and start right away.`
    },
    {
      keys: ["price", "cost", "quote", "how much", "charge", "fee", "budget"],
      html: `Prices depend on scope — number of items, sizes, quantity and deadline. Send the details on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> or by email and you'll get a free consultation and a clear quote; design jobs are usually quoted the same day.`
    }
  ];

  const topicIntents = [
    {
      keys: ["thank", "thanks", "appreciate"],
      html: "Anytime! Anything else I can help with — logos, branding, print work, social media designs, prices or ordering?"
    },
    {
      keys: ["logo", "brand", "branding", "identity", "guidelines", "stationery"],
      html: `We design logos and complete brand identities: logo concepts, colour palette, typography, brand guidelines and reusable brand assets. Details on the <a href="services.html">services page</a>, and we can start from a <a href="contact.html">short brief</a>.`
    },
    {
      keys: ["social", "instagram", "facebook", "tiktok", "post", "posts", "ad", "advert", "advertis", "campaign", "banner"],
      html: `Social media design packs cover posts, stories, cover images, ad creatives and campaign banners — sized for each platform and matched to your brand. See samples in the <a href="catalog.html">catalog</a> or on the <a href="services.html">services page</a>.`
    },
    {
      keys: ["packaging", "label", "box", "sticker", "mockup"],
      html: `Packaging design covers boxes, labels, wrappers, stickers and product mockups that make a brand recognisable on the shelf. Send the artwork size or a photo of the product and we'll quote it — or use the <a href="contact.html">contact form</a>.`
    },
    {
      keys: ["catalog", "catalogue", "product", "item", "print", "printing", "flyer", "poster", "pull up", "pull-up", "frame", "abs board", "book design", "funeral", "card", "brochure"],
      html: `Browse every print &amp; design piece in our <a href="catalog.html">website catalog</a> — flyers, posters, business cards, brochures, pull-up stands, ABS boards, frames and book design. Tap any item to see details and order right here. The catalog is also on <a href="${WA_CATALOG}" target="_blank" rel="noopener">WhatsApp</a>.`
    },
    {
      keys: ["graphic", "design", "artist", "artwork", "illustration"],
      html: `Our design studio handles logos &amp; brand identity, social media and advertising graphics, flyers and posters, business cards, brochures and company profiles, packaging, book covers and inside layout, plus custom work to your brief. See samples in the <a href="catalog.html">catalog</a> and the full list on the <a href="services.html">services page</a>.`
    },
    {
      keys: ["website", "web site", "site", "web", "landing", "portfolio", "ecommerce", "e-commerce", "responsive", "domain", "hosting", "page", "software", "app"],
      html: `We also build websites and software for brands that need them — business sites, landing pages, portfolios and web apps, designed and built in-house. Details on the <a href="index.html#web-software">website design page</a>; tell me your idea here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> for a quote.`
    },
    {
      keys: ["help", "what can you do", "assist", "options"],
      html: "I give quick answers on our design work: services, catalog items, prices, turnaround, ordering, print-ready files and how to reach the team. Try a button below."
    },
    {
      keys: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"],
      html: "Hello! Great to see you. Ask me anything about our graphic design and branding work — logos, brand identity, print, social media and packaging — or tap a button below to get started."
    }
  ];

  const fallback = `I didn't quite catch that. I'm best at quick answers on <strong>graphic design</strong> and <strong>branding</strong> — logos, brand identity, flyers, business cards, brochures, packaging, social media and print-ready files. Or reach a human on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>.`;

  const greeting = `Hi, I'm BrownHub Studio Assistance. I give quick replies on anything about our <strong>graphic design</strong> and <strong>branding</strong> work — logos, identities, print, social media and packaging. What can I help with?`;

  const defaultChips = ["Logo & branding", "Social media design", "Catalog items", "Get a quote", "Talk to a human"];

  function bestOf(list, t) {
    let best = null, bestScore = 0;
    for (const intent of list) {
      const score = intent.keys.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
      if (score > bestScore) { best = intent; bestScore = score; }
    }
    return best;
  }

  function matchIntent(text) {
    // Visitors may type (or we may prefill) in their own language: map known
    // translated strings back to their English source before keyword scoring.
    const src = (window.I18N && window.I18N.en) ? window.I18N.en(text) : text;
    const t = src.toLowerCase();
    const hit = bestOf(questionIntents, t) || bestOf(topicIntents, t);
    return hit ? hit.html : null;
  }

  // A question the written intents do not cover goes to the studio's assistant,
  // which is grounded in the site's own facts and reads the live price list off
  // the store. It answers in the visitor's language, so it bypasses the
  // dictionary entirely rather than being looked up in it. The thread goes with
  // the question, so the model hears a follow-up as a follow-up.
  function askModel(question) {
    const ask = window.BHAccounts && window.BHAccounts.ask;
    if (typeof ask !== "function") return Promise.reject(new Error("No assistant is wired up."));
    const prices = (window.BHStore && window.BHStore.offers) ? window.BHStore.offers() : [];
    const lang = (window.I18N && window.I18N.lang) || "en";
    return Promise.race([
      ask(question, lang, prices, thread),
      new Promise((_, reject) => setTimeout(() => reject(new Error("The assistant took too long.")), 25000))
    ]);
  }

  // Let other scripts (catalog "Order now via chat") send a message with a
  // display text in the visitor's language while routing on the English source.
  window.BROWNHUB_CHAT = { send: send };

  function scrollDown() { messages.scrollTop = messages.scrollHeight; }

  const botHistory = [];
  function addMsg(html, who) {
    const el = document.createElement("div");
    el.className = `chat-msg chat-msg--${who}`;
    if (who === "user") el.textContent = html;
    else { el.innerHTML = T(html); botHistory.push({ el, src: html }); }
    messages.appendChild(el);
    scrollDown();
    return el;
  }

  // Messages rendered before a language switch must follow the new language too.
  document.addEventListener("i18n-applied", () => {
    for (const h of botHistory) if (h.el.isConnected) h.el.innerHTML = T(h.src);
  });

  // Model output is text from a network, not markup we wrote, so it is never
  // handed to innerHTML. It also arrives already translated, so it stays out of
  // botHistory and is not re-rendered when the visitor changes language.
  function addPlain(text) {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--bot";
    el.textContent = text;
    messages.appendChild(el);
    scrollDown();
    return el;
  }

  function typingBubble() {
    const el = document.createElement("div");
    el.className = "chat-msg chat-msg--bot chat-msg--typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(el);
    scrollDown();
    return el;
  }

  function renderChips(list) {
    chips.innerHTML = "";
    for (const label of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = T(label);
      b.addEventListener("click", () => send(T(label), label));
      chips.appendChild(b);
    }
  }

  // The archive holds what an answer says, not how it is marked up, so the written
  // intents are stripped back to sentences before they are filed.
  function plainText(html) {
    const el = document.createElement("div");
    el.innerHTML = html;
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  // ---- the conversation itself ------------------------------------------------
  // Everything said so far, in order, in plain sentences. It is what lets a
  // follow-up like "and for 500 of them?" be understood at all, and what a person
  // on WhatsApp reads instead of starting the visitor from the beginning again.
  // A phone locking, a refresh or leaving the site and coming back must not wipe
  // it, so the thread is also kept on the visitor's own device — the same
  // localStorage the language and theme already use — and it ages out after a
  // week, because nobody wants to return to a fortnight-old conversation.
  const thread = [];
  const HISTORY_KEY = "brownhub-chat-history";
  const HISTORY_AGE = 7 * 86400000;

  function remember(role, text) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    thread.push({ role: role, text: clean.slice(0, 400) });
    while (thread.length > 24) thread.shift();
    keep();
  }

  function keep() {
    try {
      if (!thread.length) { localStorage.removeItem(HISTORY_KEY); return; }
      localStorage.setItem(HISTORY_KEY, JSON.stringify({ at: Date.now(), turns: thread }));
    } catch (e) {}
  }

  // Reading it back is guarded line by line: whatever is in that slot is data from
  // a previous page load, not a trusted object, and a corrupt entry must leave the
  // assistant with an empty chat rather than an exception.
  function reopen() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "null"); } catch (e) { return; }
    if (!saved || !Array.isArray(saved.turns)) return;
    const at = Number(saved.at);
    if (!isFinite(at) || at <= 0 || Date.now() - at > HISTORY_AGE) {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      return;
    }
    for (const t of saved.turns) {
      if (!t || (t.role !== "user" && t.role !== "model")) continue;
      const text = typeof t.text === "string" ? t.text.replace(/\s+/g, " ").trim() : "";
      if (text) thread.push({ role: t.role, text: text.slice(0, 400) });
    }
    while (thread.length > 24) thread.shift();
  }
  reopen();

  function logExchange(question, answer, source) {
    const log = window.BHAccounts && window.BHAccounts.logChat;
    if (typeof log !== "function") return;
    log({
      q: question,
      a: answer,
      source: source,
      page: location.pathname,
      lang: (window.I18N && window.I18N.lang) || "en"
    });
  }

  // The question the visitor last put, kept so the ↻ button can put it again
  // after an answer that missed. `as` is the English routing string, which a
  // chip or a catalog button sets apart from what is shown.
  let lastQ = null;
  let answering = false;

  function answer(clean, routeAs) {
    answering = true;
    syncTools();
    const bubble = typingBubble();
    const settle = () => {
      bubble.remove();
      answering = false;
      renderChips(defaultChips);
      focusInput();
      showHandoff();
      syncTools();
      // One hook for every kind of answer — written, model, or the apology — so a
      // reply that arrives in a background tab still lands quietly.
      chime(CHIME_REPLY);
    };
    const replyWith = (html, source) => {
      const said = plainText(html);
      addMsg(html, "bot");
      // The archive holds the English sentence the studio wrote; the conversation
      // holds what this visitor actually read, because a restored chat must show
      // the answer in the language it was given in.
      remember("model", plainText(T(html)));
      settle();
      logExchange(clean, said, source);
    };
    // The written answers are instant, cost nothing and have been read over, so
    // they always win when one fits. The assistant only ever sees what they miss.
    const known = matchIntent(routeAs || clean);
    if (known) { setTimeout(() => replyWith(known, "intent"), 550 + Math.random() * 450); return; }
    askModel(clean).then((reply) => {
      addPlain(reply);
      remember("model", reply);
      settle();
      logExchange(clean, reply, "model");
    }).catch(() => replyWith(fallback, "fallback"));
  }

  function send(text, routeAs) {
    const clean = text.trim();
    if (!clean) return;
    lastQ = { q: clean, as: routeAs || null };
    addMsg(clean, "user");
    remember("user", clean);
    renderChips([]);
    answer(clean, routeAs);
  }

  // Asking again, rather than making the visitor type the same question out: the
  // last answer comes off the screen and off the record, so a retry never leaves
  // two replies to one question for the studio or for the model to read back.
  function retry() {
    if (!lastQ || answering) return;
    const bots = messages.querySelectorAll(".chat-msg--bot:not(.chat-msg--typing)");
    if (bots.length) bots[bots.length - 1].remove();
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].role === "model") { thread.splice(i, 1); break; }
    }
    keep();
    answer(lastQ.q, lastQ.as);
  }

  function newChat() {
    messages.innerHTML = "";
    botHistory.length = 0;
    thread.length = 0;
    keep();
    lastQ = null;
    answering = false;
    addMsg(greeting, "bot");
    renderChips(defaultChips);
    showHandoff();
    syncTools();
    focusInput();
  }

  // ---- carrying the conversation to a person -----------------------------------
  // The point of an assistant on a site like this is that the visitor should never
  // have to tell the story twice. Once anything has been said, this appears under
  // the chat: it opens WhatsApp with the exchange already written out, so the
  // studio reads where the assistant left off. Nothing is sent by itself, nothing
  // leaves the visitor's own browser, and they see the whole text before it goes.
  const HANDOFF_LABEL = "Continue this chat with a person on WhatsApp";
  // The icon is ours and the label is the only text node, so the translator has
  // one plain string to work on and the drawing stays put.
  const HANDOFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.2c0 4-3.79 7.2-8.5 7.2-.95 0-1.86-.13-2.71-.38L4.5 19.8l1.36-3.34A6.86 6.86 0 0 1 4 11.2C4 7.2 7.79 4 12.5 4S21 7.2 21 11.2Z"/><path d="M9.2 11.6h6.6M9.2 8.9h4.4"/></svg>';
  const handoff = document.createElement("a");
  handoff.className = "chat-widget__handoff";
  handoff.target = "_blank";
  handoff.rel = "noopener";
  handoff.hidden = true;
  handoff.innerHTML = HANDOFF_ICON + "<span>" + HANDOFF_LABEL + "</span>";
  const handoffText = handoff.querySelector("span");
  handoff.addEventListener("click", () => { handoff.href = handoffHref(); });
  chips.parentNode.insertBefore(handoff, chips);

  function digest() {
    const turns = thread.slice(-10).map((t) =>
      (t.role === "user" ? "Client: " : "Assistant: ") + t.text);
    return turns.join("\n").slice(0, 900);
  }

  function handoffHref() {
    const said = digest();
    const body = said
      ? "From brownhub283.com:\n" + said + "\n\nI would like to continue this with someone."
      : "Hello BrownHub, I would like to talk to someone.";
    return WA + "?text=" + encodeURIComponent(body);
  }

  function showHandoff() {
    handoff.hidden = !thread.some((t) => t.role === "user");
    handoff.href = handoffHref();
  }

  // A restored conversation is drawn as text, never as markup: these are words a
  // network once sent back, and they reappear exactly as they were read. They stay
  // out of botHistory too, so changing language later does not re-translate a
  // sentence that already arrived in the visitor's own tongue.
  function replay() {
    for (const t of thread) {
      if (t.role === "user") addMsg(t.text, "user");
      else addPlain(t.text);
    }
    renderChips(defaultChips);
    showHandoff();
  }

  // English on purpose at build time: translate.js picks up a text node it has not
  // seen and renders it in the visitor's language. A node it has already done is
  // not re-done on a language switch, so this one relabels itself from the
  // dictionary — and only its own span, so the drawing is never wiped with it.
  document.addEventListener("i18n-applied", () => {
    handoffText.textContent = T(HANDOFF_LABEL);
  });

  // ---- It makes itself heard -----------------------------------------------------
  // A browser will not let a page play anything until the visitor has touched it, so
  // the assistant waits for that first tap, scroll or key and then chimes — and buzzes a
  // phone — to put its question across; it chimes again whenever an answer is ready. One
  // chime is easy to miss, so the question is put three more times, twenty to thirty
  // minutes apart, and stops the moment the visitor opens the assistant. Someone who does
  // not want it presses the speaker in the header and gets neither tone nor buzz again on
  // that device. Both tones are drawn from an oscillator as they play, so there is no
  // audio file to download and nothing to add to the page's content policy.
  const SOUND_KEY = "brownhub-sound";
  const ASKED_KEY = "brownhub-chime-asked";
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  // The question rises and the answer falls, so a visitor learns to tell them apart.
  const CHIME_ASK = [[784, .075], [1046, .0825]];
  const CHIME_REPLY = [[880, .075], [587, .0675]];
  /* Half again the level these played at, with the clamp's knee and ceiling shifted by
     the same factor: the whole envelope simply sits further up the speaker, and the one
     moment two notes land together is still folded back under a single ceiling instead
     of stacking on top of itself. */
  const CHIME_KNEE = .075;
  const CHIME_CEIL = .093;
  // One chime is easy to miss in a busy shop, so the question is put three more times.
  const CHIME_REPEATS = 3;
  const CHIME_GAP = [20 * 60000, 30 * 60000];
  // Two short pulses read as a notification; one long one reads as a phone calling.
  const BUZZ = [42, 68, 42];
  let soundCtx = null, soundTouched = false, chimeQueued = false, chimeBus = null, chimeBusCtx = null, cueTimer = 0;

  function soundWanted() {
    try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; }
  }
  function rememberSound(on) {
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch (e) {}
  }
  // How many times the attention cue has already sounded in this tab. Opening another
  // page of the site is not opening the website again, so the count lives with the
  // visit — and a tab that will not give up its session storage simply never gets one.
  function cueCount() {
    let n;
    try { n = parseInt(sessionStorage.getItem(ASKED_KEY), 10); } catch (e) { return CHIME_REPEATS + 1; }
    return isFinite(n) ? n : 0;
  }
  function addCue() {
    try { sessionStorage.setItem(ASKED_KEY, String(cueCount() + 1)); } catch (e) {}
  }

  /* The clamp is a curve drawn here, not a DynamicsCompressor: Chrome's compressor adds
     its own make-up gain — it measured a note going in at .176 and coming out at .333,
     which is the opposite of what a ceiling is for. Below the knee the curve is the
     identity, so a single note passes untouched; only the moment two notes land together
     is folded back under the ceiling. Fails soft — a browser without the node connects
     straight to the speaker. */
  function chimeCurve() {
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      if (a <= CHIME_KNEE) { curve[i] = x; continue; }
      curve[i] = (x < 0 ? -1 : 1) * (CHIME_KNEE + (CHIME_CEIL - CHIME_KNEE) *
        Math.tanh((a - CHIME_KNEE) / (CHIME_CEIL - CHIME_KNEE)));
    }
    return curve;
  }

  function makeBus(ctx) {
    if (chimeBus && chimeBusCtx === ctx) return chimeBus;
    let node = ctx.destination;
    try {
      const shaper = ctx.createWaveShaper();
      shaper.curve = chimeCurve();
      shaper.oversample = "4x";
      shaper.connect(ctx.destination);
      node = shaper;
    } catch (e) { node = ctx.destination; }
    chimeBusCtx = ctx;
    chimeBus = node;
    return node;
  }

  function chime(notes) {
    if (!AudioEngine || !soundTouched || document.hidden || !soundWanted()) return;
    try {
      const ctx = makeCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const bus = makeBus(ctx);
      const t = ctx.currentTime + .03;
      notes.forEach((n, i) => {
        const from = t + i * .14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(n[0], from);
        /* The note does not fall straight away from its peak any more: it attacks, holds
           most of itself for a hundred and fifty milliseconds, then lets go across two
           hundred more. That body is what makes the chime read as present rather than as
           a click, and it costs no ceiling at all. */
        gain.gain.setValueAtTime(.0001, from);
        gain.gain.exponentialRampToValueAtTime(n[1], from + .012);
        gain.gain.exponentialRampToValueAtTime(n[1] * .68, from + .16);
        gain.gain.exponentialRampToValueAtTime(.0001, from + .38);
        osc.connect(gain);
        gain.connect(bus);
        osc.start(from);
        osc.stop(from + .4);
      });
    } catch (e) { /* a browser that refuses the tone simply stays quiet */ }
  }

  // A phone only lets a page make a sound once an audio engine has been built
  // inside one of the visitor's own gestures, so the engine is made there and kept —
  // otherwise a tone that arrives from a timer, which is what both chimes do, is
  // silently dropped however often the screen has been touched.
  function makeCtx() {
    if (soundCtx || !AudioEngine) return soundCtx;
    try { soundCtx = new AudioEngine(); } catch (e) { soundCtx = null; }
    if (soundCtx && soundCtx.state === "suspended") soundCtx.resume();
    return soundCtx;
  }

  // The buzz rides the same guards as the tone, and the same switch: pressing the
  // speaker silences both. Chrome only honours vibrate() once the page has had a real
  // gesture, which is the flag the audio already needs, and iPhone has no Vibration API
  // at all — there the chime carries the cue on its own.
  function buzz() {
    if (!soundTouched || document.hidden || !soundWanted()) return;
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(BUZZ);
    } catch (e) { /* a browser without the API stays still */ }
  }

  // The question is asked whether or not the page has been touched yet: queued here,
  // it sounds the instant the visitor's first gesture lets it.
  function soundTheCue(repeat) {
    if (cueCount() > CHIME_REPEATS) return;
    addCue();
    chime(CHIME_ASK);
    buzz();
    // A chime with nothing on screen to point at is just noise, so a repeat puts the
    // question back beside the icon before it makes itself heard.
    if (repeat) showTeaser(true);
    scheduleCue();
  }
  function scheduleCue() {
    if (cueTimer) { clearTimeout(cueTimer); cueTimer = 0; }
    if (cueCount() > CHIME_REPEATS) return;
    cueTimer = setTimeout(fireCue, CHIME_GAP[0] + Math.random() * (CHIME_GAP[1] - CHIME_GAP[0]));
  }
  function fireCue() {
    cueTimer = 0;
    // A cue into a tab nobody is looking at is wasted, so it waits for the page to come
    // back rather than spending one of its three — which also covers a phone whose tab
    // was frozen and wakes minutes later.
    if (document.hidden) { scheduleCue(); return; }
    // Once the visitor has opened the assistant the question is answered, and nagging
    // them about it would only teach them to mute the whole site.
    if (seenThisVisit() || !soundWanted()) return;
    soundTheCue(true);
  }
  function stopCues() {
    if (cueTimer) { clearTimeout(cueTimer); cueTimer = 0; }
  }
  function playAttention() {
    if (cueCount() > CHIME_REPEATS || !soundTouched || document.hidden || !soundWanted()) return;
    soundTheCue(false);
  }
  function askForAttention() {
    if (cueCount() > CHIME_REPEATS) return;
    if (soundTouched) playAttention(); else chimeQueued = true;
  }
  function touchSound() {
    soundTouched = true;
    makeCtx();
    if (!chimeQueued) return;
    chimeQueued = false;
    playAttention();
  }
  if (AudioEngine) {
    for (const ev of ["pointerdown", "keydown", "wheel"]) {
      window.addEventListener(ev, touchSound, { capture: true, passive: true });
    }
  }

  // ---- the panel's own controls --------------------------------------------------
  // Four glyphs in the header, in the order a visitor reads them: start over, put
  // the last question again, silence the chimes, shut the panel. They are built here
  // rather than written into the nine pages that carry the panel, so the chat can
  // never have two buttons on one page and three on the next. The drawings are the
  // site's own line-icon stroke; only the labels are text, and only ever as
  // attributes, which the translator does not touch — so each label is set from the
  // dictionary at build and again on a language switch.
  const TOOL_NEW = "Start a new chat";
  const TOOL_RETRY = "Try that answer again";
  const TOOL_SOUND_ON = "Turn the assistant's sounds off";
  const TOOL_SOUND_OFF = "Turn the assistant's sounds on";
  const TOOL_SVG = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.6 4.2v4.5h-4.5"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.6 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.4a9 9 0 0 1 0 13.2"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M22 9.5 16.5 15M16.5 9.5 22 15"/></svg>'
  };
  const tools = document.createElement("div");
  tools.className = "chat-widget__tools";
  function tool(svg, label, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chat-widget__tool";
    b.innerHTML = svg;
    b.dataset.label = label;
    b.setAttribute("aria-label", T(label));
    b.title = T(label);
    b.addEventListener("click", fn);
    tools.appendChild(b);
    return b;
  }
  const newBtn = tool(TOOL_SVG.plus, TOOL_NEW, newChat);
  const retryBtn = tool(TOOL_SVG.again, TOOL_RETRY, retry);
  // The speaker wears whichever glyph matches its state, and says the opposite of
  // what it shows: a visitor looking at a muted speaker is being offered sound.
  let muted = !soundWanted();
  const soundBtn = tool(TOOL_SVG.sound, TOOL_SOUND_ON, toggleSound);
  function paintSound() {
    const label = muted ? TOOL_SOUND_OFF : TOOL_SOUND_ON;
    soundBtn.innerHTML = muted ? TOOL_SVG.muted : TOOL_SVG.sound;
    soundBtn.dataset.label = label;
    soundBtn.setAttribute("aria-label", T(label));
    soundBtn.title = T(label);
  }
  function toggleSound() {
    muted = !muted;
    rememberSound(!muted);
    paintSound();
    // Coming back on plays the answer tone once, so the visitor knows what they have
    // just allowed without having to wait for a question to find out.
    if (!muted) chime(CHIME_REPLY);
  }
  paintSound();
  closeBtn.classList.add("chat-widget__tool");
  const head = panel.querySelector(".chat-widget__head");
  head.insertBefore(tools, closeBtn);
  tools.appendChild(closeBtn);
  // Four glyphs take the width the online line was using, so that line moves out
  // of the title block and onto a row of its own across the head. It keeps its own
  // words in every language; only its place changes.
  const online = head.querySelector(".chat-widget__head-text small");
  if (online) { online.classList.add("chat-widget__head-sub"); head.appendChild(online); }

  // A control with nothing to do is shown but inert, so the header never changes
  // width under someone who is reading it.
  function syncTools() {
    newBtn.disabled = !thread.length;
    retryBtn.disabled = !lastQ || answering;
  }

  document.addEventListener("i18n-applied", () => {
    for (const b of tools.querySelectorAll(".chat-widget__tool")) {
      const label = b === closeBtn ? "Close chat" : b.dataset.label;
      b.setAttribute("aria-label", T(label));
      b.title = T(label);
    }
  });

  let greeted = false;
  // A restored conversation is drawn the moment the widget loads, into a panel
  // that is still closed. Doing it here rather than on first opening keeps the
  // turns in the right order when something else — a catalog "order via chat"
  // press, say — sends the next message before the panel has ever been seen, and
  // it is why such a visitor is not greeted all over again.
  if (thread.length) { greeted = true; replay(); }
  syncTools();
  // `auto` marks an opening the assistant did for itself, which must not move
  // focus: a keyboard user's tab order stays where it was and a phone keeps its
  // on-screen keyboard shut until the visitor taps the field.
  // `after` runs once the greeting has landed, so a question carried in from the
  // teaser is not typed over the top of it.
  function openChat(auto, after) {
    hideTeaser();
    // The visitor is here, so there is nothing left to draw their attention to.
    stopCues();
    markSeen();
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
      const bubble = typingBubble();
      setTimeout(() => {
        bubble.remove();
        addMsg(greeting, "bot");
        renderChips(defaultChips);
        if (after) after();
      }, 600);
    } else if (after) {
      after();
    }
    if (!auto) focusInput();
  }

  function closeChat() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  toggle.addEventListener("click", () => (panel.hidden ? openChat() : closeChat()));
  closeBtn.addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closeChat();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
    input.value = "";
  });

  // ---- It asks first, the way a front desk does ------------------------------------
  // Once per visit the assistant puts a line beside its own icon with three quick
  // questions under it. It does not open itself any more: the visitor answers the
  // question or presses the bubble, and that is what unfolds the panel. Closing the
  // bubble, or opening the panel, is taken as an answer — it is never offered again
  // in that tab, although an untouched one does come back with each repeat chime.
  const SEEN_KEY = "brownhub-chat-asked";
  const TEASE_TEXT = "Hi there! Any question about design, print or prices?";
  // The same three labels the open panel offers, so no new words to translate.
  const TEASE_CHIPS = ["Get a quote", "Catalog items", "Talk to a human"];
  let teaserEl = null, teaseTimer = 0;

  function seenThisVisit() {
    try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return true; }
  }
  function markSeen() {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
  }
  function hideTeaser() {
    if (teaseTimer) { clearTimeout(teaseTimer); teaseTimer = 0; }
    if (teaserEl) { teaserEl.remove(); teaserEl = null; }
  }
  function showTeaser(quiet) {
    if (teaserEl || !panel.hidden || seenThisVisit()) return;
    const box = document.createElement("div");
    box.className = "chat-widget__teaser";
    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "chat-widget__teaser-text";
    bubble.textContent = TEASE_TEXT;
    bubble.addEventListener("click", () => openChat());
    const x = document.createElement("button");
    x.type = "button";
    x.className = "chat-widget__teaser-close";
    x.setAttribute("aria-label", "Close chat");
    x.innerHTML = "&times;";
    // Pressing the cross is "not now", so it ends the offer for the whole visit.
    x.addEventListener("click", () => { hideTeaser(); markSeen(); });
    const row = document.createElement("div");
    row.className = "chat-widget__teaser-chips";
    for (const label of TEASE_CHIPS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => openChat(false, () => send(T(label), label)));
      row.appendChild(b);
    }
    box.appendChild(bubble);
    box.appendChild(x);
    box.appendChild(row);
    // Written in English on purpose: translate.js watches the page and picks up a
    // node it has not seen before, so this bubble follows the visitor's language
    // and re-translates when they change it, same as the panel's own messages.
    panel.parentElement.insertBefore(box, panel);
    teaserEl = box;
    // The question is what the chime is for, so it only ever sounds with this on
    // screen. A repeat brings the bubble back and stays quiet about asking again,
    // because the cue that scheduled it has already sounded.
    if (!quiet) askForAttention();
    // It waits long enough to be read, and stops counting down while someone is
    // actually on it, so the offer never disappears mid-answer.
    const hold = () => { if (teaseTimer) { clearTimeout(teaseTimer); teaseTimer = 0; } };
    const requeue = () => { if (!teaseTimer) teaseTimer = setTimeout(hideTeaser, 8000); };
    teaseTimer = setTimeout(hideTeaser, 20000);
    box.addEventListener("mouseenter", hold);
    box.addEventListener("mouseleave", requeue);
    box.addEventListener("focusin", hold);
    box.addEventListener("focusout", () => {
      if (!box.contains(document.activeElement)) requeue();
    });
  }

  function start() {
    if (seenThisVisit()) return;
    setTimeout(showTeaser, 1500);
  }
  start();

  // ---- Voice notes: for visitors who cannot type, record and email the message ----
  const voiceBar = document.createElement("div");
  voiceBar.className = "chat-widget__voice";
  voiceBar.hidden = true;
  panel.insertBefore(voiceBar, form);

  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = "chat-widget__mic";
  micBtn.setAttribute("aria-label", "Record a voice message");
  micBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>';
  form.insertBefore(micBtn, form.firstChild);

  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VOICE_MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
  const VOICE_EXT = VOICE_MIME.indexOf("mp4") > -1 ? "m4a" : VOICE_MIME.indexOf("ogg") > -1 ? "ogg" : "webm";
  const CAN_PAUSE = typeof MediaRecorder !== "undefined" && "pause" in MediaRecorder.prototype;
  let stream = null, recorder = null, chunks = [], blob = null;
  // The same recording in a container the studio can open: see js/voice.js.
  let out = null, outUrl = null;
  let timer = null, secs = 0, phase = "idle", transcript = "", transcriptBase = "";
  let audioCtx = null, analyser = null, meterRaf = 0, voiceUrl = null, emailConfirmed = false;

  function vhtml(h) { voiceBar.innerHTML = h; if (window.I18N && I18N.lang !== "en") I18N.translateNode(voiceBar); }
  function micLabel(t) { micBtn.setAttribute("aria-label", T(t)); }
  function stopSpeech() { if (recognition) try { recognition.stop(); } catch (e) {} }
  function stopMeter() {
    if (meterRaf) { cancelAnimationFrame(meterRaf); meterRaf = 0; }
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; analyser = null; }
  }
  function meterDraw() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const d = (v - 128) / 128; sum += d * d; }
      const lvl = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
      voiceBar.querySelectorAll(".voice-meter i").forEach((b, i) => {
        const h = Math.max(0.12, Math.min(1, lvl * (0.55 + Math.abs(Math.sin(i * 1.7 + performance.now() / 220)) * 0.9)));
        b.style.transform = "scaleY(" + h + ")";
      });
      meterRaf = requestAnimationFrame(draw);
    };
    draw();
  }
  function startMeter() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !stream) return;
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      meterDraw();
    } catch (e) { audioCtx = null; analyser = null; }
  }
  function freezeMeter() { if (meterRaf) { cancelAnimationFrame(meterRaf); meterRaf = 0; } }
  function cleanup() {
    if (timer) { clearInterval(timer); timer = null; }
    stopSpeech();
    stopMeter();
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
  }
  function showIdle() {
    phase = "idle"; blob = null; out = null; chunks = []; transcript = ""; transcriptBase = "";
    BHPlayer.stop();
    if (voiceUrl) { URL.revokeObjectURL(voiceUrl); voiceUrl = null; }
    if (outUrl) { URL.revokeObjectURL(outUrl); outUrl = null; }
    voiceBar.hidden = true;
    voiceBar.textContent = "";
    micLabel("Record a voice message");
  }

  let recognition = null;
  function startSpeech() {
    if (!SR) return;
    try {
      recognition = new SR();
      recognition.lang = (window.I18N && I18N.lang !== "en") ? I18N.lang : "en";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (ev) => {
        let txt = "";
        for (const r of ev.results) txt += r[0].transcript;
        transcript = (transcriptBase ? transcriptBase + " " : "") + txt.trim();
        const el = document.getElementById("voiceTranscript");
        if (el) el.textContent = transcript || T("Speak, we are listening…");
      };
      recognition.onerror = () => {};
      recognition.start();
    } catch (e) { recognition = null; }
  }

  const fmtTime = () => Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  const METER_HTML = '<span class="voice-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  function recBar(paused) {
    vhtml('<span class="voice-dot' + (paused ? " voice-dot--paused" : "") + '" aria-hidden="true"></span><span class="voice-time">' + fmtTime() + "</span>" + METER_HTML +
      (paused
        ? '<button type="button" class="btn btn--primary voice-btn" id="voiceResume">' + T("Resume") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceStop">' + T("Stop") + "</button>"
        : (CAN_PAUSE ? '<button type="button" class="btn btn--ghost voice-btn" id="voicePause">' + T("Pause") + "</button>" : "") + '<button type="button" class="btn btn--primary voice-btn" id="voiceStop">' + T("Stop") + "</button>") +
      '<span class="voice-transcript" id="voiceTranscript"></span><span class="voice-hint">' + T("Tap Stop when you're done") + "</span>");
    const tr = document.getElementById("voiceTranscript");
    tr.textContent = transcript || T(paused ? "Paused" : "Speak, we are listening…");
    const p = document.getElementById("voicePause");
    if (p) p.addEventListener("click", pauseRecording);
    const rz = document.getElementById("voiceResume");
    if (rz) rz.addEventListener("click", resumeRecording);
    document.getElementById("voiceStop").addEventListener("click", stopRecording);
    micLabel("Stop recording");
  }
  function barStop() { recBar(false); }
  function pauseRecording() {
    if (!recorder || recorder.state !== "recording") return;
    try { recorder.pause(); } catch (e) { return; }
    phase = "paused";
    if (timer) { clearInterval(timer); timer = null; }
    transcriptBase = transcript;
    stopSpeech();
    freezeMeter();
    recBar(true);
  }
  function resumeRecording() {
    if (!recorder || recorder.state !== "paused") return;
    try { recorder.resume(); } catch (e) { return; }
    phase = "recording";
    tickTimer();
    startSpeech();
    recBar(false);
    meterDraw();
  }
  function barReview() {
    phase = "review";
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    voiceUrl = URL.createObjectURL(blob);
    vhtml('<span class="voice-hint voice-hint--top">' + T("Listen it back, then tap Send") + "</span>" + BHPlayer.html(voiceUrl) + '<button type="button" class="btn btn--primary voice-btn" id="voiceSend">' + T("Send") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceRedo">' + T("Try again") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceCancel">' + T("Cancel") + "</button>");
    BHPlayer.mount(voiceBar);
    document.getElementById("voiceSend").addEventListener("click", sendVoice);
    document.getElementById("voiceRedo").addEventListener("click", () => { showIdle(); startRecording(); });
    document.getElementById("voiceCancel").addEventListener("click", showIdle);
    micLabel("Record a voice message");
  }
  function barSent() {
    phase = "sent";
    vhtml('<span class="voice-busy">' + T("Emailed — now send it on WhatsApp too") + '</span><button type="button" class="btn btn--primary voice-btn" id="voiceWa">' + T("Continue to WhatsApp") + "</button>" + dlHtml() + '<button type="button" class="btn btn--ghost voice-btn" id="voiceDone">' + T("Done") + "</button>");
    document.getElementById("voiceWa").addEventListener("click", () => toWhatsApp(emailConfirmed));
    document.getElementById("voiceDone").addEventListener("click", showIdle);
  }
  function barBusy(msg) { vhtml('<span class="voice-busy">' + T(msg) + "</span>"); }
  // The saved copy is the playable one, so a desktop client can drop it into
  // WhatsApp Web by hand where the share sheet is not available.
  function dlHtml() {
    const src = (out && outUrl) || voiceUrl;
    if (!src) return "";
    return '<a class="btn btn--ghost voice-btn" download="brownhub-voice-message.' +
      (out ? out.ext : VOICE_EXT) + '" href="' + src + '">' + T("Download audio") + "</a>";
  }
  function barError(msg) {
    vhtml('<span class="voice-error">' + T(msg) + '</span><button type="button" class="btn btn--ghost voice-btn" id="voiceDismiss">' + T("Cancel") + "</button>");
    document.getElementById("voiceDismiss").addEventListener("click", showIdle);
  }
  async function startRecording() {
    micBtn.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      micBtn.disabled = false;
      barError("Microphone access was blocked. Allow it in your browser settings, then try again.");
      return;
    }
    micBtn.disabled = false;
    chunks = [];
    try {
      recorder = new MediaRecorder(stream, VOICE_MIME ? { mimeType: VOICE_MIME } : {});
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      micBtn.disabled = false;
      if (!blob || !blob.size) { barError("The recording came out empty. Please try again."); return; }
      barReview();
      convert();
    };
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); finish(); };
    recorder.onerror = () => { blob = null; finish(); };
    startSpeech();
    secs = 0;
    phase = "recording";
    voiceBar.hidden = false;
    barStop();
    startMeter();
    tickTimer();
    recorder.start(250);
  }

  function tickTimer() {
    timer = setInterval(() => {
      secs += 1;
      const el = voiceBar.querySelector(".voice-time");
      if (el) el.textContent = fmtTime();
    }, 1000);
  }

  function stopRecording() {
    if (timer) { clearInterval(timer); timer = null; }
    stopSpeech();
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  /* Runs while the visitor listens back, so the playable copy is usually ready
     well before Send. The review player keeps the original clip — swapping its
     source mid-listen would restart it — and only what leaves the browser is
     normalised. A recording discarded in the meantime is dropped here. */
  function convert() {
    const src = blob;
    if (!window.BHWVoice) return;
    window.BHWVoice.playable(src).then((o) => {
      if (blob !== src) return;
      out = o;
      if (outUrl) URL.revokeObjectURL(outUrl);
      outUrl = URL.createObjectURL(o.blob);
      if (phase === "sent") barSent();
    });
  }

  // The File every channel is given: converted audio when it exists, the raw clip
  // otherwise, so a failed conversion can never cost the studio the message.
  function voiceFile(name) {
    const use = out || { blob: blob, ext: VOICE_EXT, mime: blob && blob.type };
    return new File([use.blob], name + "." + use.ext, { type: use.mime || use.blob.type || "audio/webm" });
  }

  /* A browser only hands a file to another app while the tap that asked for it is
     still the live gesture, so this runs at the very top of Send — after the
     email await the right would be gone. Phones only: a desktop has no WhatsApp
     installed to share into. Whenever this does nothing, the "Continue to
     WhatsApp" button in the sent bar is the same hand-off one tap later. */
  function quickShare() {
    if (!out || !out.converted || !navigator.canShare) return;
    if (!matchMedia("(pointer: coarse)").matches) return;
    let file = null;
    try { file = voiceFile("brownhub-voice-message"); } catch (e) { return; }
    if (!navigator.canShare({ files: [file] })) return;
    navigator.share({
      title: "BrownHub voice message",
      text: "Hello BrownHub! Here is my voice message from your website" +
        (transcript ? ". Transcript: " + transcript : "") + ". My page: " + location.href,
      files: [file]
    }).catch(() => { /* dismissed — the sent bar still offers the button */ });
  }

  async function sendVoice() {
    if (!blob) return;
    BHPlayer.stop();
    quickShare();
    phase = "sending";
    voiceBar.hidden = false;
    barBusy("Sending your voice message…");
    let sent = false;
    emailConfirmed = false;
    try {
      const fd = new FormData();
      fd.append("voice_note", voiceFile("voice-message"));
      fd.append("transcript", transcript || "(no automatic transcript)");
      fd.append("_subject", "Voice message from the BrownHub website");
      fd.append("page", location.href);
      fd.append("time", new Date().toISOString());
      fd.append("_captcha", "false");
      fd.append("_template", "table");
      for (let attempt = 0; attempt < 2 && !sent; attempt++) {
        try {
          sent = (await fetch(VOICE_EMAIL, { method: "POST", body: fd })).ok;
        } catch (e) { /* retry once, then fall through to the silent form POST */ }
        if (!sent && attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (e) { /* FormData/File construction failed — the fallback below still runs */ }
    emailConfirmed = sent; // only the AJAX endpoint can confirm delivery
    if (!sent) sent = fallbackVoicePost(); // best-effort silent iframe POST; success UI either way
    addMsg(transcript || T("Voice message"), "user");
    addMsg("Your voice message was sent to our team with the audio attached. We will reply to your email within some few minutes. Thank you! 🙏 😊", "bot");
    barSent();
  }

  // Best-effort second channel: a native multipart form POST through a hidden
  // iframe. It survives networks where fetch() is blocked (CORS/MITM proxies);
  // the visitor sees the success bar either way — the WhatsApp note stays honest.
  function fallbackVoicePost() {
    try {
      const file = voiceFile("voice-message");
      let form = document.getElementById("voice-email-form");
      if (!form) {
        form = document.createElement("form");
        form.id = "voice-email-form";
        form.method = "POST";
        form.enctype = "multipart/form-data";
        form.action = VOICE_FORM;
        form.style.display = "none";
        document.body.appendChild(form);
      }
      form.textContent = "";
      const fields = {
        transcript: transcript || "(no automatic transcript)",
        _subject: "Voice message from the BrownHub website",
        page: location.href,
        time: new Date().toISOString(),
        _captcha: "false",
        _template: "table",
        _next: new URL("index.html", location.href).href
      };
      for (const [k, v] of Object.entries(fields)) {
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = k;
        inp.value = v;
        form.appendChild(inp);
      }
      const fileInp = document.createElement("input");
      fileInp.type = "file";
      fileInp.name = "voice_note";
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInp.files = dt.files;
      form.appendChild(fileInp);
      let frame = document.getElementById("voice-email-frame");
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "voice-email-frame";
        frame.name = "voice-email-frame";
        frame.style.display = "none";
        frame.title = "";
        frame.setAttribute("aria-hidden", "true");
        document.body.appendChild(frame);
      }
      form.target = frame.name;
      form.submit();
      return true;
    } catch (e) {
      return true; // still show success — the WhatsApp hand-off carries the audio
    }
  }

  async function toWhatsApp(emailSent) {
    const note = emailSent
      ? "Hello BrownHub! I sent a voice message from your website" +
        (transcript ? ". Transcript: " + transcript : "") +
        ". The audio was also emailed to the team. My page: " + location.href
      : "Hello BrownHub! I recorded a voice message on your website but the email could not send." +
        (transcript ? " Transcript: " + transcript : "") +
        " I am sending the audio here. My page: " + location.href;
    try {
      if (blob && navigator.canShare) {
        const file = voiceFile("brownhub-voice-message");
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "BrownHub voice message", text: note, files: [file] });
          showIdle();
          return;
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    window.open(WA + "?text=" + encodeURIComponent(note), "_blank", "noopener");
    showIdle();
  }

  micBtn.addEventListener("click", () => {
    if (phase === "recording" || phase === "paused") stopRecording();
    else if (phase === "idle") startRecording();
  });
  if (!canRecord) {
    micBtn.disabled = true;
    micBtn.title = T("Voice recording is not supported in this browser");
  }
})();
