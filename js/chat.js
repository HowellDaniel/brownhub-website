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
      html: `We're in Accra, Ghana — work address: ChrisPrintgh, Accra New Town, Greater Accra. Both locations with maps are on the <a href="contact.html">contact page</a>.`
    },
    {
      keys: ["hours", "open", "closed", "available", "weekend"],
      html: `We're open Mon–Fri, 9am–6pm GMT. Messages sent outside those hours (here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>) get answered the next working day.`
    },
    {
      keys: ["how long", "turnaround", "deadline", "delivery", "deliver", "when will", "rush", "urgent"],
      html: `Typical turnaround: flyers &amp; banners 1–3 days, logos &amp; branding about a week, websites 1–3 weeks depending on page count. Rush job? Ask on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> and we'll confirm what's possible.`
    },
    {
      keys: ["order", "buy", "purchase", "book", "place an order"],
      html: `Ordering is simple: 1) open the item in our <a href="catalog.html">catalog</a>, 2) press “Order now via chat” or “Request a quote”, 3) send your sizes, quantity and deadline. We confirm the price and start right away.`
    },
    {
      keys: ["price", "cost", "quote", "how much", "charge", "fee", "budget"],
      html: `Prices depend on scope — pages, sizes, materials and deadline. Send the details on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> or by email and you'll get a quick quote; design jobs are usually quoted the same day.`
    }
  ];

  const topicIntents = [
    {
      keys: ["thank", "thanks", "appreciate"],
      html: "Anytime! Anything else I can help with — websites, design work, ordering or prices?"
    },
    {
      keys: ["catalog", "catalogue", "product", "item", "print", "printing", "flyer", "banner", "pull up", "pull-up", "frame", "abs board", "book design", "funeral"],
      html: `Browse every print &amp; design piece in our <a href="catalog.html">website catalog</a> — tap any item to see details and order right here. The catalog is also on <a href="${WA_CATALOG}" target="_blank" rel="noopener">WhatsApp</a>.`
    },
    {
      keys: ["graphic", "design", "logo", "brand", "branding", "poster", "card", "artwork"],
      html: `Our graphic design studio handles logos &amp; branding, flyers, banners, pull-up stands, frames, book covers and print-ready artwork. See samples in the <a href="catalog.html">catalog</a> and the full list on the <a href="services.html">services page</a>.`
    },
    {
      keys: ["website", "web site", "site", "web", "landing", "portfolio", "ecommerce", "e-commerce", "responsive", "domain", "hosting", "page"],
      html: `We build responsive business websites, landing pages, portfolios and web apps — fast, mobile-first and easy to maintain. Details on the <a href="services.html">services page</a>; tell me your idea here or on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a> for a quote.`
    },
    {
      keys: ["help", "what can you do", "assist", "options"],
      html: "I give quick answers on our website development and graphic design work: services, catalog items, prices, turnaround, ordering and how to reach the team. Try a button below."
    },
    {
      keys: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"],
      html: "Hello! Great to see you. Ask me anything about our website development or graphic design work — or tap a button below to get started."
    }
  ];

  const fallback = `I didn't quite catch that. I'm best at quick answers on <strong>website projects</strong> and <strong>graphic design work</strong> — services, catalog items, prices, turnaround, ordering. Or reach a human on <a href="${WA}" target="_blank" rel="noopener">WhatsApp</a>.`;

  const greeting = `Hi, I'm the BrownHub robotic assistant. I give quick replies on anything about our <strong>website development</strong> and <strong>graphic design</strong> work. What can I help with?`;

  const defaultChips = ["Website services", "Graphic design", "Catalog items", "Get a quote", "Talk to a human"];

  function bestOf(list, t) {
    let best = null, bestScore = 0;
    for (const intent of list) {
      const score = intent.keys.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
      if (score > bestScore) { best = intent; bestScore = score; }
    }
    return best;
  }

  function answer(text) {
    // Visitors may type (or we may prefill) in their own language: map known
    // translated strings back to their English source before keyword scoring.
    const src = (window.I18N && window.I18N.en) ? window.I18N.en(text) : text;
    const t = src.toLowerCase();
    const hit = bestOf(questionIntents, t) || bestOf(topicIntents, t);
    return hit ? hit.html : fallback;
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

  function send(text, routeAs) {    const clean = text.trim();
    if (!clean) return;
    addMsg(clean, "user");
    renderChips([]);
    const bubble = typingBubble();
    setTimeout(() => {
      bubble.remove();
      addMsg(answer(routeAs || clean), "bot");
      renderChips(defaultChips);
      focusInput();
    }, 550 + Math.random() * 450);
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
  let stream = null, recorder = null, chunks = [], blob = null;
  let timer = null, secs = 0, phase = "idle", transcript = "";

  function vhtml(h) { voiceBar.innerHTML = h; if (window.I18N && I18N.lang !== "en") I18N.translateNode(voiceBar); }
  function micLabel(t) { micBtn.setAttribute("aria-label", T(t)); }
  function stopSpeech() { if (recognition) try { recognition.stop(); } catch (e) {} }
  function cleanup() {
    if (timer) { clearInterval(timer); timer = null; }
    stopSpeech();
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
  }
  function showIdle() {
    phase = "idle"; blob = null; chunks = []; transcript = "";
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
        transcript = txt.trim();
        const el = document.getElementById("voiceTranscript");
        if (el) el.textContent = transcript || T("Listening…");
      };
      recognition.onerror = () => {};
      recognition.start();
    } catch (e) { recognition = null; }
  }

  function barStop() {
    vhtml('<span class="voice-dot" aria-hidden="true"></span><span class="voice-time">0:00</span><span class="voice-transcript" id="voiceTranscript">' + T("Listening…") + '</span><button type="button" class="btn btn--primary voice-btn" id="voiceStop">' + T("Stop") + "</button>");
    document.getElementById("voiceStop").addEventListener("click", stopRecording);
    micLabel("Stop recording");
  }
  function barReview() {
    phase = "review";
    vhtml('<audio controls preload="metadata" class="voice-audio" src="' + URL.createObjectURL(blob) + '"></audio><button type="button" class="btn btn--primary voice-btn" id="voiceSend">' + T("Send") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceRedo">' + T("Try again") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceCancel">' + T("Cancel") + "</button>");
    document.getElementById("voiceSend").addEventListener("click", sendVoice);
    document.getElementById("voiceRedo").addEventListener("click", () => { showIdle(); startRecording(); });
    document.getElementById("voiceCancel").addEventListener("click", showIdle);
    micLabel("Record a voice message");
  }
  function barSent() {
    phase = "sent";
    vhtml('<span class="voice-busy">' + T("Emailed — now send it on WhatsApp too") + '</span><button type="button" class="btn btn--primary voice-btn" id="voiceWa">' + T("Continue to WhatsApp") + '</button><button type="button" class="btn btn--ghost voice-btn" id="voiceDone">' + T("Done") + "</button>");
    document.getElementById("voiceWa").addEventListener("click", toWhatsApp);
    document.getElementById("voiceDone").addEventListener("click", showIdle);
  }
  function barBusy(msg) { vhtml('<span class="voice-busy">' + T(msg) + "</span>"); }
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
    let options = { mimeType: "audio/webm" };
    try {
      if (!MediaRecorder.isTypeSupported("audio/webm")) options = {};
      recorder = new MediaRecorder(stream, options);
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
    timer = setInterval(() => {
      secs += 1;
      const el = voiceBar.querySelector(".voice-time");
      if (el) el.textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
      if (secs >= 120) stopRecording();
    }, 1000);
    recorder.start(250);
  }

  function stopRecording() {
    if (timer) { clearInterval(timer); timer = null; }
    stopSpeech();
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function sendVoice() {
    if (!blob) return;
    phase = "sending";
    voiceBar.hidden = false;
    barBusy("Sending your voice message…");
    const fd = new FormData();
    fd.append("voice_note", new File([blob], "voice-message.webm", { type: blob.type || "audio/webm" }));
    fd.append("transcript", transcript || "(no automatic transcript)");
    fd.append("_subject", "Voice message from the BrownHub website");
    fd.append("page", location.href);
    fd.append("time", new Date().toISOString());
    fd.append("_captcha", "false");
    fd.append("_template", "table");
    try {
      const res = await fetch(VOICE_EMAIL, { method: "POST", body: fd });
      if (!res.ok) throw new Error(String(res.status));
      addMsg(transcript || T("Voice message"), "user");
      addMsg("Your voice message was sent to our team with the audio attached. We will reply to your email within some few minutes. Thank you! 🙏 😊", "bot");
      barSent();
    } catch (e) {
      phase = "review";
      barError("Could not send the voice message. Please try once more, or contact us on WhatsApp.");
    }
  }

  async function toWhatsApp() {
    const note = "Hello BrownHub! I sent a voice message from your website" +
      (transcript ? ". Transcript: " + transcript : "") +
      ". The audio was also emailed to the team. My page: " + location.href;
    try {
      if (blob && navigator.canShare) {
        const file = new File([blob], "brownhub-voice-message.webm", { type: blob.type || "audio/webm" });
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
    if (phase === "recording") stopRecording();
    else if (phase === "idle") startRecording();
  });
  if (!canRecord) {
    micBtn.disabled = true;
    micBtn.title = "Voice recording is not supported in this browser";
  }
})();
