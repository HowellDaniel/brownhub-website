(function () {
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", (e) => {
      if (e.target.matches(".nav__link")) {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const progress = Math.min((now - start) / 1200, 1);
          el.textContent = Math.round(target * progress);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    observer.observe(el);
  });

  // Add the brand explicitly in the navigation so it remains visible even if
  // the image has transparent space or the stylesheet has logo constraints.
  document.querySelectorAll(".site-header .nav__logo").forEach((brand) => {
    if (brand.querySelector(".brand-name")) return;
    const name = document.createElement("span");
    name.className = "brand-name";
    name.textContent = "BrownHub Studio";
    name.setAttribute("aria-hidden", "true");
    brand.appendChild(name);
  });

  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.autocomplete = "on";
    const fields = { name: "name", email: "email", company: "organization", message: "off" };
    Object.entries(fields).forEach(([id, value]) => {
      const field = contactForm.querySelector(`#${id}`);
      if (field) field.autocomplete = value;
    });
    const item = new URLSearchParams(location.search).get("item");
    if (item) {
      const message = document.getElementById("message");
      const service = document.getElementById("service");
      let auto = null;
      const tr = (s) => (window.I18N && I18N.t ? I18N.t(s) : s);
      const setPrefill = () => {
        if (message && (auto === null || message.value === auto)) {
          auto = tr("I'd like to order:") + " " + tr(item);
          message.value = auto;
        }
        if (service) service.value = "Graphic Designing";
      };
      setPrefill();
      document.addEventListener("i18n-applied", setPrefill);
    }

    const FORM_EMAIL = "https://formsubmit.co/ajax/howelldaniel533@gmail.com";
    const WA_NUMBER = "https://wa.me/233502954541";
    const status = document.getElementById("form-status");
    const submitBtn = contactForm.querySelector('button[type="submit"]');

    const addHidden = (name, value) => {
      let el = contactForm.querySelector(`input[name="${name}"]`);
      if (!el) {
        el = document.createElement("input");
        el.type = "hidden";
        el.name = name;
        contactForm.appendChild(el);
      }
      el.value = value;
    };

    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!status) return;
      // English only: the translate.js MutationObserver localises the card on insert.
      const data = Object.fromEntries(new FormData(contactForm).entries());
      submitBtn.disabled = true;
      status.innerHTML = '<span class="form-status-busy">Sending your message…</span>';
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => fd.append(k, v));
      fd.append("_subject", "New enquiry from the BrownHub website");
      fd.append("_captcha", "false");
      fd.append("_template", "table");
      fd.append("page", location.href);
      fd.append("time", new Date().toISOString());
      let sent = false;
      for (let attempt = 0; attempt < 2 && !sent; attempt++) {
        try {
          sent = (await fetch(FORM_EMAIL, { method: "POST", body: fd })).ok;
        } catch (err) { /* retry or fall through to the iframe POST */ }
        if (!sent && attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      }
      if (!sent) {
        // Some networks block fetch() to the email service but allow a plain
        // form POST; send it through a hidden iframe so the page never moves.
        addHidden("_subject", "New enquiry from the BrownHub website");
        addHidden("_captcha", "false");
        addHidden("_template", "table");
        addHidden("_next", new URL("index.html", location.href).href);
        addHidden("page", location.href);
        addHidden("time", new Date().toISOString());
        let frame = document.getElementById("form-email-frame");
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "form-email-frame";
          frame.name = "form-email-frame";
          frame.setAttribute("aria-hidden", "true");
          frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
          document.body.appendChild(frame);
        }
        contactForm.target = "form-email-frame";
        contactForm.submit();
        contactForm.removeAttribute("target");
      }
      contactForm.reset();
      const waText = "Hello BrownHub! I just sent this enquiry from your website:\n\n" +
        "Name: " + (data.name || "-") + "\nEmail: " + (data.email || "-") +
        (data.company ? "\nCompany: " + data.company : "") +
        (data.service ? "\nService: " + data.service : "") +
        (data.budget ? "\nBudget: " + data.budget : "") +
        "\n\n" + (data.message || "");
      status.innerHTML = '<div class="form-success"><div class="form-success__icon" aria-hidden="true">✓</div>' +
        "<strong>Message sent successfully!</strong>" +
        "<p>We'll get back to you within some few minutes. Thank you! 🙏 😊</p>" +
        '<div class="form-success__actions"><button type="button" class="btn btn--primary" id="wa-continue">Continue to WhatsApp</button>' +
        '<a class="btn btn--ghost" href="index.html">Back to home</a></div></div>';
      document.getElementById("wa-continue").addEventListener("click", () => {
        window.open(WA_NUMBER + "?text=" + encodeURIComponent(waText), "_blank", "noopener");
        location.href = "index.html";
      });
      submitBtn.disabled = false;
    });

    // Voice recorder for the "Project details" box: record / pause / listen back,
    // then the audio rides on this enquiry as a voice_note attachment.
    const messageEl = document.getElementById("message");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const SR_LANGS = { en: "en-GH", fr: "fr-FR", es: "es-ES", pt: "pt-BR", ar: "ar-SA", zh: "zh-CN",
      de: "de-DE", nl: "nl-NL", it: "it-IT", ru: "ru-RU", hi: "hi-IN", sw: "sw-KE", tw: "ak-GH" };
    if (messageEl) {
      const field = messageEl.closest(".form-field") || messageEl.parentNode;
      const T = (k) => (window.I18N && I18N.t ? I18N.t(k) : k);
      const canRec = !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const VOICE_MIME = canRec
        ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
            .find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || ""
        : "";
      const VOICE_EXT = VOICE_MIME.indexOf("mp4") > -1 ? "m4a" : VOICE_MIME.indexOf("ogg") > -1 ? "ogg" : "webm";
      const CAN_PAUSE = canRec && "pause" in MediaRecorder.prototype;

      const micBtn = document.createElement("button");
      micBtn.type = "button";
      micBtn.className = "msg-mic";
      micBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>';
      field.classList.add("form-field--voice");
      // The mic stays anchored to the textarea corner while the recorder bar sits below it.
      const wrap = document.createElement("div");
      wrap.className = "msg-wrap";
      field.insertBefore(wrap, messageEl);
      wrap.appendChild(messageEl);
      wrap.appendChild(micBtn);
      const bar = document.createElement("div");
      bar.className = "chat-widget__voice msg-voice";
      bar.hidden = true;
      field.appendChild(bar);
      const IDLE_LABEL = canRec ? "Record a voice message" : "Dictate your message";
      const setAria = (k) => micBtn.setAttribute("aria-label", T(k));
      const setListening = (on) => micBtn.classList.toggle("listening", !!on);
      setAria(IDLE_LABEL);
      document.addEventListener("i18n-applied", () => { if (phase === "idle") setAria(IDLE_LABEL); });

      // The recording is attached to the enquiry through this file input, which only
      // lives in the form while an audio clip is actually attached.
      const fileInp = document.createElement("input");
      fileInp.type = "file";
      fileInp.name = "voice_note";
      fileInp.hidden = true;
      fileInp.setAttribute("aria-hidden", "true");
      fileInp.tabIndex = -1;

      let stream = null, recorder = null, chunks = [], blob = null, url = null;
      let timer = null, secs = 0, phase = "idle";
      let audioCtx = null, analyser = null, meterRaf = 0, sr = null;

      const fmtTime = () => Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
      const METER_HTML = '<span class="voice-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
      function vhtml(h) { bar.innerHTML = h; bar.hidden = false; if (window.I18N && I18N.lang !== "en") I18N.translateNode(bar); }
      function freezeMeter() { if (meterRaf) { cancelAnimationFrame(meterRaf); meterRaf = 0; } }
      function stopMeter() { freezeMeter(); if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; analyser = null; } }
      function meterDraw() {
        if (!analyser) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          if (!analyser) return;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) { const d = (v - 128) / 128; sum += d * d; }
          const lvl = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
          bar.querySelectorAll(".voice-meter i").forEach((b, i) => {
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
      function stopSpeech() { if (sr) { try { sr.stop(); } catch (e) {} } }
      function startSpeech() {
        if (!SR) return;
        try {
          sr = new SR();
          sr.lang = SR_LANGS[(window.I18N && window.I18N.lang) || "en"] || "en-GH";
          sr.continuous = true;
          sr.interimResults = true;
          const base = messageEl.value;
          if (base && !/\s$/.test(base)) { messageEl.value = base + " "; }
          const prefix = messageEl.value;
          sr.onresult = (ev) => {
            let final = "", interim = "";
            for (const r of ev.results) { if (r.isFinal) final += r[0].transcript.trim() + " "; else interim += r[0].transcript; }
            messageEl.value = prefix + final.trim() + (interim ? (final ? " " : "") + interim : "");
          };
          sr.onerror = () => {};
          sr.onend = () => { sr = null; if (!canRec) { setListening(false); setAria(IDLE_LABEL); } };
          sr.start();
        } catch (e) { sr = null; }
      }
      function cleanup() {
        if (timer) { clearInterval(timer); timer = null; }
        stopSpeech();
        stopMeter();
        if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
      }
      function discard() {
        cleanup();
        blob = null; chunks = [];
        if (url) { URL.revokeObjectURL(url); url = null; }
        detachFile();
        phase = "idle";
        bar.hidden = true;
        bar.textContent = "";
        setListening(false);
        setAria(IDLE_LABEL);
      }
      function barError(msg) {
        phase = "review";
        vhtml('<span class="voice-error">' + T(msg) + '</span><button type="button" class="btn btn--ghost voice-btn" id="msgDismiss">' + T("Cancel") + "</button>");
        document.getElementById("msgDismiss").addEventListener("click", discard);
      }
      function recBar(paused) {
        vhtml('<span class="voice-dot' + (paused ? " voice-dot--paused" : "") + '" aria-hidden="true"></span><span class="voice-time">' + fmtTime() + "</span>" + METER_HTML +
          (paused
            ? '<button type="button" class="btn btn--primary voice-btn" id="msgResume">' + T("Resume") + '</button><button type="button" class="btn btn--ghost voice-btn" id="msgStop">' + T("Stop") + "</button>"
            : (CAN_PAUSE ? '<button type="button" class="btn btn--ghost voice-btn" id="msgPause">' + T("Pause") + "</button>" : "") + '<button type="button" class="btn btn--primary voice-btn" id="msgStop">' + T("Stop") + "</button>") +
          '<span class="voice-hint">' + T("Tap Stop when you're done") + "</span>");
        const p = document.getElementById("msgPause");
        if (p) p.addEventListener("click", pauseRecording);
        const rz = document.getElementById("msgResume");
        if (rz) rz.addEventListener("click", resumeRecording);
        document.getElementById("msgStop").addEventListener("click", stopRecording);
        setListening(!paused);
        setAria("Stop recording");
      }
      function tickTimer() {
        timer = setInterval(() => {
          secs += 1;
          const el = bar.querySelector(".voice-time");
          if (el) el.textContent = fmtTime();
        }, 1000);
      }
      function barReview() {
        phase = "review";
        url = URL.createObjectURL(blob);
        vhtml('<span class="voice-hint voice-hint--top">' + T("Listen it back, then tap Send") + '</span><audio controls preload="metadata" class="voice-audio" src="' + url + '"></audio><button type="button" class="btn btn--primary voice-btn" id="msgAttach">' + T("Done") + '</button><button type="button" class="btn btn--ghost voice-btn" id="msgRedo">' + T("Try again") + '</button><button type="button" class="btn btn--ghost voice-btn" id="msgCancel">' + T("Cancel") + "</button>");
        document.getElementById("msgAttach").addEventListener("click", barAttached);
        document.getElementById("msgRedo").addEventListener("click", () => { discard(); startRecording(); });
        document.getElementById("msgCancel").addEventListener("click", () => { const keep = messageEl.value; discard(); messageEl.value = keep; });
        setListening(false);
        setAria(IDLE_LABEL);
      }
      function barAttached() {
        phase = "attached";
        attachFile();
        vhtml('<span class="voice-busy">' + T("Voice attached to your enquiry") + '</span><audio controls preload="metadata" class="voice-audio" src="' + url + '"></audio>' +
          '<a class="btn btn--ghost voice-btn" download="brownhub-voice-message.' + VOICE_EXT + '" href="' + url + '">' + T("Download audio") + '</a><button type="button" class="btn btn--ghost voice-btn" id="msgRemove">' + T("Remove") + "</button>");
        document.getElementById("msgRemove").addEventListener("click", () => { const keep = messageEl.value; discard(); messageEl.value = keep; });
        setListening(false);
        setAria(IDLE_LABEL);
      }
      function attachFile() {
        if (!blob) return;
        try {
          const file = new File([blob], "project-details-voice." + VOICE_EXT, { type: blob.type || VOICE_MIME || "audio/webm" });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInp.files = dt.files;
          if (fileInp.parentNode !== contactForm) contactForm.appendChild(fileInp);
          contactForm.enctype = "multipart/form-data";
        } catch (e) { detachFile(); /* DataTransfer unsupported — the enquiry still sends without audio */ }
      }
      function detachFile() {
        fileInp.value = "";
        if (fileInp.parentNode) fileInp.parentNode.removeChild(fileInp);
        contactForm.enctype = "application/x-www-form-urlencoded";
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
        try { recorder = new MediaRecorder(stream, VOICE_MIME ? { mimeType: VOICE_MIME } : {}); }
        catch (e) { recorder = new MediaRecorder(stream); }
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
        secs = 0;
        phase = "recording";
        recBar(false);
        startSpeech();
        startMeter();
        tickTimer();
        recorder.start(250);
      }
      function pauseRecording() {
        if (!recorder || recorder.state !== "recording") return;
        try { recorder.pause(); } catch (e) { return; }
        phase = "paused";
        if (timer) { clearInterval(timer); timer = null; }
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
      function stopRecording() {
        if (timer) { clearInterval(timer); timer = null; }
        stopSpeech();
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }
      micBtn.addEventListener("click", () => {
        if (!canRec) {
          if (!SR) return;
          if (sr) { stopSpeech(); return; }
          startSpeech();
          setListening(true);
          setAria("Stop dictating");
          return;
        }
        if (phase === "recording" || phase === "paused") { stopRecording(); return; }
        discard();
        startRecording();
      });
      contactForm.addEventListener("reset", () => { if (phase !== "idle") discard(); });
      if (!canRec && !SR) micBtn.hidden = true;
    }
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    const background = document.createElement("div");
    background.className = "interactive-background";
    background.setAttribute("aria-hidden", "true");
    document.body.prepend(background);

    const style = document.createElement("style");
    style.textContent = `
      .interactive-background { position:fixed; inset:0; z-index:-1; pointer-events:none; overflow:hidden; background:radial-gradient(circle at var(--pointer-x,50%) var(--pointer-y,35%),rgba(224,138,60,.14),transparent 28rem),radial-gradient(circle at 85% 15%,rgba(73,126,181,.12),transparent 24rem); }
      .interactive-background::before,.interactive-background::after { content:""; position:absolute; width:22rem; height:22rem; border-radius:50%; filter:blur(70px); opacity:.16; animation:brownhub-float 14s ease-in-out infinite alternate; }
      .interactive-background::before { left:8%; top:18%; background:#e08a3c; }
      .interactive-background::after { right:8%; bottom:12%; background:#477eb5; animation-delay:-6s; }
      @keyframes brownhub-float { from { transform:translate3d(-2rem,1rem,0) scale(.9); } to { transform:translate3d(2rem,-2rem,0) scale(1.1); } }
      .hero__card { will-change:transform; }
      .hero__card--1 { animation:hero-card-float-one 5s ease-in-out infinite; }
      .hero__card--2 { animation:hero-card-float-two 6s ease-in-out -1.5s infinite; }
      .hero__card--3 { animation:hero-card-float-three 5.5s ease-in-out -3s infinite; }
      @keyframes hero-card-float-one { 0% { transform:translate3d(-18px,10px,0) rotate(-6deg); } 25% { transform:translate3d(20px,-8px,0) rotate(2deg); } 50% { transform:translate3d(12px,-24px,0) rotate(4deg); } 75% { transform:translate3d(-16px,-14px,0) rotate(-2deg); } 100% { transform:translate3d(-18px,10px,0) rotate(-6deg); } }
      @keyframes hero-card-float-two { 0% { transform:translate3d(26px,-16px,0) rotate(5deg); } 33% { transform:translate3d(-10px,-28px,0) rotate(-2deg); } 66% { transform:translate3d(10px,6px,0) rotate(3deg); } 100% { transform:translate3d(26px,-16px,0) rotate(5deg); } }
      @keyframes hero-card-float-three { 0% { transform:translate3d(-16px,-10px,0) rotate(-3deg); } 25% { transform:translate3d(18px,-18px,0) rotate(4deg); } 50% { transform:translate3d(28px,8px,0) rotate(0deg); } 75% { transform:translate3d(-8px,10px,0) rotate(-5deg); } 100% { transform:translate3d(-16px,-10px,0) rotate(-3deg); } }
      @media (max-width:700px) { .interactive-background::before,.interactive-background::after { width:14rem; height:14rem; filter:blur(50px); } }
    `;
    document.head.appendChild(style);

    let frame;
    document.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        background.style.setProperty("--pointer-x", `${event.clientX / window.innerWidth * 100}%`);
        background.style.setProperty("--pointer-y", `${event.clientY / window.innerHeight * 100}%`);
      });
    }, { passive: true });
  }
})();
