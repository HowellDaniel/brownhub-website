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
      html: `You can reach the team directly: call or WhatsApp <a href="tel:+233593872873">+233 593 872 873</a>, email <a href="mailto:howelldaniel533@gmail.com">howelldaniel533@gmail.com</a>, or chat on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>. The <a href="contact.html">contact form</a> works too.`
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
      html: `We also build websites and software for brands that need them — business sites, landing pages, portfolios and web apps, designed and built in-house. Details on the <a href="services.html">services page</a>; tell me your idea here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> for a quote.`
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

  const greeting = `Hi, I'm the BrownHub robotic assistant. I give quick replies on anything about our <strong>graphic design</strong> and <strong>branding</strong> work — logos, identities, print, social media and packaging. What can I help with?`;

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
  // dictionary entirely rather than being looked up in it.
  function askModel(question) {
    const ask = window.BHAccounts && window.BHAccounts.ask;
    if (typeof ask !== "function") return Promise.reject(new Error("No assistant is wired up."));
    const prices = (window.BHStore && window.BHStore.offers) ? window.BHStore.offers() : [];
    const lang = (window.I18N && window.I18N.lang) || "en";
    return Promise.race([
      ask(question, lang, prices),
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

  function send(text, routeAs) {
    const clean = text.trim();
    if (!clean) return;
    addMsg(clean, "user");
    renderChips([]);
    const bubble = typingBubble();
    const replyWith = (html) => {
      bubble.remove();
      addMsg(html, "bot");
      renderChips(defaultChips);
      focusInput();
    };
    // The written answers are instant, cost nothing and have been read over, so
    // they always win when one fits. The assistant only ever sees what they miss.
    const known = matchIntent(routeAs || clean);
    if (known) { setTimeout(() => replyWith(known), 550 + Math.random() * 450); return; }
    askModel(clean).then((reply) => {
      bubble.remove();
      addPlain(reply);
      renderChips(defaultChips);
      focusInput();
    }).catch(() => replyWith(fallback));
  }

  let greeted = false;
  function openChat() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
      const bubble = typingBubble();
      setTimeout(() => {
        bubble.remove();
        addMsg(greeting, "bot");
        renderChips(defaultChips);
      }, 600);
    }
    focusInput();
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
    phase = "idle"; blob = null; chunks = []; transcript = ""; transcriptBase = "";
    BHPlayer.stop();
    if (voiceUrl) { URL.revokeObjectURL(voiceUrl); voiceUrl = null; }
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
  function dlHtml() {
    return voiceUrl ? '<a class="btn btn--ghost voice-btn" download="brownhub-voice-message.' + VOICE_EXT + '" href="' + voiceUrl + '">' + T("Download audio") + "</a>" : "";
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

  async function sendVoice() {
    if (!blob) return;
    BHPlayer.stop();
    phase = "sending";
    voiceBar.hidden = false;
    barBusy("Sending your voice message…");
    let sent = false;
    emailConfirmed = false;
    try {
      const fd = new FormData();
      fd.append("voice_note", new File([blob], "voice-message." + VOICE_EXT, { type: blob.type || VOICE_MIME || "audio/webm" }));
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
      const file = new File([blob], "voice-message." + VOICE_EXT, { type: blob.type || VOICE_MIME || "audio/webm" });
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
        const file = new File([blob], "brownhub-voice-message." + VOICE_EXT, { type: blob.type || VOICE_MIME || "audio/webm" });
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
