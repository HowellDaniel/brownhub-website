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
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          const duration = 1200;
          const start = performance.now();
          const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            el.textContent = Math.round(target * progress);
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
  });

  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    // Allow browsers and password managers to recognize and safely offer saved details.
    contactForm.setAttribute("autocomplete", "on");
    const autocomplete = {
      name: "name",
      email: "email",
      company: "organization",
      message: "off"
    };
    Object.entries(autocomplete).forEach(([id, value]) => {
      const field = contactForm.querySelector(`#${id}`);
      if (field) field.setAttribute("autocomplete", value);
    });

    contactForm.action = "https://formsubmit.co/howelldaniel533@gmail.com";
    contactForm.method = "POST";
    contactForm.noValidate = false;

    const hiddenFields = {
      _subject: "New BrownHub website enquiry",
      _captcha: "false",
      _template: "table"
    };
    Object.entries(hiddenFields).forEach(([name, value]) => {
      if (contactForm.querySelector(`[name="${name}"]`)) return;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      contactForm.appendChild(input);
    });
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    const background = document.createElement("div");
    background.className = "interactive-background";
    background.setAttribute("aria-hidden", "true");
    document.body.prepend(background);

    const style = document.createElement("style");
    style.textContent = `
      .interactive-background { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; background: radial-gradient(circle at var(--pointer-x, 50%) var(--pointer-y, 35%), rgba(224, 138, 60, .14), transparent 28rem), radial-gradient(circle at 85% 15%, rgba(73, 126, 181, .12), transparent 24rem); }
      .interactive-background::before, .interactive-background::after { content: ""; position: absolute; width: 22rem; height: 22rem; border-radius: 50%; filter: blur(70px); opacity: .16; animation: brownhub-float 14s ease-in-out infinite alternate; }
      .interactive-background::before { left: 8%; top: 18%; background: #e08a3c; }
      .interactive-background::after { right: 8%; bottom: 12%; background: #477eb5; animation-delay: -6s; }
      @keyframes brownhub-float { from { transform: translate3d(-2rem, 1rem, 0) scale(.9); } to { transform: translate3d(2rem, -2rem, 0) scale(1.1); } }
      .hero__card { will-change: transform; }
      .hero__card--1 { animation: hero-card-float-one 5s ease-in-out infinite; }
      .hero__card--2 { animation: hero-card-float-two 6s ease-in-out -1.5s infinite; }
      .hero__card--3 { animation: hero-card-float-three 5.5s ease-in-out -3s infinite; }
      @keyframes hero-card-float-one { 0% { transform: translate3d(-18px, 10px, 0) rotate(-6deg); } 25% { transform: translate3d(20px, -8px, 0) rotate(2deg); } 50% { transform: translate3d(12px, -24px, 0) rotate(4deg); } 75% { transform: translate3d(-16px, -14px, 0) rotate(-2deg); } 100% { transform: translate3d(-18px, 10px, 0) rotate(-6deg); } }
      @keyframes hero-card-float-two { 0% { transform: translate3d(26px, -16px, 0) rotate(5deg); } 33% { transform: translate3d(-10px, -28px, 0) rotate(-2deg); } 66% { transform: translate3d(10px, 6px, 0) rotate(3deg); } 100% { transform: translate3d(26px, -16px, 0) rotate(5deg); } }
      @keyframes hero-card-float-three { 0% { transform: translate3d(-16px, -10px, 0) rotate(-3deg); } 25% { transform: translate3d(18px, -18px, 0) rotate(4deg); } 50% { transform: translate3d(28px, 8px, 0) rotate(0deg); } 75% { transform: translate3d(-8px, 10px, 0) rotate(-5deg); } 100% { transform: translate3d(-16px, -10px, 0) rotate(-3deg); } }
      @media (max-width: 700px) { .interactive-background::before, .interactive-background::after { width: 14rem; height: 14rem; filter: blur(50px); } }
    `;
    document.head.appendChild(style);

    let frame;
    document.addEventListener("pointermove", (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        background.style.setProperty("--pointer-x", `${(event.clientX / window.innerWidth) * 100}%`);
        background.style.setProperty("--pointer-y", `${(event.clientY / window.innerHeight) * 100}%`);
      });
    }, { passive: true });
  }
})();
