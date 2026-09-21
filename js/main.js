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

    // Voice dictation for the "Project details" box (where supported).
    const messageEl = document.getElementById("message");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (messageEl && SR) {
      const SR_LANGS = { en: "en-GH", fr: "fr-FR", es: "es-ES", pt: "pt-BR", ar: "ar-SA", zh: "zh-CN",
        de: "de-DE", nl: "nl-NL", it: "it-IT", ru: "ru-RU", hi: "hi-IN", sw: "sw-KE", tw: "ak-GH" };
      const dictBtn = document.createElement("button");
      dictBtn.type = "button";
      dictBtn.className = "msg-mic";
      dictBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>';
      const field = messageEl.closest(".form-field") || messageEl.parentNode;
      field.classList.add("form-field--voice");
      field.appendChild(dictBtn);
      const setAria = (k) => dictBtn.setAttribute("aria-label", (window.I18N && I18N.t) ? I18N.t(k) : k);
      setAria("Dictate your message");
      document.addEventListener("i18n-applied", () => { if (!rec) setAria("Dictate your message"); });
      let rec = null;
      dictBtn.addEventListener("click", () => {
        if (rec) { try { rec.stop(); } catch (e) {} return; }
        rec = new SR();
        rec.lang = SR_LANGS[(window.I18N && window.I18N.lang) || "en"] || "en-GH";
        rec.continuous = true;
        rec.interimResults = true;
        let base = messageEl.value;
        if (base && !/\s$/.test(base)) base += " ";
        const show = (final, interim) => {
          messageEl.value = base + final + (interim ? (final ? " " : "") + interim : "");
        };
        rec.onresult = (ev) => {
          let final = "", interim = "";
          for (const r of ev.results) { if (r.isFinal) final += r[0].transcript.trim() + " "; else interim += r[0].transcript; }
          show(final.trim(), interim);
        };
        const done = () => { rec = null; dictBtn.classList.remove("listening"); setAria("Dictate your message"); };
        rec.onend = done;
        rec.onerror = done;
        dictBtn.classList.add("listening");
        setAria("Stop dictating");
        try { rec.start(); } catch (e) { done(); }
      });
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
